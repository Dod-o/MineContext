import datetime
import importlib.util
import asyncio
from pathlib import Path
import sys
import types
import unittest


_PATCHED_MODULES = {}


def _install_fake_module(name, module):
    if name not in _PATCHED_MODULES:
        _PATCHED_MODULES[name] = sys.modules.get(name)
    sys.modules[name] = module


def _restore_fake_modules():
    for name, original in reversed(_PATCHED_MODULES.items()):
        if original is None:
            sys.modules.pop(name, None)
        else:
            sys.modules[name] = original


fake_vlm_client = types.ModuleType("opencontext.llm.global_vlm_client")
fake_vlm_client.generate_with_messages_async = None
fake_vlm_client.generate_with_messages = None
fake_vlm_client.get_prompt_model_profile = lambda *_args, **_kwargs: None
_install_fake_module("opencontext.llm.global_vlm_client", fake_vlm_client)

fake_debug_helper = types.ModuleType("opencontext.context_consumption.generation.debug_helper")


class _FakeDebugHelper:
    calls = []

    @classmethod
    def save_generation_debug(cls, **kwargs):
        cls.calls.append(kwargs)


fake_debug_helper.DebugHelper = _FakeDebugHelper
_install_fake_module("opencontext.context_consumption.generation.debug_helper", fake_debug_helper)

fake_tool_definitions = types.ModuleType("opencontext.tools.tool_definitions")
fake_tool_definitions.ALL_TOOL_DEFINITIONS = []
_install_fake_module("opencontext.tools.tool_definitions", fake_tool_definitions)

fake_tools_executor = types.ModuleType("opencontext.tools.tools_executor")


class _FakeToolsExecutor:
    pass


fake_tools_executor.ToolsExecutor = _FakeToolsExecutor
_install_fake_module("opencontext.tools.tools_executor", fake_tools_executor)

module_path = (
    Path(__file__).resolve().parents[1]
    / "opencontext"
    / "context_consumption"
    / "generation"
    / "generation_report.py"
)
spec = importlib.util.spec_from_file_location("generation_report_for_test", module_path)
generation_report_module = importlib.util.module_from_spec(spec)
assert spec and spec.loader
spec.loader.exec_module(generation_report_module)
_restore_fake_modules()
ReportGenerator = generation_report_module.ReportGenerator
NO_ACTIVITY_REPORT = generation_report_module.NO_ACTIVITY_REPORT


class _EmptyReportStorage:
    def get_all_processed_contexts(self, *args, **kwargs):
        return {}

    def get_tips(self, *args, **kwargs):
        return []

    def get_todos(self, *args, **kwargs):
        return []

    def get_activities(self, *args, **kwargs):
        return []


class _TimelineReportStorage(_EmptyReportStorage):
    def get_activities(self, *args, **kwargs):
        return [
            {
                "id": 2,
                "title": "Write: docs [draft]",
                "content": "",
                "start_time": datetime.datetime(2026, 5, 19, 10, 0, 0),
                "end_time": datetime.datetime(2026, 5, 19, 10, 45, 0),
            },
            {
                "id": 1,
                "title": "Plan work",
                "content": "",
                "start_time": "2026-05-19 09:00:00",
                "end_time": "2026-05-19 09:30:00",
            },
        ]


class ReportGeneratorTest(unittest.TestCase):
    def test_daily_report_title_uses_start_time_date(self):
        generator = ReportGenerator.__new__(ReportGenerator)
        start_time = int(datetime.datetime(2026, 5, 19, 0, 0, 0).timestamp())
        end_time = int(datetime.datetime(2026, 5, 20, 0, 0, 0).timestamp())

        self.assertEqual(
            generator._build_daily_report_title(start_time),
            "Daily Report - 2026-05-19",
        )
        self.assertNotIn(
            datetime.datetime.fromtimestamp(end_time).strftime("%Y-%m-%d"),
            generator._build_daily_report_title(start_time),
        )

    def test_no_activity_report_message_is_stable(self):
        self.assertEqual(
            NO_ACTIVITY_REPORT,
            "No activity data available for the specified time range.",
        )

    def test_generate_report_does_not_persist_empty_daily_report(self):
        class _NoActivityReportGenerator(ReportGenerator):
            async def _generate_report_with_llm(self, *_args):
                return NO_ACTIVITY_REPORT

        generator = _NoActivityReportGenerator.__new__(_NoActivityReportGenerator)

        self.assertEqual(asyncio.run(generator.generate_report(1, 2)), NO_ACTIVITY_REPORT)

    def test_empty_report_chunk_skips_llm_generation(self):
        calls = []

        async def fake_generate_with_messages_async(messages):
            calls.append(messages)
            return "unexpected report"

        generator = ReportGenerator.__new__(ReportGenerator)
        original_get_storage = generation_report_module.get_storage
        original_get_prompt_group = generation_report_module.get_prompt_group
        original_generate = generation_report_module.generate_with_messages_async

        try:
            generation_report_module.get_storage = lambda: _EmptyReportStorage()
            generation_report_module.get_prompt_group = lambda _name: {"system": "", "user": ""}
            generation_report_module.generate_with_messages_async = fake_generate_with_messages_async

            result = asyncio.run(generator._process_single_chunk_async(1, 2))
        finally:
            generation_report_module.get_storage = original_get_storage
            generation_report_module.get_prompt_group = original_get_prompt_group
            generation_report_module.generate_with_messages_async = original_generate

        self.assertIsNone(result)
        self.assertEqual(calls, [])

    def test_activity_timeline_section_uses_sorted_activity_records(self):
        generator = ReportGenerator.__new__(ReportGenerator)
        start_time = int(datetime.datetime(2026, 5, 19, 0, 0, 0).timestamp())
        end_time = int(datetime.datetime(2026, 5, 20, 0, 0, 0).timestamp())
        original_get_storage = generation_report_module.get_storage

        try:
            generation_report_module.get_storage = lambda: _TimelineReportStorage()

            section = generator._build_activity_timeline_section(start_time, end_time)
        finally:
            generation_report_module.get_storage = original_get_storage

        self.assertTrue(section.startswith("## Activity Timeline"))
        self.assertIn("```mermaid", section)
        self.assertIn("timeline", section)
        self.assertIn("title Activity Timeline - 2026-05-19", section)
        self.assertIn("09:00-09:30 : Plan work", section)
        self.assertIn("10:00-10:45 : Write - docs (draft)", section)
        self.assertLess(section.index("09:00-09:30"), section.index("10:00-10:45"))

    def test_generate_report_inserts_activity_timeline_after_title(self):
        class _TimelineReportGenerator(ReportGenerator):
            async def _process_chunks_concurrently(self, start_time, end_time):
                return [
                    {
                        "start_time": start_time,
                        "end_time": end_time,
                        "summary": "Hourly activity summary",
                    }
                ]

        async def fake_generate_with_messages_async(_messages, **_kwargs):
            return "# Activity Report\n\n## Overview\nReport body"

        generator = _TimelineReportGenerator.__new__(_TimelineReportGenerator)
        start_time = int(datetime.datetime(2026, 5, 19, 0, 0, 0).timestamp())
        end_time = int(datetime.datetime(2026, 5, 20, 0, 0, 0).timestamp())
        original_get_storage = generation_report_module.get_storage
        original_get_prompt_group = generation_report_module.get_prompt_group
        original_generate = generation_report_module.generate_with_messages_async

        try:
            generation_report_module.get_storage = lambda: _TimelineReportStorage()
            generation_report_module.get_prompt_group = lambda _name: {
                "system": "",
                "user": "{start_time_str} {end_time_str} {hourly_summaries}",
            }
            generation_report_module.generate_with_messages_async = fake_generate_with_messages_async

            result = asyncio.run(generator._generate_report_with_llm(start_time, end_time))
        finally:
            generation_report_module.get_storage = original_get_storage
            generation_report_module.get_prompt_group = original_get_prompt_group
            generation_report_module.generate_with_messages_async = original_generate

        self.assertTrue(result.startswith("# Activity Report\n\n## Activity Timeline"))
        self.assertIn("```mermaid", result)
        self.assertLess(result.index("## Activity Timeline"), result.index("## Overview"))


if __name__ == "__main__":
    unittest.main()

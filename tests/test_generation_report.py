import datetime
import importlib.util
import asyncio
from pathlib import Path
import sys
import types
import unittest


fake_vlm_client = types.ModuleType("opencontext.llm.global_vlm_client")
fake_vlm_client.generate_with_messages_async = None
fake_vlm_client.generate_with_messages = None
sys.modules.setdefault("opencontext.llm.global_vlm_client", fake_vlm_client)

fake_debug_helper = types.ModuleType("opencontext.context_consumption.generation.debug_helper")


class _FakeDebugHelper:
    pass


fake_debug_helper.DebugHelper = _FakeDebugHelper
sys.modules.setdefault("opencontext.context_consumption.generation.debug_helper", fake_debug_helper)

fake_tool_definitions = types.ModuleType("opencontext.tools.tool_definitions")
fake_tool_definitions.ALL_TOOL_DEFINITIONS = []
sys.modules.setdefault("opencontext.tools.tool_definitions", fake_tool_definitions)

fake_tools_executor = types.ModuleType("opencontext.tools.tools_executor")


class _FakeToolsExecutor:
    pass


fake_tools_executor.ToolsExecutor = _FakeToolsExecutor
sys.modules.setdefault("opencontext.tools.tools_executor", fake_tools_executor)

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


if __name__ == "__main__":
    unittest.main()

import datetime
import importlib.util
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


class ReportGeneratorTest(unittest.TestCase):
    def test_daily_report_title_uses_start_time_date(self):
        generator = ReportGenerator.__new__(ReportGenerator)
        start_time = int(datetime.datetime(2026, 5, 19, 0, 0, 0).timestamp())

        self.assertEqual(
            generator._build_daily_report_title(start_time),
            "Daily Report - 2026-05-19",
        )


if __name__ == "__main__":
    unittest.main()

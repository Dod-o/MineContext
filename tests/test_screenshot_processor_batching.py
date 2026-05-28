import importlib.util
import sys
import types
import unittest
from pathlib import Path


fake_processing_pkg = types.ModuleType("opencontext.context_processing")
fake_processing_pkg.__path__ = []
sys.modules.setdefault("opencontext.context_processing", fake_processing_pkg)

fake_processor_pkg = types.ModuleType("opencontext.context_processing.processor")
fake_processor_pkg.__path__ = []
sys.modules.setdefault("opencontext.context_processing.processor", fake_processor_pkg)

fake_base_processor = types.ModuleType("opencontext.context_processing.processor.base_processor")
fake_base_processor.BaseContextProcessor = type(
    "BaseContextProcessor",
    (),
    {"__init__": lambda self, config=None: setattr(self, "config", config or {})},
)
sys.modules.setdefault(fake_base_processor.__name__, fake_base_processor)

fake_entity_processor = types.ModuleType("opencontext.context_processing.processor.entity_processor")
fake_entity_processor.refresh_entities = None
fake_entity_processor.validate_and_clean_entities = lambda entities: entities
sys.modules.setdefault(fake_entity_processor.__name__, fake_entity_processor)

fake_llm_pkg = types.ModuleType("opencontext.llm")
fake_llm_pkg.__path__ = []
sys.modules.setdefault("opencontext.llm", fake_llm_pkg)

fake_embedding_client = types.ModuleType("opencontext.llm.global_embedding_client")
fake_embedding_client.do_vectorize_async = None
sys.modules.setdefault(fake_embedding_client.__name__, fake_embedding_client)

fake_vlm_client = types.ModuleType("opencontext.llm.global_vlm_client")
fake_vlm_client.generate_with_messages_async = None
sys.modules.setdefault(fake_vlm_client.__name__, fake_vlm_client)

fake_storage = types.ModuleType("opencontext.storage.global_storage")
fake_storage.get_storage = lambda: None
sys.modules.setdefault(fake_storage.__name__, fake_storage)

fake_tools_pkg = types.ModuleType("opencontext.tools")
fake_tools_pkg.__path__ = []
sys.modules.setdefault("opencontext.tools", fake_tools_pkg)

fake_tool_definitions = types.ModuleType("opencontext.tools.tool_definitions")
fake_tool_definitions.ALL_TOOL_DEFINITIONS = []
sys.modules.setdefault(fake_tool_definitions.__name__, fake_tool_definitions)

fake_json_parser = types.ModuleType("opencontext.utils.json_parser")
fake_json_parser.parse_json_from_response = lambda response: {}
sys.modules.setdefault(fake_json_parser.__name__, fake_json_parser)

module_path = (
    Path(__file__).resolve().parents[1]
    / "opencontext"
    / "context_processing"
    / "processor"
    / "screenshot_processor.py"
)
spec = importlib.util.spec_from_file_location("screenshot_processor_for_test", module_path)
screenshot_processor_module = importlib.util.module_from_spec(spec)
assert spec and spec.loader
spec.loader.exec_module(screenshot_processor_module)
ScreenshotProcessor = screenshot_processor_module.ScreenshotProcessor


class ScreenshotProcessorBatchingTest(unittest.TestCase):
    def _build_processor(self):
        processor = ScreenshotProcessor.__new__(ScreenshotProcessor)
        processor._batch_size = 3
        processor._batch_timeout = 10
        return processor

    def test_batch_flushes_at_size_limit(self):
        processor = self._build_processor()

        self.assertTrue(processor._should_process_batch(3, 100.0, 101.0))

    def test_batch_waits_before_timeout(self):
        processor = self._build_processor()

        self.assertFalse(processor._should_process_batch(1, 100.0, 109.9))

    def test_batch_flushes_after_timeout(self):
        processor = self._build_processor()

        self.assertTrue(processor._should_process_batch(1, 100.0, 110.0))


if __name__ == "__main__":
    unittest.main()

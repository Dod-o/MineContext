import importlib.util
import sys
import types
import unittest
from datetime import datetime, timedelta
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
ContentFormat = screenshot_processor_module.ContentFormat
ContextProperties = screenshot_processor_module.ContextProperties
ContextSource = screenshot_processor_module.ContextSource
ContextType = screenshot_processor_module.ContextType
ExtractedData = screenshot_processor_module.ExtractedData
ProcessedContext = screenshot_processor_module.ProcessedContext
RawContextProperties = screenshot_processor_module.RawContextProperties
Vectorize = screenshot_processor_module.Vectorize


class ScreenshotProcessorBatchingTest(unittest.TestCase):
    def _build_processor(self):
        processor = ScreenshotProcessor.__new__(ScreenshotProcessor)
        processor._batch_size = 3
        processor._batch_timeout = 10
        processor._max_raw_properties = 2
        processor._max_cached_contexts_per_type = 2
        return processor

    def _raw_context(self, index: int):
        return RawContextProperties(
            source=ContextSource.SCREENSHOT,
            content_format=ContentFormat.IMAGE,
            content_path=f"screenshot-{index}.png",
            create_time=datetime(2026, 1, 1) + timedelta(seconds=index),
        )

    def _processed_context(self, index: int):
        event_time = datetime(2026, 1, 1) + timedelta(seconds=index)
        return ProcessedContext(
            properties=ContextProperties(
                raw_properties=[self._raw_context(index)],
                create_time=event_time,
                update_time=event_time,
                event_time=event_time,
            ),
            extracted_data=ExtractedData(
                title=f"context {index}",
                summary="summary",
                context_type=ContextType.ACTIVITY_CONTEXT,
            ),
            vectorize=Vectorize(content_format=ContentFormat.TEXT, text="summary"),
        )

    def test_batch_flushes_at_size_limit(self):
        processor = self._build_processor()

        self.assertTrue(processor._should_process_batch(3, 100.0, 101.0))

    def test_batch_waits_before_timeout(self):
        processor = self._build_processor()

        self.assertFalse(processor._should_process_batch(1, 100.0, 109.9))

    def test_batch_flushes_after_timeout(self):
        processor = self._build_processor()

        self.assertTrue(processor._should_process_batch(1, 100.0, 110.0))

    def test_trim_raw_properties_keeps_recent_entries(self):
        processor = self._build_processor()
        raw_contexts = [self._raw_context(index) for index in range(4)]

        trimmed = processor._trim_raw_properties(raw_contexts)

        self.assertEqual([item.content_path for item in trimmed], ["screenshot-2.png", "screenshot-3.png"])

    def test_trim_processed_cache_keeps_newest_contexts(self):
        processor = self._build_processor()
        contexts = [self._processed_context(index) for index in range(4)]
        context_cache = {context.id: context for context in contexts}

        trimmed = processor._trim_processed_cache(context_cache)

        self.assertEqual(len(trimmed), 2)
        self.assertEqual(
            [context.extracted_data.title for context in trimmed.values()],
            ["context 2", "context 3"],
        )


if __name__ == "__main__":
    unittest.main()

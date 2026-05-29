import importlib.util
import asyncio
import os
import sys
import tempfile
import types
import unittest
from datetime import datetime, timedelta
from pathlib import Path


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

fake_base_processor = types.ModuleType("opencontext.context_processing.processor.base_processor")
fake_base_processor.BaseContextProcessor = type(
    "BaseContextProcessor",
    (),
    {"__init__": lambda self, config=None: setattr(self, "config", config or {})},
)
_install_fake_module(fake_base_processor.__name__, fake_base_processor)

fake_entity_processor = types.ModuleType("opencontext.context_processing.processor.entity_processor")
fake_entity_processor.refresh_entities = None
fake_entity_processor.validate_and_clean_entities = lambda entities: entities
_install_fake_module(fake_entity_processor.__name__, fake_entity_processor)

fake_embedding_client = types.ModuleType("opencontext.llm.global_embedding_client")
fake_embedding_client.do_vectorize_async = None
_install_fake_module(fake_embedding_client.__name__, fake_embedding_client)

fake_vlm_client = types.ModuleType("opencontext.llm.global_vlm_client")
fake_vlm_client.generate_with_messages_async = None
_install_fake_module(fake_vlm_client.__name__, fake_vlm_client)

fake_storage = types.ModuleType("opencontext.storage.global_storage")
fake_storage.get_storage = lambda: None
_install_fake_module(fake_storage.__name__, fake_storage)

fake_tool_definitions = types.ModuleType("opencontext.tools.tool_definitions")
fake_tool_definitions.ALL_TOOL_DEFINITIONS = []
_install_fake_module(fake_tool_definitions.__name__, fake_tool_definitions)

fake_json_parser = types.ModuleType("opencontext.utils.json_parser")
fake_json_parser.parse_json_from_response = lambda response: {}
_install_fake_module(fake_json_parser.__name__, fake_json_parser)

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
_restore_fake_modules()
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
        processor._delete_after_processing = False
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

    def test_semantic_only_cleanup_strips_paths_after_processing(self):
        processor = self._build_processor()
        processor._delete_after_processing = True
        tmp_file = tempfile.NamedTemporaryFile(delete=False)
        try:
            tmp_file.write(b"processed-image")
            tmp_file.close()
            context = self._processed_context(1)
            context.properties.raw_properties[0].content_path = tmp_file.name

            image_paths = processor._strip_processed_image_paths([context])
            processor._delete_processed_image_files(image_paths)

            self.assertEqual(image_paths, [tmp_file.name])
            self.assertIsNone(context.properties.raw_properties[0].content_path)
            self.assertEqual(
                context.properties.raw_properties[0].additional_info["image_retained"],
                False,
            )
            self.assertFalse(os.path.exists(tmp_file.name))
        finally:
            if os.path.exists(tmp_file.name):
                os.unlink(tmp_file.name)

    def test_batch_process_records_empty_vlm_outputs_as_failures(self):
        processor = self._build_processor()
        raw_contexts = [self._raw_context(1), self._raw_context(2)]
        recorded_stats = []
        recorded_errors = []

        async def fake_process_vlm_single(_raw_context):
            return []

        original_increment = screenshot_processor_module.increment_recording_stat
        original_record_error = screenshot_processor_module.record_processing_error
        try:
            processor._process_vlm_single = fake_process_vlm_single
            screenshot_processor_module.increment_recording_stat = (
                lambda stat_type, count=1: recorded_stats.append((stat_type, count))
            )
            screenshot_processor_module.record_processing_error = (
                lambda error_msg, processor_name, context_count=1: recorded_errors.append(
                    (error_msg, processor_name, context_count)
                )
            )

            result = asyncio.run(processor.batch_process(raw_contexts))
        finally:
            screenshot_processor_module.increment_recording_stat = original_increment
            screenshot_processor_module.record_processing_error = original_record_error

        self.assertEqual(result, [])
        self.assertEqual(recorded_stats, [("failed", 2)])
        self.assertEqual(recorded_errors[0][1:], ("screenshot_processor", 2))
        self.assertIn("No contexts extracted", recorded_errors[0][0])

    def test_processing_loop_drops_failed_batches_and_continues_after_backoff(self):
        source = module_path.read_text(encoding="utf-8")

        self.assertIn('record_processing_error(\n                    error_msg', source)
        self.assertIn('increment_recording_stat("failed", len(unprocessed_contexts))', source)
        self.assertIn("failed_count = len(unprocessed_contexts)", source)
        self.assertIn("unprocessed_contexts.clear()", source)
        self.assertIn("backoff_seconds = min(60, 2 ** min(consecutive_failures, 5))", source)
        self.assertIn("self._stop_event.wait(backoff_seconds)", source)
        self.assertIn("continue", source)

    def test_vlm_response_accepts_root_list_and_skips_invalid_items(self):
        processor = self._build_processor()

        original_generate = screenshot_processor_module.generate_with_messages_async
        original_parser = screenshot_processor_module.parse_json_from_response
        original_prompt_group = screenshot_processor_module.get_prompt_group
        original_descriptions = screenshot_processor_module.get_context_type_descriptions_for_extraction

        async def fake_generate(_messages):
            return "ignored"

        screenshot_processor_module.generate_with_messages_async = fake_generate
        screenshot_processor_module.parse_json_from_response = lambda _response: [
            ["unexpected-list"],
            {
                "context_type": "activity_context",
                "title": "usable item",
                "summary": "created from a root-list response",
            },
        ]
        screenshot_processor_module.get_prompt_group = lambda _name: {
            "system": "{context_type_descriptions}",
            "user": "{current_date} {current_timestamp} {current_timezone}",
        }
        screenshot_processor_module.get_context_type_descriptions_for_extraction = lambda: ""

        tmp_file = tempfile.NamedTemporaryFile(delete=False)
        try:
            tmp_file.write(b"not-a-real-image-but-readable")
            tmp_file.close()
            raw_context = self._raw_context(1)
            raw_context.content_path = tmp_file.name

            result = asyncio.run(processor._process_vlm_single(raw_context))

            self.assertEqual(len(result), 1)
            self.assertEqual(result[0].extracted_data.title, "usable item")
        finally:
            screenshot_processor_module.generate_with_messages_async = original_generate
            screenshot_processor_module.parse_json_from_response = original_parser
            screenshot_processor_module.get_prompt_group = original_prompt_group
            screenshot_processor_module.get_context_type_descriptions_for_extraction = original_descriptions
            os.unlink(tmp_file.name)

    def test_merge_response_preserves_unhandled_new_items(self):
        processor = self._build_processor()
        processor._processed_cache = {}
        context = self._processed_context(1)

        original_generate = screenshot_processor_module.generate_with_messages_async
        original_parser = screenshot_processor_module.parse_json_from_response
        original_prompt_group = screenshot_processor_module.get_prompt_group
        original_vectorize = screenshot_processor_module.do_vectorize_async
        original_refresh = screenshot_processor_module.refresh_entities

        async def fake_generate(_messages):
            return "ignored"

        async def fake_vectorize(vectorize):
            vectorize.vector = [0.1, 0.2]
            return vectorize

        async def fake_refresh(_entities, _text):
            return []

        screenshot_processor_module.generate_with_messages_async = fake_generate
        screenshot_processor_module.parse_json_from_response = lambda _response: {
            "items": [
                ["unexpected-list"],
                {"merge_type": "merged", "merged_ids": "not-a-list", "data": []},
            ]
        }
        screenshot_processor_module.get_prompt_group = lambda _name: {
            "system": "system",
            "user": "{context_type} {items_json}",
        }
        screenshot_processor_module.do_vectorize_async = fake_vectorize
        screenshot_processor_module.refresh_entities = fake_refresh

        try:
            result = asyncio.run(
                processor._merge_items_with_llm(
                    ContextType.ACTIVITY_CONTEXT,
                    [context],
                    [],
                )
            )

            self.assertEqual([item.id for item in result["processed_contexts"]], [context.id])
            self.assertEqual(list(result["new_ctxs"].keys()), [context.id])
        finally:
            screenshot_processor_module.generate_with_messages_async = original_generate
            screenshot_processor_module.parse_json_from_response = original_parser
            screenshot_processor_module.get_prompt_group = original_prompt_group
            screenshot_processor_module.do_vectorize_async = original_vectorize
            screenshot_processor_module.refresh_entities = original_refresh

    def test_merge_response_accepts_root_list(self):
        processor = self._build_processor()
        processor._processed_cache = {}
        context = self._processed_context(1)

        original_generate = screenshot_processor_module.generate_with_messages_async
        original_parser = screenshot_processor_module.parse_json_from_response
        original_prompt_group = screenshot_processor_module.get_prompt_group
        original_vectorize = screenshot_processor_module.do_vectorize_async
        original_refresh = screenshot_processor_module.refresh_entities

        async def fake_generate(_messages):
            return "ignored"

        async def fake_vectorize(vectorize):
            vectorize.vector = [0.1, 0.2]
            return vectorize

        async def fake_refresh(_entities, _text):
            return []

        screenshot_processor_module.generate_with_messages_async = fake_generate
        screenshot_processor_module.parse_json_from_response = lambda _response: [
            {"merge_type": "new", "merged_ids": [context.id], "data": {}}
        ]
        screenshot_processor_module.get_prompt_group = lambda _name: {
            "system": "system",
            "user": "{context_type} {items_json}",
        }
        screenshot_processor_module.do_vectorize_async = fake_vectorize
        screenshot_processor_module.refresh_entities = fake_refresh

        try:
            result = asyncio.run(
                processor._merge_items_with_llm(
                    ContextType.ACTIVITY_CONTEXT,
                    [context],
                    [],
                )
            )

            self.assertEqual([item.id for item in result["processed_contexts"]], [context.id])
            self.assertEqual(list(result["new_ctxs"].keys()), [context.id])
        finally:
            screenshot_processor_module.generate_with_messages_async = original_generate
            screenshot_processor_module.parse_json_from_response = original_parser
            screenshot_processor_module.get_prompt_group = original_prompt_group
            screenshot_processor_module.do_vectorize_async = original_vectorize
            screenshot_processor_module.refresh_entities = original_refresh


if __name__ == "__main__":
    unittest.main()

import asyncio
import importlib
import sys
import types
import unittest
from types import SimpleNamespace
from unittest.mock import patch


def _response(content):
    message = SimpleNamespace(content=content, tool_calls=None)
    return SimpleNamespace(choices=[SimpleNamespace(message=message)])


async def _collect_async(iterator):
    chunks = []
    async for chunk in iterator:
        chunks.append(chunk)
    return chunks


class GlobalVLMFailoverTest(unittest.TestCase):
    def _import_global_vlm_client(self):
        sys.modules.pop("opencontext.llm.global_vlm_client", None)

        fake_llm_module = types.ModuleType("opencontext.llm.llm_client")

        class FakeLLMType:
            CHAT = "chat"

        class FakeLLMClient:
            instances = []
            calls = []
            fail_sync = set()
            fail_async = set()
            fail_stream = set()

            def __init__(self, llm_type, config):
                self.llm_type = llm_type
                self.config = config
                self.model = config["model"]
                FakeLLMClient.instances.append(self)

            def generate_with_messages(self, messages, **kwargs):
                FakeLLMClient.calls.append(("sync", self.model, kwargs))
                if self.model in FakeLLMClient.fail_sync:
                    raise RuntimeError(f"{self.model} 429")
                return _response(f"{self.model} ok")

            async def generate_with_messages_async(self, messages, **kwargs):
                FakeLLMClient.calls.append(("async", self.model, kwargs))
                if self.model in FakeLLMClient.fail_async:
                    raise RuntimeError(f"{self.model} 429")
                return _response(f"{self.model} async ok")

            async def _openai_chat_completion_stream_async(self, messages, **kwargs):
                FakeLLMClient.calls.append(("stream", self.model, kwargs))
                if self.model in FakeLLMClient.fail_stream:
                    raise RuntimeError(f"{self.model} 429")
                yield f"{self.model} chunk"

        fake_llm_module.LLMClient = FakeLLMClient
        fake_llm_module.LLMType = FakeLLMType

        fake_storage_module = types.ModuleType("opencontext.storage.unified_storage")
        fake_storage_module.UnifiedStorage = object

        fake_json_parser_module = types.ModuleType("opencontext.utils.json_parser")
        fake_json_parser_module.parse_json_from_response = lambda _value: {}

        fake_tools_module = types.ModuleType("opencontext.tools.tools_executor")

        class FakeToolsExecutor:
            def run(self, *_args, **_kwargs):
                return {}

            async def run_async(self, *_args, **_kwargs):
                return {}

        fake_tools_module.ToolsExecutor = FakeToolsExecutor

        module_patch = patch.dict(
            sys.modules,
            {
                "opencontext.llm.llm_client": fake_llm_module,
                "opencontext.storage.unified_storage": fake_storage_module,
                "opencontext.utils.json_parser": fake_json_parser_module,
                "opencontext.tools.tools_executor": fake_tools_module,
            },
        )
        module_patch.start()
        self.addCleanup(module_patch.stop)
        self.addCleanup(lambda: sys.modules.pop("opencontext.llm.global_vlm_client", None))

        module = importlib.import_module("opencontext.llm.global_vlm_client")
        return module, FakeLLMClient

    def _install_config(self, module, config):
        def fake_get_config(path=None):
            if path:
                return config.get(path)
            return config

        module.get_config = fake_get_config
        module.GlobalVLMClient.reset()

    def _sample_config(self):
        return {
            "vlm_model": {
                "provider": "openai",
                "model": "primary",
                "base_url": "https://primary.example/v1",
                "api_key": "primary-key",
            },
            "model_profiles": [
                {
                    "name": "duplicate primary",
                    "config": {
                        "modelPlatform": "openai",
                        "modelId": "primary",
                        "baseUrl": "https://primary.example/v1",
                        "apiKey": "primary-key",
                        "embeddingModelId": "embedding",
                    },
                },
                {
                    "name": "backup",
                    "config": {
                        "modelPlatform": "custom",
                        "modelId": "backup",
                        "baseUrl": "http://localhost:8000/v1",
                        "apiKey": "",
                        "embeddingModelId": "embedding",
                    },
                },
            ],
        }

    def test_fails_over_from_primary_to_saved_profile(self):
        module, fake_client = self._import_global_vlm_client()
        self._install_config(module, self._sample_config())
        fake_client.fail_sync = {"primary"}

        client = module.GlobalVLMClient.get_instance()
        result = client.generate_with_messages(
            [{"role": "user", "content": "hi"}], enable_executor=False
        )

        self.assertEqual(result, "backup ok")
        self.assertEqual(
            [instance.model for instance in fake_client.instances], ["primary", "backup"]
        )
        self.assertEqual([call[1] for call in fake_client.calls], ["primary", "backup"])
        self.assertEqual(client._vlm_client.model, "backup")

    def test_raises_last_error_when_all_models_fail(self):
        module, fake_client = self._import_global_vlm_client()
        self._install_config(module, self._sample_config())
        fake_client.fail_sync = {"primary", "backup"}

        client = module.GlobalVLMClient.get_instance()

        with self.assertRaisesRegex(RuntimeError, "backup 429"):
            client.generate_with_messages(
                [{"role": "user", "content": "hi"}], enable_executor=False
            )

    def test_async_agent_and_stream_calls_use_failover(self):
        module, fake_client = self._import_global_vlm_client()
        self._install_config(module, self._sample_config())
        fake_client.fail_async = {"primary"}
        fake_client.fail_stream = {"primary"}

        client = module.GlobalVLMClient.get_instance()
        response = asyncio.run(
            client.generate_for_agent_async(
                [{"role": "user", "content": "hi"}],
                tools=[{"type": "function", "function": {"name": "lookup"}}],
            )
        )
        self.assertEqual(response.choices[0].message.content, "backup async ok")

        client._set_active_client(0)
        chunks = asyncio.run(
            _collect_async(client.generate_stream_for_agent([{"role": "user", "content": "hi"}]))
        )

        self.assertEqual(chunks, ["backup chunk"])
        self.assertEqual(
            [call[1] for call in fake_client.calls],
            ["primary", "backup", "primary", "backup"],
        )


if __name__ == "__main__":
    unittest.main()

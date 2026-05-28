import importlib
import json
import sys
import types
import unittest


class FakeEmbeddingResponse:
    def __init__(self):
        self.data = [types.SimpleNamespace(embedding=[0.1, 0.2, 0.3])]
        self.usage = None


class FakeEmbeddings:
    def create(self, **kwargs):
        return FakeEmbeddingResponse()


class FakeArkEmbeddingResponse:
    def __init__(self):
        self.data = types.SimpleNamespace(embedding=[0.7, 0.8, 0.9])
        self.usage = None


class FakeChatCompletions:
    def create(self, **kwargs):
        FakeOpenAI.last_chat_messages = kwargs.get("messages")
        return types.SimpleNamespace(choices=[object()])


class FakeOpenAI:
    last_base_url = None
    last_api_key = None
    last_chat_messages = None

    def __init__(self, **kwargs):
        FakeOpenAI.last_base_url = kwargs.get("base_url")
        FakeOpenAI.last_api_key = kwargs.get("api_key")
        self.embeddings = FakeEmbeddings()
        self.chat = types.SimpleNamespace(completions=FakeChatCompletions())


class FakeAsyncOpenAI:
    def __init__(self, **kwargs):
        self.embeddings = types.SimpleNamespace(create=self.create_embedding)

    async def create_embedding(self, **kwargs):
        return FakeEmbeddingResponse()


class FakeArk:
    last_model = None

    def __init__(self, **kwargs):
        self.multimodal_embeddings = types.SimpleNamespace(create=self.create_embedding)

    def create_embedding(self, **kwargs):
        FakeArk.last_model = kwargs.get("model")
        return FakeArkEmbeddingResponse()


class FakeHTTPResponse:
    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def read(self):
        return json.dumps(
            {
                "output": {"embeddings": [{"embedding": [0.4, 0.5, 0.6]}]},
                "usage": {"input_tokens": 2, "total_tokens": 2},
            }
        ).encode("utf-8")


class FakeUrlopen:
    last_url = None
    last_headers = None
    last_payload = None

    def __call__(self, request, timeout=None):
        FakeUrlopen.last_url = request.full_url
        FakeUrlopen.last_headers = dict(request.header_items())
        FakeUrlopen.last_payload = json.loads(request.data.decode("utf-8"))
        return FakeHTTPResponse()


class LLMClientEmbeddingTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        fake_openai = types.ModuleType("openai")
        fake_openai.APIError = Exception
        fake_openai.OpenAI = FakeOpenAI
        fake_openai.AsyncOpenAI = FakeAsyncOpenAI
        sys.modules["openai"] = fake_openai

        fake_ark = types.ModuleType("volcenginesdkarkruntime")
        fake_ark.Ark = FakeArk
        sys.modules["volcenginesdkarkruntime"] = fake_ark

        sys.modules.pop("opencontext.llm.llm_client", None)
        cls.llm_client = importlib.import_module("opencontext.llm.llm_client")
        cls.fake_urlopen = FakeUrlopen()
        cls.llm_client.urllib_request.urlopen = cls.fake_urlopen

    def test_custom_embedding_validation_uses_standard_embeddings_api(self):
        client = self.llm_client.LLMClient(
            llm_type=self.llm_client.LLMType.EMBEDDING,
            config={
                "base_url": "http://127.0.0.1:8000/v1",
                "api_key": "test-key",
                "model": "local-embedding",
                "provider": "custom",
            },
        )

        valid, message = client.validate()

        self.assertTrue(valid, message)
        self.assertEqual(message, "Embedding model validation successful")
        self.assertEqual(FakeOpenAI.last_base_url, "http://127.0.0.1:8000/v1")
        self.assertEqual(FakeOpenAI.last_api_key, "test-key")

    def test_custom_embedding_allows_local_server_without_api_key(self):
        client = self.llm_client.LLMClient(
            llm_type=self.llm_client.LLMType.EMBEDDING,
            config={
                "base_url": "http://127.0.0.1:52625/v1",
                "api_key": "",
                "model": "embed-gemma:300m",
                "provider": "custom",
            },
        )

        valid, message = client.validate()

        self.assertTrue(valid, message)
        self.assertEqual(FakeOpenAI.last_api_key, "not-needed")
        self.assertEqual(FakeOpenAI.last_base_url, "http://127.0.0.1:52625/v1")

    def test_full_chat_completion_endpoint_is_normalized_to_base_url(self):
        self.llm_client.LLMClient(
            llm_type=self.llm_client.LLMType.CHAT,
            config={
                "base_url": "https://ark.cn-beijing.volces.com/api/v3/chat/completions",
                "api_key": "test-key",
                "model": "doubao-test",
                "provider": "doubao",
            },
        )

        self.assertEqual(FakeOpenAI.last_base_url, "https://ark.cn-beijing.volces.com/api/v3")

    def test_zhipu_full_chat_completion_endpoint_is_normalized(self):
        self.llm_client.LLMClient(
            llm_type=self.llm_client.LLMType.CHAT,
            config={
                "base_url": "https://open.bigmodel.cn/api/paas/v4/chat/completions",
                "api_key": "test-key",
                "model": "glm-4.1v-thinking-flash",
                "provider": "custom",
            },
        )

        self.assertEqual(FakeOpenAI.last_base_url, "https://open.bigmodel.cn/api/paas/v4")

    def test_chat_validation_uses_text_and_image_input(self):
        client = self.llm_client.LLMClient(
            llm_type=self.llm_client.LLMType.CHAT,
            config={
                "base_url": "https://open.bigmodel.cn/api/paas/v4/chat/completions",
                "api_key": "test-key",
                "model": "glm-4.1v-thinking-flash",
                "provider": "custom",
            },
        )

        valid, message = client.validate()

        self.assertTrue(valid, message)
        content = FakeOpenAI.last_chat_messages[0]["content"]
        self.assertEqual(content[0], {"type": "text", "text": "Hi"})
        self.assertEqual(content[1]["type"], "image_url")
        self.assertTrue(content[1]["image_url"]["url"].startswith("data:image/png;base64,"))

    def test_doubao_embedding_large_alias_maps_to_text_model(self):
        client = self.llm_client.LLMClient(
            llm_type=self.llm_client.LLMType.EMBEDDING,
            config={
                "base_url": "https://ark.cn-beijing.volces.com/api/v3",
                "api_key": "test-key",
                "model": "Doubao-embedding-large",
                "provider": "doubao",
            },
        )

        valid, message = client.validate()

        self.assertTrue(valid, message)
        self.assertEqual(FakeArk.last_model, "doubao-embedding-large-text-240915")

    def test_bare_openai_compatible_base_url_adds_v1(self):
        self.llm_client.LLMClient(
            llm_type=self.llm_client.LLMType.CHAT,
            config={
                "base_url": "https://api.example.com",
                "api_key": "test-key",
                "model": "custom-chat",
                "provider": "custom",
            },
        )

        self.assertEqual(FakeOpenAI.last_base_url, "https://api.example.com/v1")

    def test_custom_chat_base_url_trims_whitespace_before_adding_v1(self):
        self.llm_client.LLMClient(
            llm_type=self.llm_client.LLMType.CHAT,
            config={
                "base_url": "  https://api.example.com/  ",
                "api_key": "test-key",
                "model": "custom-chat",
                "provider": "custom",
            },
        )

        self.assertEqual(FakeOpenAI.last_base_url, "https://api.example.com/v1")

    def test_custom_chat_base_url_preserves_non_empty_custom_path(self):
        self.llm_client.LLMClient(
            llm_type=self.llm_client.LLMType.CHAT,
            config={
                "base_url": "https://ai.example.com/ai/llm/online/vision",
                "api_key": "test-key",
                "model": "multimodal-large",
                "provider": "custom",
            },
        )

        self.assertEqual(
            FakeOpenAI.last_base_url,
            "https://ai.example.com/ai/llm/online/vision",
        )

    def test_aliyun_embedding_uses_dashscope_http_api(self):
        client = self.llm_client.LLMClient(
            llm_type=self.llm_client.LLMType.EMBEDDING,
            config={
                "base_url": "https://dashscope.aliyuncs.com",
                "api_key": "dashscope-key",
                "model": "multimodal-embedding-v1",
                "provider": "aliyun",
            },
        )

        embedding = client.generate_embedding("hello")

        self.assertEqual(embedding, [0.4, 0.5, 0.6])
        self.assertEqual(
            FakeUrlopen.last_url,
            "https://dashscope.aliyuncs.com/api/v1/services/embeddings/multimodal-embedding/multimodal-embedding",
        )
        self.assertEqual(FakeUrlopen.last_headers["Authorization"], "Bearer dashscope-key")
        self.assertEqual(
            FakeUrlopen.last_payload,
            {
                "model": "multimodal-embedding-v1",
                "input": {"contents": [{"text": "hello"}]},
            },
        )


if __name__ == "__main__":
    unittest.main()

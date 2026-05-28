import importlib
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


class FakeOpenAI:
    last_base_url = None

    def __init__(self, **kwargs):
        FakeOpenAI.last_base_url = kwargs.get("base_url")
        self.embeddings = FakeEmbeddings()
        self.chat = types.SimpleNamespace(
            completions=types.SimpleNamespace(create=lambda **kwargs: types.SimpleNamespace(choices=[object()]))
        )


class FakeAsyncOpenAI:
    def __init__(self, **kwargs):
        self.embeddings = types.SimpleNamespace(create=self.create_embedding)

    async def create_embedding(self, **kwargs):
        return FakeEmbeddingResponse()


class FakeArk:
    def __init__(self, **kwargs):
        self.multimodal_embeddings = types.SimpleNamespace(create=self.create_embedding)

    def create_embedding(self, **kwargs):
        raise AssertionError("custom embeddings must not use Ark multimodal_embeddings")


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


if __name__ == "__main__":
    unittest.main()

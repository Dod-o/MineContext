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
    def __init__(self, **kwargs):
        self.embeddings = FakeEmbeddings()


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


if __name__ == "__main__":
    unittest.main()

import importlib.util
import sys
import threading
import types
import unittest
from pathlib import Path


fake_chromadb = types.ModuleType("chromadb")
fake_chromadb.Client = type("Client", (), {})
fake_chromadb.Collection = type("Collection", (), {})
fake_chromadb.HttpClient = lambda *args, **kwargs: None
fake_chromadb.PersistentClient = lambda *args, **kwargs: None
fake_chromadb.Settings = lambda **kwargs: kwargs
sys.modules.setdefault("chromadb", fake_chromadb)

fake_llm_pkg = types.ModuleType("opencontext.llm")
fake_llm_pkg.__path__ = []
sys.modules.setdefault("opencontext.llm", fake_llm_pkg)

fake_embedding_client = types.ModuleType("opencontext.llm.global_embedding_client")
fake_embedding_client.do_vectorize = lambda vectorize: None
sys.modules.setdefault(fake_embedding_client.__name__, fake_embedding_client)

module_path = (
    Path(__file__).resolve().parents[1]
    / "opencontext"
    / "storage"
    / "backends"
    / "chromadb_backend.py"
)
spec = importlib.util.spec_from_file_location("chromadb_backend_for_test", module_path)
chromadb_backend_module = importlib.util.module_from_spec(spec)
assert spec and spec.loader
spec.loader.exec_module(chromadb_backend_module)
ChromaDBBackend = chromadb_backend_module.ChromaDBBackend


def make_chroma_result(ids):
    return {
        "ids": ids,
        "documents": [f"document-{item}" for item in ids],
        "metadatas": [{"id": item} for item in ids],
    }


class NativeOffsetCollection:
    def __init__(self):
        self.calls = []

    def get(self, **kwargs):
        self.calls.append(kwargs)
        return make_chroma_result(["native-1", "native-2"])


class LegacyOffsetCollection:
    def __init__(self):
        self.calls = []
        self.ids = ["legacy-0", "legacy-1", "legacy-2", "legacy-3"]

    def get(self, **kwargs):
        self.calls.append(kwargs)
        if "offset" in kwargs:
            raise TypeError("get() got an unexpected keyword argument 'offset'")
        return make_chroma_result(self.ids[: kwargs["limit"]])


class ChromaDBPaginationTest(unittest.TestCase):
    def _build_backend(self, collection):
        backend = ChromaDBBackend.__new__(ChromaDBBackend)
        backend._initialized = True
        backend._collections = {"activity_context": collection}
        backend._write_lock = threading.Lock()
        backend._build_where_clause = lambda _filter: None
        backend._chroma_result_to_context = lambda doc, _need_vector=False: doc["id"]
        return backend

    def test_get_all_contexts_uses_native_offset(self):
        collection = NativeOffsetCollection()
        backend = self._build_backend(collection)

        result = backend.get_all_processed_contexts(
            context_types=["activity_context"],
            limit=2,
            offset=3,
            need_vector=False,
        )

        self.assertEqual(result["activity_context"], ["native-1", "native-2"])
        self.assertEqual(len(collection.calls), 1)
        self.assertEqual(collection.calls[0]["limit"], 2)
        self.assertEqual(collection.calls[0]["offset"], 3)

    def test_get_all_contexts_falls_back_for_legacy_chromadb(self):
        collection = LegacyOffsetCollection()
        backend = self._build_backend(collection)

        result = backend.get_all_processed_contexts(
            context_types=["activity_context"],
            limit=2,
            offset=1,
            need_vector=False,
        )

        self.assertEqual(result["activity_context"], ["legacy-1", "legacy-2"])
        self.assertEqual(collection.calls[1]["limit"], 3)
        self.assertNotIn("offset", collection.calls[1])


if __name__ == "__main__":
    unittest.main()

import importlib.util
import sys
import unittest
from pathlib import Path


class ChunkerImportTest(unittest.TestCase):
    def test_chunker_module_does_not_import_pandas_at_load_time(self):
        repo_root = Path(__file__).resolve().parents[1]
        module_path = repo_root / "opencontext" / "context_processing" / "chunker" / "chunkers.py"
        sys.modules.pop("pandas", None)

        spec = importlib.util.spec_from_file_location("chunkers_under_test", module_path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)

        self.assertTrue(hasattr(module, "StructuredFileChunker"))
        self.assertNotIn("pandas", sys.modules)


if __name__ == "__main__":
    unittest.main()

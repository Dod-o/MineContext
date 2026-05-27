import tempfile
import unittest
import importlib.util
from pathlib import Path

from PIL import Image


def load_document_converter_class():
    repo_root = Path(__file__).resolve().parents[1]
    module_path = repo_root / "opencontext" / "context_processing" / "processor" / "document_converter.py"
    spec = importlib.util.spec_from_file_location("document_converter", module_path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.DocumentConverter


DocumentConverter = load_document_converter_class()


class ImageResourceHandlingTest(unittest.TestCase):
    def test_loaded_image_is_independent_from_source_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            image_path = Path(tmp) / "document.png"
            Image.new("RGB", (8, 8), "blue").save(image_path)

            image = DocumentConverter()._load_image(str(image_path))[0]
            image_path.unlink()

            self.assertEqual(image.mode, "RGB")
            self.assertEqual(image.getpixel((0, 0)), (0, 0, 255))


if __name__ == "__main__":
    unittest.main()

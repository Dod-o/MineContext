import tempfile
import unittest
from pathlib import Path

from PIL import Image

from opencontext.utils.image import normalize_hdr_screenshot


def _mean_luma(path: Path) -> float:
    with Image.open(path) as img:
        image = img.convert("L")
        if hasattr(image, "get_flattened_data"):
            pixels = list(image.get_flattened_data())
        else:
            pixels = list(image.getdata())
    return sum(pixels) / len(pixels)


class HdrScreenshotNormalizationTest(unittest.TestCase):
    def test_washed_out_screenshot_is_tone_corrected(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "washed.png"
            img = Image.new("RGB", (16, 16))
            for y in range(16):
                for x in range(16):
                    value = 180 + int((x + y) / 30 * 75)
                    img.putpixel((x, y), (value, value, value))
            img.save(path)

            before = _mean_luma(path)
            changed = normalize_hdr_screenshot(str(path))
            after = _mean_luma(path)

            self.assertTrue(changed)
            self.assertLess(after, before - 40)
            self.assertLess(after, 170)

    def test_normal_contrast_image_is_left_unchanged(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "normal.png"
            img = Image.new("RGB", (16, 16))
            for y in range(16):
                for x in range(16):
                    value = int((x + y) / 30 * 255)
                    img.putpixel((x, y), (value, value, value))
            img.save(path)

            before = _mean_luma(path)
            changed = normalize_hdr_screenshot(str(path))
            after = _mean_luma(path)

            self.assertFalse(changed)
            self.assertEqual(after, before)


if __name__ == "__main__":
    unittest.main()

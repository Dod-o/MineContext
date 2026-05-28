import datetime
import os
import tempfile
import unittest
from pathlib import Path

from opencontext.models.context import RawContextModel, RawContextProperties
from opencontext.models.enums import ContentFormat, ContextSource
from opencontext.utils.raw_context_media import (
    build_context_media_url,
    decode_context_media_path,
    encode_context_media_path,
    get_context_media_roots,
    validate_context_media_path,
)


class RawContextMediaTest(unittest.TestCase):
    def setUp(self):
        self._old_context_path = os.environ.get("CONTEXT_PATH")

    def tearDown(self):
        if self._old_context_path is None:
            os.environ.pop("CONTEXT_PATH", None)
        else:
            os.environ["CONTEXT_PATH"] = self._old_context_path

    def test_encodes_media_path_into_url_safe_token(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            image_path = Path(temp_dir) / "screenshots" / "shot.png"
            image_path.parent.mkdir()
            image_path.write_bytes(b"png")

            token = encode_context_media_path(image_path)

            self.assertNotIn("/", token)
            self.assertEqual(decode_context_media_path(token), image_path.resolve())
            self.assertEqual(build_context_media_url(image_path), f"/context-files/{token}")

    def test_raw_context_model_exposes_content_url_for_images(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            image_path = Path(temp_dir) / "screenshots" / "shot.png"
            raw_context = RawContextProperties(
                source=ContextSource.SCREENSHOT,
                content_format=ContentFormat.IMAGE,
                create_time=datetime.datetime(2025, 1, 1, 12, 0, 0),
                content_path=str(image_path),
            )

            model = RawContextModel.from_raw_context_properties(raw_context, Path.cwd())

            self.assertEqual(model.content_path, str(image_path))
            self.assertIsNotNone(model.content_url)
            self.assertTrue(model.content_url.startswith("/context-files/"))

    def test_validate_context_media_path_allows_media_under_context_path(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            os.environ["CONTEXT_PATH"] = temp_dir
            image_path = Path(temp_dir) / "screenshots" / "shot.png"
            image_path.parent.mkdir()
            image_path.write_bytes(b"png")

            roots = get_context_media_roots(Path.cwd())

            self.assertEqual(validate_context_media_path(image_path, roots), image_path.resolve())

    def test_validate_context_media_path_rejects_non_media_files(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            os.environ["CONTEXT_PATH"] = temp_dir
            text_path = Path(temp_dir) / "config" / "secret.txt"
            text_path.parent.mkdir()
            text_path.write_text("secret")

            roots = get_context_media_roots(Path.cwd())

            with self.assertRaises(PermissionError):
                validate_context_media_path(text_path, roots)

    def test_validate_context_media_path_rejects_media_outside_context_roots(self):
        with tempfile.TemporaryDirectory() as context_dir:
            os.environ["CONTEXT_PATH"] = context_dir
            with tempfile.TemporaryDirectory() as other_dir:
                image_path = Path(other_dir) / "shot.png"
                image_path.write_bytes(b"png")

                roots = get_context_media_roots(Path.cwd())

                with self.assertRaises(PermissionError):
                    validate_context_media_path(image_path, roots)


if __name__ == "__main__":
    unittest.main()

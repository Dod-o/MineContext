import os
import tempfile
import time
import unittest
from pathlib import Path

from opencontext.utils.image_storage import (
    cleanup_image_storage,
    get_image_storage_roots,
    get_image_storage_status,
)


class ImageStorageCleanupTest(unittest.TestCase):
    def setUp(self):
        self._old_context_path = os.environ.get("CONTEXT_PATH")

    def tearDown(self):
        if self._old_context_path is None:
            os.environ.pop("CONTEXT_PATH", None)
        else:
            os.environ["CONTEXT_PATH"] = self._old_context_path

    def _write_image(self, path: Path, size: int = 10, age_seconds: int = 0) -> Path:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(b"x" * size)
        if age_seconds:
            timestamp = time.time() - age_seconds
            os.utime(path, (timestamp, timestamp))
        return path

    def test_status_counts_only_image_files_under_configured_roots(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            os.environ["CONTEXT_PATH"] = temp_dir
            root = Path(temp_dir) / "screenshots"
            self._write_image(root / "old.png", size=12)
            self._write_image(root / "nested" / "new.jpg", size=8)
            (root / "note.txt").write_text("not an image")

            status = get_image_storage_status(get_image_storage_roots({}))

            self.assertEqual(status["count"], 2)
            self.assertEqual(status["size_bytes"], 20)

    def test_cleanup_dry_run_does_not_delete_files(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            os.environ["CONTEXT_PATH"] = temp_dir
            image_path = self._write_image(
                Path(temp_dir) / "screenshots" / "old.png",
                age_seconds=3 * 24 * 60 * 60,
            )

            result = cleanup_image_storage(
                get_image_storage_roots({}), retention_days=1, dry_run=True
            )

            self.assertEqual(result["deleted_count"], 1)
            self.assertTrue(image_path.exists())

    def test_cleanup_deletes_images_by_age(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            os.environ["CONTEXT_PATH"] = temp_dir
            old_image = self._write_image(
                Path(temp_dir) / "screenshots" / "old.png",
                age_seconds=3 * 24 * 60 * 60,
            )
            new_image = self._write_image(Path(temp_dir) / "screenshots" / "new.png")

            result = cleanup_image_storage(get_image_storage_roots({}), retention_days=1)

            self.assertEqual(result["deleted_count"], 1)
            self.assertFalse(old_image.exists())
            self.assertTrue(new_image.exists())

    def test_cleanup_enforces_file_count_and_size_limits(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            os.environ["CONTEXT_PATH"] = temp_dir
            root = Path(temp_dir) / "screenshots"
            oldest = self._write_image(root / "oldest.png", size=10, age_seconds=30)
            middle = self._write_image(root / "middle.png", size=10, age_seconds=20)
            newest = self._write_image(root / "newest.png", size=10, age_seconds=10)

            result = cleanup_image_storage(
                get_image_storage_roots({}), max_file_count=2, max_total_size_mb=0.00002
            )

            self.assertEqual(result["deleted_count"], 1)
            self.assertFalse(oldest.exists())
            self.assertTrue(middle.exists())
            self.assertTrue(newest.exists())


if __name__ == "__main__":
    unittest.main()

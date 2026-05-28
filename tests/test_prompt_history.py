import json
import tempfile
import unittest
from pathlib import Path

from opencontext.utils.prompt_history import (
    is_safe_history_filename,
    list_prompt_history_files,
)


class PromptHistoryTest(unittest.TestCase):
    def test_history_list_reads_existing_files_when_debug_is_disabled(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            base_path = Path(temp_dir)
            history_dir = base_path / "report"
            history_dir.mkdir()
            history_file = history_dir / "2026-05-28_12-00-00.json"
            history_file.write_text(
                json.dumps(
                    {
                        "timestamp": "2026-05-28 12:00:00",
                        "messages": [{"role": "user", "content": "hello"}],
                        "response": "world",
                    }
                ),
                encoding="utf-8",
            )
            config = {
                "content_generation": {
                    "debug": {
                        "enabled": False,
                        "output_path": str(base_path),
                    }
                }
            }

            history_files = list_prompt_history_files(config, "generation_report")

            self.assertEqual(history_files[0]["filename"], history_file.name)
            self.assertTrue(history_files[0]["has_result"])

    def test_history_filename_validation_rejects_path_traversal(self):
        self.assertFalse(is_safe_history_filename("../secret.json"))
        self.assertFalse(is_safe_history_filename("..\\secret.json"))
        self.assertTrue(is_safe_history_filename("2026-05-28_12-00-00.json"))


if __name__ == "__main__":
    unittest.main()

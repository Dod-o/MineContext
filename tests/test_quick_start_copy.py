import unittest
from pathlib import Path


class QuickStartCopyTest(unittest.TestCase):
    def test_welcome_message_uses_not_only_positioning(self):
        quick_start = (
            Path(__file__).resolve().parents[1] / "config" / "quick_start_default.md"
        ).read_text(encoding="utf-8")

        self.assertIn(
            "Not only a workbench, a second brain, or a knowledge base",
            quick_start,
        )
        self.assertNotIn(
            "Not a workbench, not a second brain, nor a knowledge base",
            quick_start,
        )


if __name__ == "__main__":
    unittest.main()

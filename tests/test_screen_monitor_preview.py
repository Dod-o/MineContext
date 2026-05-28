import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class ScreenMonitorPreviewTest(unittest.TestCase):
    def test_screen_monitor_preview_groups_do_not_loop(self):
        preview_files = [
            ROOT
            / "frontend"
            / "src"
            / "renderer"
            / "src"
            / "pages"
            / "screen-monitor"
            / "components"
            / "activitie-timeline-item.tsx",
            ROOT
            / "frontend"
            / "src"
            / "renderer"
            / "src"
            / "pages"
            / "screen-monitor"
            / "components"
            / "recording-stats-card.tsx",
        ]

        for path in preview_files:
            with self.subTest(path=path.name):
                source = path.read_text(encoding="utf-8")
                self.assertIn("<Image.PreviewGroup infinite={false}", source)


if __name__ == "__main__":
    unittest.main()

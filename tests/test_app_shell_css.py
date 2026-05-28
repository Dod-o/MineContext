import unittest
from pathlib import Path


class AppShellCssTest(unittest.TestCase):
    def test_app_shell_fills_window_without_legacy_corner_background(self):
        css = (
            Path(__file__).resolve().parents[1]
            / "frontend"
            / "src"
            / "renderer"
            / "src"
            / "assets"
            / "main.css"
        ).read_text(encoding="utf-8")

        self.assertIn("#root {\n  display: flex;\n  align-items: stretch;", css)
        self.assertIn("background: var(--mc-app-bg);", css)
        self.assertNotIn("background-image: url('./wavy-lines.svg');", css)
        self.assertNotIn("margin-bottom: 80px;", css)


if __name__ == "__main__":
    unittest.main()

import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
THEME_HOOK = ROOT / "frontend" / "src" / "renderer" / "src" / "hooks" / "use-app-theme.ts"
THEME_SERVICE = ROOT / "frontend" / "src" / "main" / "services" / "ThemeService.ts"
THEME_TYPES = ROOT / "frontend" / "packages" / "shared" / "theme.ts"
SETTINGS_PAGE = ROOT / "frontend" / "src" / "renderer" / "src" / "pages" / "settings" / "settings.tsx"
RUNTIME_SETTINGS = ROOT / "frontend" / "packages" / "shared" / "app-runtime-settings.ts"


class ThemeLanguageStaticTest(unittest.TestCase):
    def test_windows_app_exposes_chinese_language_and_dark_theme_controls(self):
        theme_types = THEME_TYPES.read_text(encoding="utf-8")
        settings_page = SETTINGS_PAGE.read_text(encoding="utf-8")
        runtime_settings = RUNTIME_SETTINGS.read_text(encoding="utf-8")

        self.assertIn("export type ThemeMode = 'system' | 'light' | 'dark'", theme_types)
        self.assertIn("value=\"dark\">Dark</Radio>", settings_page)
        self.assertIn("value=\"zh\">中文</Radio>", settings_page)
        self.assertIn("export type AppLanguage = 'system' | 'en' | 'zh'", runtime_settings)
        self.assertIn("resolveAppLanguage", runtime_settings)


if __name__ == "__main__":
    unittest.main()

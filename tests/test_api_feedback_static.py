import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCREEN_MONITOR_PAGE = (
    ROOT
    / "frontend"
    / "src"
    / "renderer"
    / "src"
    / "pages"
    / "screen-monitor"
    / "screen-monitor.tsx"
)
SCREEN_MONITOR_HEADER = (
    ROOT
    / "frontend"
    / "src"
    / "renderer"
    / "src"
    / "pages"
    / "screen-monitor"
    / "components"
    / "screen-monitor-header.tsx"
)
SETTINGS_PAGE = ROOT / "frontend" / "src" / "renderer" / "src" / "pages" / "settings" / "settings.tsx"
SETTINGS_ROUTE = ROOT / "opencontext" / "server" / "routes" / "settings.py"
SETTINGS_SERVICE = ROOT / "frontend" / "src" / "renderer" / "src" / "services" / "Settings.ts"


class ApiFeedbackStaticTest(unittest.TestCase):
    def test_screen_monitor_shows_clickable_model_api_status(self):
        page = SCREEN_MONITOR_PAGE.read_text(encoding="utf-8")
        header = SCREEN_MONITOR_HEADER.read_text(encoding="utf-8")

        self.assertIn("apiConnectionStatus", page)
        self.assertIn("validateModelSettingsAPI", page)
        self.assertIn("setApiConnectionMessage(message)", page)
        self.assertIn("API unavailable", header)
        self.assertIn("onClick={onCheckApiConnection}", header)
        self.assertIn("apiStatusConfig.label", header)

    def test_get_started_surfaces_validation_and_save_errors(self):
        settings_page = SETTINGS_PAGE.read_text(encoding="utf-8")

        self.assertIn("const getValidationMessage", settings_page)
        self.assertIn("Message.error(getValidationMessage(error))", settings_page)
        self.assertIn("onError(e: Error)", settings_page)
        self.assertIn("response.data.message", settings_page)
        self.assertIn("'Get started'", settings_page)


if __name__ == "__main__":
    unittest.main()

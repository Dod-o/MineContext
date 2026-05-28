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

    def test_model_update_reports_unavailable_model_validation_errors(self):
        settings_route = SETTINGS_ROUTE.read_text(encoding="utf-8")

        self.assertIn('message=f"VLM validation failed: {vlm_msg}"', settings_route)
        self.assertIn('message=f"Embedding validation failed: {emb_msg}"', settings_route)
        self.assertIn("timeout=15", settings_route)
        self.assertIn("Failed to save settings", settings_route)

    def test_model_validation_endpoint_surfaces_provider_connection_failures(self):
        settings_route = SETTINGS_ROUTE.read_text(encoding="utf-8")
        settings_service = SETTINGS_SERVICE.read_text(encoding="utf-8")

        self.assertIn('@router.post("/api/model_settings/validate")', settings_route)
        self.assertIn('errors.append(f"VLM: {vlm_msg}")', settings_route)
        self.assertIn('errors.append(f"Embedding: {emb_msg}")', settings_route)
        self.assertIn("validateModelSettingsAPI", settings_service)
        self.assertIn("return get(res, 'data.message')", settings_service)

    def test_screen_recording_checks_model_api_before_starting(self):
        page = SCREEN_MONITOR_PAGE.read_text(encoding="utf-8")

        self.assertIn("const apiCheck = await checkApiConnection()", page)
        self.assertIn("if (!apiCheck.ok)", page)
        self.assertIn("Message.error(apiCheck.message", page)
        self.assertIn("Model API is unavailable. Check Settings before recording.", page)
        self.assertIn("await window.screenMonitorAPI.startTask()", page)

    def test_prompt_history_detail_route_rejects_unsafe_filenames(self):
        settings_route = SETTINGS_ROUTE.read_text(encoding="utf-8")

        self.assertIn("get_prompts_history_detail", settings_route)
        self.assertIn("is_safe_history_filename(filename)", settings_route)
        self.assertIn('message="Invalid filename"', settings_route)
        self.assertIn('message="History file not found"', settings_route)


if __name__ == "__main__":
    unittest.main()

import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
RUNTIME_SETTINGS = ROOT / "frontend" / "packages" / "shared" / "app-runtime-settings.ts"
SETTINGS_PAGE = ROOT / "frontend" / "src" / "renderer" / "src" / "pages" / "settings" / "settings.tsx"
SETTINGS_ROUTE = ROOT / "opencontext" / "server" / "routes" / "settings.py"


class StorageSettingsStaticTest(unittest.TestCase):
    def test_local_storage_settings_are_exposed_in_app_settings(self):
        runtime_settings = RUNTIME_SETTINGS.read_text(encoding="utf-8")
        settings_page = SETTINGS_PAGE.read_text(encoding="utf-8")

        self.assertIn("screenshotDirectory: string", runtime_settings)
        self.assertIn("backendStartPort: number", runtime_settings)
        self.assertIn("retainScreenshotImages: boolean", runtime_settings)
        self.assertIn("Local storage", settings_page)
        self.assertIn("screenshotDirectory", settings_page)
        self.assertIn("backendStartPort", settings_page)
        self.assertIn("retainScreenshotImages", settings_page)

    def test_screenshot_directory_and_backend_port_can_be_customized(self):
        runtime_settings = RUNTIME_SETTINGS.read_text(encoding="utf-8")
        settings_page = SETTINGS_PAGE.read_text(encoding="utf-8")

        self.assertIn("DEFAULT_BACKEND_START_PORT = 1733", runtime_settings)
        self.assertIn("normalizeBackendStartPort", runtime_settings)
        self.assertIn("handleSelectScreenshotDirectory", settings_page)
        self.assertIn("Browse", settings_page)
        self.assertIn("backendStartPort", settings_page)
        self.assertIn("Port changes apply after app restart.", settings_page)

    def test_resource_storage_cleanup_supports_size_and_count_limits(self):
        settings_route = SETTINGS_ROUTE.read_text(encoding="utf-8")

        self.assertIn("max_file_count", settings_route)
        self.assertIn("max_total_size_mb", settings_route)
        self.assertIn("retention_days", settings_route)
        self.assertIn("cleanup_image_storage", settings_route)

    def test_manual_image_storage_status_and_cleanup_endpoints_exist(self):
        settings_route = SETTINGS_ROUTE.read_text(encoding="utf-8")

        self.assertIn('@router.get("/api/settings/image_storage")', settings_route)
        self.assertIn('@router.post("/api/settings/image_storage/cleanup")', settings_route)
        self.assertIn("dry_run", settings_route)
        self.assertIn('result["status"] = get_image_storage_status(roots)', settings_route)


if __name__ == "__main__":
    unittest.main()

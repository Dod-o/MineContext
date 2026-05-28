import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CONFIG_MANAGER = ROOT / "opencontext" / "config" / "config_manager.py"
APP_RUNTIME_SETTINGS = ROOT / "frontend" / "packages" / "shared" / "app-runtime-settings.ts"
APP_RUNTIME_SETTINGS_SERVICE = (
    ROOT / "frontend" / "src" / "main" / "services" / "AppRuntimeSettingsService.ts"
)
BACKEND = ROOT / "frontend" / "src" / "main" / "backend.ts"
SCREENSHOT_SERVICE = ROOT / "frontend" / "src" / "main" / "services" / "ScreenshotService.ts"
SETTINGS_PAGE = ROOT / "frontend" / "src" / "renderer" / "src" / "pages" / "settings" / "settings.tsx"


class ConfigurableScreenshotStorageStaticTest(unittest.TestCase):
    def test_custom_screenshot_directory_is_persisted_and_used_for_capture(self):
        runtime_types = APP_RUNTIME_SETTINGS.read_text(encoding="utf-8")
        runtime_service = APP_RUNTIME_SETTINGS_SERVICE.read_text(encoding="utf-8")
        screenshot_service = SCREENSHOT_SERVICE.read_text(encoding="utf-8")

        self.assertIn("screenshotDirectory: string", runtime_types)
        self.assertIn("screenshotDirectory: ''", runtime_types)
        self.assertIn("ensureWritableDirectory(nextSettings.screenshotDirectory)", runtime_service)
        self.assertIn("localStoreService.setSetting(APP_RUNTIME_SETTINGS_KEY, nextSettings)", runtime_service)
        self.assertIn("resolveScreenshotActivityRoot(): string", runtime_service)
        self.assertIn(
            "screenshotDirectory ? path.resolve(screenshotDirectory) : resolveDefaultScreenshotActivityRoot()",
            runtime_service,
        )
        self.assertIn("appRuntimeSettingsService.resolveScreenshotActivityRoot()", screenshot_service)

    def test_custom_screenshot_directory_reaches_backend_config(self):
        backend = BACKEND.read_text(encoding="utf-8")
        config_manager = CONFIG_MANAGER.read_text(encoding="utf-8")

        self.assertIn("const customScreenshotDirectory = runtimeSettings.screenshotDirectory", backend)
        self.assertIn("OPENCONTEXT_SCREENSHOT_DIR: path.resolve(customScreenshotDirectory)", backend)
        self.assertIn('screenshot_dir = os.getenv("OPENCONTEXT_SCREENSHOT_DIR")', config_manager)
        self.assertIn('screenshot_config["storage_path"] = str(Path(screenshot_dir)', config_manager)

    def test_settings_page_exposes_directory_picker_and_reset(self):
        page = SETTINGS_PAGE.read_text(encoding="utf-8")

        self.assertIn("const handleSelectScreenshotDirectory = useMemoizedFn(async () => {", page)
        self.assertIn("title: 'Select screenshot directory'", page)
        self.assertIn("properties: ['openDirectory', 'createDirectory']", page)
        self.assertIn("value={runtimeSettings.screenshotDirectory}", page)
        self.assertIn("placeholder=\"Default screenshot directory\"", page)
        self.assertIn("screenshotDirectory: selectedDirectory", page)
        self.assertIn("screenshotDirectory: ''", page)
        self.assertIn("App settings saved", page)


if __name__ == "__main__":
    unittest.main()

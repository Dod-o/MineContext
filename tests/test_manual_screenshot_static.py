import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCREEN_MONITOR_TASK = (
    ROOT / "frontend" / "src" / "main" / "background" / "task" / "screen-monitor-task.ts"
)
PRELOAD = ROOT / "frontend" / "src" / "preload" / "index.ts"
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
ELECTRON_TYPES = ROOT / "frontend" / "src" / "renderer" / "src" / "types" / "electron.d.ts"
SETTINGS_MODAL = (
    ROOT
    / "frontend"
    / "src"
    / "renderer"
    / "src"
    / "pages"
    / "screen-monitor"
    / "components"
    / "settings-modal.tsx"
)
USE_SETTING = ROOT / "frontend" / "src" / "renderer" / "src" / "hooks" / "use-setting.ts"
SHARED_SCREEN_SETTINGS = ROOT / "frontend" / "packages" / "shared" / "screen-settings.ts"


class ManualScreenshotStaticTest(unittest.TestCase):
    def test_manual_capture_button_invokes_main_capture_now_path(self):
        task = SCREEN_MONITOR_TASK.read_text(encoding="utf-8")
        preload = PRELOAD.read_text(encoding="utf-8")
        page = SCREEN_MONITOR_PAGE.read_text(encoding="utf-8")
        header = SCREEN_MONITOR_HEADER.read_text(encoding="utf-8")
        electron_types = ELECTRON_TYPES.read_text(encoding="utf-8")

        self.assertIn("ipcMain.handle(IpcChannel.Task_Capture_Now", task)
        self.assertIn("return this.captureNow()", task)
        self.assertIn("ipcMain.removeHandler(IpcChannel.Task_Capture_Now)", task)
        self.assertIn("captureNow: () => ipcRenderer.invoke(IpcChannel.Task_Capture_Now)", preload)
        self.assertIn("captureNow: () => Promise<{", electron_types)
        self.assertIn("window.screenMonitorAPI.captureNow()", page)
        self.assertIn("onCaptureNow={captureNow}", page)
        self.assertIn("IconCamera", header)
        self.assertIn("Capture Now", header)
        self.assertIn("captureMode: Exclude<CaptureMode, 'scheduled'> = 'manual'", task)
        self.assertIn("source: captureMode === 'scheduled' ? type : `${captureMode}-${type}`", task)

    def test_manual_capture_shortcut_is_configurable_and_registered(self):
        task = SCREEN_MONITOR_TASK.read_text(encoding="utf-8")
        modal = SETTINGS_MODAL.read_text(encoding="utf-8")
        use_setting = USE_SETTING.read_text(encoding="utf-8")
        shared_settings = SHARED_SCREEN_SETTINGS.read_text(encoding="utf-8")

        self.assertIn("manualCaptureShortcutEnabled: true", shared_settings)
        self.assertIn("manualCaptureShortcut: 'CommandOrControl+Shift+S'", shared_settings)
        self.assertIn("setManualCaptureShortcutEnabled", use_setting)
        self.assertIn("setManualCaptureShortcut", use_setting)
        self.assertIn("Manual capture shortcut", modal)
        self.assertIn('placeholder="CommandOrControl+Shift+S"', modal)
        self.assertIn("globalShortcut.register(shortcut", task)
        self.assertIn("await this.captureNow('shortcut')", task)
        self.assertIn("globalShortcut.unregister(this.registeredManualShortcut)", task)

    def test_adaptive_capture_rules_are_configurable_and_trigger_captures(self):
        task = SCREEN_MONITOR_TASK.read_text(encoding="utf-8")
        modal = SETTINGS_MODAL.read_text(encoding="utf-8")
        shared_settings = SHARED_SCREEN_SETTINGS.read_text(encoding="utf-8")

        self.assertIn("defaultAdaptiveCaptureSettings", shared_settings)
        self.assertIn("windowSwitch", shared_settings)
        self.assertIn("activeAppStable", shared_settings)
        self.assertIn("idleResume", shared_settings)
        self.assertIn("Adaptive capture rules", modal)
        self.assertIn("Window switch", modal)
        self.assertIn("Active app stable", modal)
        self.assertIn("Return from idle", modal)
        self.assertIn("this.startAdaptiveCaptureMonitor()", task)
        self.assertIn("this.scheduleAdaptiveCapture('window-switch'", task)
        self.assertIn("this.scheduleAdaptiveCapture('active-stable'", task)
        self.assertIn("this.scheduleAdaptiveCapture('idle-resume'", task)
        self.assertIn("await this.captureNow('adaptive')", task)


if __name__ == "__main__":
    unittest.main()

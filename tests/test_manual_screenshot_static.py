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


if __name__ == "__main__":
    unittest.main()

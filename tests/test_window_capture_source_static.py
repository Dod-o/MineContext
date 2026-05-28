import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCREEN_MONITOR_TASK = (
    ROOT / "frontend" / "src" / "main" / "background" / "task" / "screen-monitor-task.ts"
)
CAPTURE_SOURCES = ROOT / "frontend" / "src" / "main" / "utils" / "get-capture-sources.ts"


class WindowCaptureSourceStaticTest(unittest.TestCase):
    def test_selected_windows_are_revalidated_when_visibility_changes(self):
        task = SCREEN_MONITOR_TASK.read_text(encoding="utf-8")

        self.assertIn("private async resolveSelectedSourcesForCapture", task)
        self.assertIn("const unresolvedSources = this.appInfo.filter((source) => !resolvedIds.has(source.id))", task)
        self.assertIn("screenshotService.getVisibleSources(unresolvedSources.map((source) => source.id))", task)
        self.assertIn("const visibilityById = new Map(result.sources.map((source) => [source.id, source]))", task)
        self.assertIn("if (!visibility?.isVisible)", task)
        self.assertIn("isVisible: true", task)
        self.assertIn("return uniqBy([...resolvedSources, ...recoveredSources], 'id')", task)

    def test_native_window_sources_cover_cross_space_and_minimized_windows(self):
        capture_sources = CAPTURE_SOURCES.read_text(encoding="utf-8")

        self.assertIn("import { FinalWindowInfo, getAllWindows } from './mac-window-manager'", capture_sources)
        self.assertIn("Using macWindowManager for cross-space window detection", capture_sources)
        self.assertIn("For important apps, always include minimized windows", capture_sources)
        self.assertIn("window.isMinimized", capture_sources)
        self.assertIn("createVirtualWindowId", capture_sources)
        self.assertIn("parseVirtualWindowId", capture_sources)
        self.assertIn("Virtual window has windows on some space", capture_sources)
        self.assertIn("Virtual window assumed visible (no space detection)", capture_sources)

    def test_adaptive_capture_detects_software_and_task_switches(self):
        task = SCREEN_MONITOR_TASK.read_text(encoding="utf-8")

        self.assertIn("private getAdaptiveCaptureSignature(visibleSources: CaptureSource[])", task)
        self.assertIn("const selectedIds = new Set(this.appInfo.map((source) => source.id))", task)
        self.assertIn("const selectedNames = new Set(this.appInfo.map((source) => source.name?.toLowerCase()).filter(Boolean))", task)
        self.assertIn("return selectedIds.has(source.id) || selectedNames.has(source.name?.toLowerCase())", task)
        self.assertIn(
            "const source = candidates.find((item) => item.type === 'window') || candidates.find((item) => item.type === 'screen')",
            task,
        )
        self.assertIn("source ? `${source.type}:${source.id}:${source.name || ''}` : ''", task)
        self.assertIn("sourceSignature !== this.lastAdaptiveSourceSignature", task)
        self.assertIn("this.scheduleAdaptiveCapture('window-switch', rules.windowSwitch.delaySeconds)", task)


if __name__ == "__main__":
    unittest.main()

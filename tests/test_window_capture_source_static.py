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


if __name__ == "__main__":
    unittest.main()

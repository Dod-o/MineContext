import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCREEN_MONITOR_PAGE = (
    ROOT / "frontend" / "src" / "renderer" / "src" / "pages" / "screen-monitor" / "screen-monitor.tsx"
)
SCREEN_MONITOR_TASK = (
    ROOT / "frontend" / "src" / "main" / "background" / "task" / "screen-monitor-task.ts"
)


class ReconnectedScreenSourcesStaticTest(unittest.TestCase):
    def test_saved_screen_selection_matches_reconnected_displays(self):
        page = SCREEN_MONITOR_PAGE.read_text(encoding="utf-8")

        self.assertIn("function sourcesReferToSameScreen", page)
        self.assertIn("left.displayId && right.displayId && left.displayId === right.displayId", page)
        self.assertIn("findSelectableSourceForSavedScreen(source, screenAllSources || [])", page)
        self.assertIn(".filter((source): source is CaptureSource => Boolean(source))", page)
        self.assertIn("const rememberedOfflineScreens = (settingScreenSources || []).filter", page)
        self.assertIn("sourcesReferToSameScreen(savedSource, source)", page)
        self.assertIn("const persistedScreenList = uniqBy([...screenList, ...rememberedOfflineScreens], 'id')", page)
        self.assertIn("screenList: persistedScreenList", page)
        self.assertIn("updateCurrentRecordApp([...screenList, ...windowList])", page)

    def test_capture_task_resolves_selected_screen_by_display_identity(self):
        task = SCREEN_MONITOR_TASK.read_text(encoding="utf-8")

        self.assertIn("const visibleScreenByDisplayId = new Map", task)
        self.assertIn("source.type === 'screen' && source.displayId", task)
        self.assertIn("visibleScreenByDisplayId.get(source.displayId)", task)
        self.assertIn("visibleByName.get(source.name.toLowerCase())", task)


if __name__ == "__main__":
    unittest.main()

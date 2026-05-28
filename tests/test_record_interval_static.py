import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCREEN_MONITOR_TASK = (
    ROOT / "frontend" / "src" / "main" / "background" / "task" / "screen-monitor-task.ts"
)
SCHEDULE_NEXT_TASK = (
    ROOT / "frontend" / "src" / "main" / "background" / "task" / "schedule-next-task.ts"
)
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


class RecordIntervalStaticTest(unittest.TestCase):
    def test_record_interval_setting_drives_main_capture_schedule(self):
        task = SCREEN_MONITOR_TASK.read_text(encoding="utf-8")
        scheduler = SCHEDULE_NEXT_TASK.read_text(encoding="utf-8")
        page = SCREEN_MONITOR_PAGE.read_text(encoding="utf-8")
        modal = SETTINGS_MODAL.read_text(encoding="utf-8")

        self.assertIn("updateInterval(time: number = 15 * 1000)", scheduler)
        self.assertIn("this.updateInterval(settings.recordInterval * 1000)", task)
        self.assertIn("record interval updated to ${settings.recordInterval}s", task)
        self.assertIn("const [tempRecordInterval, setTempRecordInterval] = useState(recordInterval)", page)
        self.assertIn("recordInterval: tempRecordInterval", page)
        self.assertIn("setRecordInterval(nextSettings.recordInterval)", page)
        self.assertIn("await window.screenMonitorAPI.updateModelConfig(nextSettings)", page)
        self.assertIn("label=\"Record Interval\"", modal)
        self.assertIn("min={5}", modal)
        self.assertIn("max={300}", modal)
        self.assertIn("formatTooltip={(value) => `${value}s`}", modal)


if __name__ == "__main__":
    unittest.main()

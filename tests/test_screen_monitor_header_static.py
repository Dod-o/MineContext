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


class ScreenMonitorHeaderStaticTest(unittest.TestCase):
    def test_recording_toggle_keeps_header_description_stable(self):
        page = SCREEN_MONITOR_PAGE.read_text(encoding="utf-8")
        header = SCREEN_MONITOR_HEADER.read_text(encoding="utf-8")

        self.assertIn("const description =", header)
        self.assertIn("{description}", header)
        self.assertNotIn("useState('Screen Monitor captures", header)
        self.assertNotIn("setDescription", header)
        self.assertIn("{!isMonitoring ? (", header)
        self.assertIn("Start Recording", header)
        self.assertIn("Stop Recording", header)
        self.assertIn("onClick={onStartMonitoring}", header)
        self.assertIn("onClick={onStopMonitoring}", header)
        self.assertIn("const startMonitoring = useMemoizedFn(async () => {", page)
        self.assertIn("const stopMonitoring = useMemoizedFn(async () => {", page)
        self.assertNotIn("setDescription", page)


if __name__ == "__main__":
    unittest.main()

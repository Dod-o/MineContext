import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCREEN_MONITOR_TASK = (
    ROOT / "frontend" / "src" / "main" / "background" / "task" / "screen-monitor-task.ts"
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


class LockScreenCaptureStaticTest(unittest.TestCase):
    def test_lock_screen_pauses_recording_pollers_and_resumes_after_unlock(self):
        page = SCREEN_MONITOR_PAGE.read_text(encoding="utf-8")

        self.assertIn("isScreenLockedRef.current = true", page)
        self.assertIn("pauseMonitoring()", page)
        self.assertIn("isScreenLockedRef.current = false", page)
        self.assertIn("resumeMonitoring()", page)
        self.assertIn("stopActivityPolling()", page)
        self.assertIn("stopStatsPolling()", page)

    def test_screen_capture_skips_when_idle_locked_or_screen_saver_active(self):
        task = SCREEN_MONITOR_TASK.read_text(encoding="utf-8")

        self.assertIn("isScreenSaverActive()", task)
        self.assertIn(
            "powerMonitor.getSystemIdleState(IDLE_CAPTURE_SKIP_THRESHOLD_SECONDS)",
            task,
        )
        self.assertIn("idleState === 'idle' || idleState === 'locked'", task)
        self.assertIn("Skipping screen capture while system is", task)
        self.assertIn("this.shouldSkipCaptureForIdleState())", task)


if __name__ == "__main__":
    unittest.main()

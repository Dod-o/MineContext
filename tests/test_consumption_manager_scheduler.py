import threading
import types
import unittest
import importlib.util
from pathlib import Path
import sys


fake_generation_pkg = types.ModuleType("opencontext.context_consumption.generation")
fake_generation_pkg.__path__ = []
sys.modules.setdefault("opencontext.context_consumption.generation", fake_generation_pkg)

for module_name, class_name in {
    "generation_report": "ReportGenerator",
    "realtime_activity_monitor": "RealtimeActivityMonitor",
    "smart_tip_generator": "SmartTipGenerator",
    "smart_todo_manager": "SmartTodoManager",
}.items():
    fake_module = types.ModuleType(f"opencontext.context_consumption.generation.{module_name}")
    fake_module.__dict__[class_name] = type(class_name, (), {})
    sys.modules.setdefault(fake_module.__name__, fake_module)

module_path = Path(__file__).resolve().parents[1] / "opencontext" / "managers" / "consumption_manager.py"
spec = importlib.util.spec_from_file_location("consumption_manager_for_test", module_path)
consumption_manager_module = importlib.util.module_from_spec(spec)
assert spec and spec.loader
spec.loader.exec_module(consumption_manager_module)
ConsumptionManager = consumption_manager_module.ConsumptionManager


class _FakeTimer:
    def __init__(self):
        self.cancelled = False

    def cancel(self):
        self.cancelled = True


class ConsumptionManagerSchedulerTest(unittest.TestCase):
    def _build_manager(self):
        manager = ConsumptionManager.__new__(ConsumptionManager)
        manager._config_lock = threading.Lock()
        manager._scheduled_tasks_enabled = True
        manager._scheduled_tasks_paused = False
        manager._scheduler_pause_reasons = set()
        manager._task_timers = {"tips": _FakeTimer()}
        manager._task_intervals = {"activity": 900, "tips": 3600, "todos": 1800}
        manager._task_enabled = {
            "activity": True,
            "tips": True,
            "todos": True,
            "report": True,
        }
        manager._daily_report_time = "08:00"
        manager.start_count = 0

        def fake_start_scheduled_tasks(self, config=None):
            self.start_count += 1
            self._scheduled_tasks_enabled = True

        manager.start_scheduled_tasks = types.MethodType(fake_start_scheduled_tasks, manager)
        return manager

    def test_pause_cancels_timers_and_resume_waits_for_all_reasons(self):
        manager = self._build_manager()
        timer = manager._task_timers["tips"]

        paused = manager.pause_scheduled_tasks("lock-screen")
        self.assertTrue(timer.cancelled)
        self.assertFalse(paused["enabled"])
        self.assertTrue(paused["paused"])
        self.assertEqual(paused["pause_reasons"], ["lock-screen"])

        manager.pause_scheduled_tasks("suspend")
        still_paused = manager.resume_scheduled_tasks("lock-screen")
        self.assertFalse(still_paused["enabled"])
        self.assertTrue(still_paused["paused"])
        self.assertEqual(still_paused["pause_reasons"], ["suspend"])
        self.assertEqual(manager.start_count, 0)

        resumed = manager.resume_scheduled_tasks("suspend")
        self.assertTrue(resumed["enabled"])
        self.assertFalse(resumed["paused"])
        self.assertEqual(resumed["pause_reasons"], [])
        self.assertEqual(manager.start_count, 1)


if __name__ == "__main__":
    unittest.main()

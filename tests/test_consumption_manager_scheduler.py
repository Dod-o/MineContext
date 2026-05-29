import threading
import types
import unittest
import importlib.util
from pathlib import Path
import sys
from datetime import datetime


_PATCHED_MODULES = {}


def _install_fake_module(name, module):
    if name not in _PATCHED_MODULES:
        _PATCHED_MODULES[name] = sys.modules.get(name)
    sys.modules[name] = module


def _restore_fake_modules():
    for name, original in reversed(_PATCHED_MODULES.items()):
        if original is None:
            sys.modules.pop(name, None)
        else:
            sys.modules[name] = original


fake_generation_pkg = types.ModuleType("opencontext.context_consumption.generation")
fake_generation_pkg.__path__ = []
_install_fake_module("opencontext.context_consumption.generation", fake_generation_pkg)

for module_name, class_name in {
    "generation_report": "ReportGenerator",
    "realtime_activity_monitor": "RealtimeActivityMonitor",
    "smart_tip_generator": "SmartTipGenerator",
    "smart_todo_manager": "SmartTodoManager",
}.items():
    fake_module = types.ModuleType(f"opencontext.context_consumption.generation.{module_name}")
    fake_module.__dict__[class_name] = type(class_name, (), {})
    _install_fake_module(fake_module.__name__, fake_module)

module_path = Path(__file__).resolve().parents[1] / "opencontext" / "managers" / "consumption_manager.py"
spec = importlib.util.spec_from_file_location("consumption_manager_for_test", module_path)
consumption_manager_module = importlib.util.module_from_spec(spec)
assert spec and spec.loader
spec.loader.exec_module(consumption_manager_module)
_restore_fake_modules()
ConsumptionManager = consumption_manager_module.ConsumptionManager


class _FakeThread:
    def __init__(self, alive=True):
        self._alive = alive
        self.join_calls = 0

    def is_alive(self):
        return self._alive

    def join(self, timeout=None):
        self.join_calls += 1
        self._alive = False


class ConsumptionManagerSchedulerTest(unittest.TestCase):
    def _build_manager(self):
        manager = ConsumptionManager.__new__(ConsumptionManager)
        manager._config_lock = threading.Lock()
        manager._scheduled_tasks_enabled = True
        manager._scheduled_tasks_paused = False
        manager._scheduler_pause_reasons = set()
        manager._task_stop_events = {"tips": threading.Event()}
        manager._task_threads = {"tips": _FakeThread()}
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
        stop_event = manager._task_stop_events["tips"]
        task_thread = manager._task_threads["tips"]

        paused = manager.pause_scheduled_tasks("lock-screen")
        self.assertTrue(stop_event.is_set())
        self.assertEqual(task_thread.join_calls, 1)
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

    def test_interval_check_has_minimum_delay(self):
        manager = self._build_manager()
        manager._task_intervals["activity"] = 1

        self.assertEqual(manager._calculate_check_interval("activity"), 1)

    def test_daily_report_range_covers_full_previous_day(self):
        manager = self._build_manager()

        start_time, end_time = manager._get_daily_report_range(datetime(2026, 5, 20, 8, 0, 0))

        self.assertEqual(start_time, int(datetime(2026, 5, 19, 0, 0, 0).timestamp()))
        self.assertEqual(end_time, int(datetime(2026, 5, 20, 0, 0, 0).timestamp()))
        self.assertEqual(end_time - start_time, 24 * 60 * 60)

    def test_no_prior_daily_report_is_due_on_first_check(self):
        manager = self._build_manager()
        manager._daily_report_time = "08:00"

        class FakeReportGenerator:
            def __init__(self):
                self.calls = []

            async def generate_report(self, start_time, end_time):
                self.calls.append((start_time, end_time))

        fake_generator = FakeReportGenerator()
        manager._activity_generator = fake_generator
        manager._get_last_report_time = lambda: None

        scheduled = {}

        def fake_start_recurring_task(task_name, callback, interval_fn, immediate=False):
            scheduled["task_name"] = task_name
            scheduled["callback"] = callback
            scheduled["interval"] = interval_fn()
            scheduled["immediate"] = immediate

        manager._start_recurring_task = fake_start_recurring_task

        original_datetime = consumption_manager_module.datetime

        class FakeDatetime(original_datetime):
            @classmethod
            def now(cls):
                return original_datetime(2026, 5, 20, 9, 0, 0)

        try:
            consumption_manager_module.datetime = FakeDatetime
            manager._start_report_timer()
            self.assertIsNone(manager._last_report_date)
            self.assertEqual(scheduled["task_name"], "report")
            self.assertTrue(scheduled["immediate"])

            scheduled["callback"]()
            scheduled["callback"]()
        finally:
            consumption_manager_module.datetime = original_datetime

        self.assertEqual(len(fake_generator.calls), 1)
        self.assertEqual(fake_generator.calls[0], manager._get_daily_report_range(datetime(2026, 5, 20, 9, 0, 0)))
        self.assertEqual(manager._last_report_date, datetime(2026, 5, 20).date())

    def test_recurring_task_replaces_existing_thread(self):
        manager = self._build_manager()
        manager._task_stop_events = {}
        manager._task_threads = {}

        created_threads = []

        class FakeCreatedThread:
            def __init__(self, target, args, name, daemon):
                self.target = target
                self.args = args
                self.name = name
                self.daemon = daemon
                self.started = False

            def start(self):
                self.started = True
                created_threads.append(self)

            def is_alive(self):
                return False

            def join(self, timeout=None):
                pass

        original_thread = consumption_manager_module.threading.Thread
        try:
            consumption_manager_module.threading.Thread = FakeCreatedThread

            manager._start_recurring_task("activity", lambda: None, lambda: 5)
            first_stop_event = manager._task_stop_events["activity"]
            manager._start_recurring_task("activity", lambda: None, lambda: 5)
        finally:
            consumption_manager_module.threading.Thread = original_thread

        self.assertEqual(len(created_threads), 2)
        self.assertTrue(first_stop_event.is_set())
        self.assertEqual(list(manager._task_threads.keys()), ["activity"])
        self.assertEqual(created_threads[-1].name, "minecontext-activity-scheduler")
        self.assertTrue(created_threads[-1].daemon)
        self.assertTrue(created_threads[-1].started)


if __name__ == "__main__":
    unittest.main()

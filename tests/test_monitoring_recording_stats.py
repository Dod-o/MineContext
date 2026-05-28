import unittest
from pathlib import Path

from opencontext.monitoring import monitor as monitor_module


ROOT = Path(__file__).resolve().parents[1]
MONITORING_TEMPLATE = ROOT / "opencontext" / "web" / "templates" / "monitoring.html"
MONITORING_ROUTES = ROOT / "opencontext" / "server" / "routes" / "monitoring.py"


class _FakeStorage:
    def cleanup_old_monitoring_data(self, days=7):
        return True

    def save_monitoring_token_usage(self, model, prompt_tokens, completion_tokens, total_tokens):
        return True


class _StageTimingStorage(_FakeStorage):
    def __init__(self, rows):
        self.rows = rows

    def query_monitoring_stage_timing(self, hours):
        return self.rows


class RecordingStatsTest(unittest.TestCase):
    def setUp(self):
        self._original_get_storage = monitor_module.get_storage
        monitor_module.get_storage = lambda: _FakeStorage()

    def tearDown(self):
        monitor_module.get_storage = self._original_get_storage

    def test_recording_stats_include_session_token_usage(self):
        monitor = monitor_module.Monitor()

        monitor.record_token_usage("vision-model", prompt_tokens=100, completion_tokens=20, total_tokens=120)
        monitor.record_token_usage("vision-model", prompt_tokens=50, completion_tokens=10, total_tokens=60)
        monitor.record_token_usage("text-model", prompt_tokens=30, completion_tokens=5, total_tokens=35)

        stats = monitor.get_recording_stats()

        self.assertEqual(stats["token_usage"]["prompt_tokens"], 180)
        self.assertEqual(stats["token_usage"]["completion_tokens"], 35)
        self.assertEqual(stats["token_usage"]["total_tokens"], 215)
        self.assertEqual(stats["token_usage"]["models"]["vision-model"]["total_tokens"], 180)
        self.assertEqual(stats["token_usage"]["models"]["text-model"]["total_tokens"], 35)

    def test_stage_timing_summary_calculates_average_vlm_latency(self):
        fake_storage = _StageTimingStorage(
            [
                {"stage_name": "chat_cost", "duration_ms": 1200, "status": "success"},
                {"stage_name": "chat_cost", "duration_ms": 1800, "status": "success"},
                {"stage_name": "embedding_cost", "duration_ms": 300, "status": "error"},
            ]
        )
        monitor_module.get_storage = lambda: fake_storage
        monitor = monitor_module.Monitor()

        summary = monitor.get_stage_timing_summary(hours=24)

        self.assertEqual(summary["total_operations"], 3)
        self.assertEqual(summary["by_stage"]["chat_cost"]["count"], 2)
        self.assertEqual(summary["by_stage"]["chat_cost"]["avg_duration"], 1500)
        self.assertEqual(summary["by_stage"]["chat_cost"]["success_count"], 2)
        self.assertEqual(summary["avg_duration_ms"], 1100)

    def test_monitoring_page_displays_average_vlm_latency_card(self):
        template = MONITORING_TEMPLATE.read_text(encoding="utf-8")
        routes = MONITORING_ROUTES.read_text(encoding="utf-8")

        self.assertIn('@router.get("/stage-timing")', routes)
        self.assertIn("monitor.get_stage_timing_summary(hours=hours)", routes)
        self.assertIn("VLM 平均耗时", template)
        self.assertIn('id="avgVlmLatency"', template)
        self.assertIn("updateVlmLatencyDisplay(stageTiming.data)", template)
        self.assertIn("const stage = data.by_stage?.chat_cost;", template)
        self.assertIn("formatDuration(stage.avg_duration || 0)", template)


if __name__ == "__main__":
    unittest.main()

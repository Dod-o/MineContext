import unittest

from opencontext.monitoring import monitor as monitor_module


class _FakeStorage:
    def cleanup_old_monitoring_data(self, days=7):
        return True

    def save_monitoring_token_usage(self, model, prompt_tokens, completion_tokens, total_tokens):
        return True


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


if __name__ == "__main__":
    unittest.main()

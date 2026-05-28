import sys
import types
import unittest
from datetime import datetime

fake_storage = types.ModuleType("opencontext.storage.global_storage")
fake_storage.get_storage = lambda: None
sys.modules.setdefault(fake_storage.__name__, fake_storage)

from opencontext.monitoring.monitor import Monitor


class MonitoringProcessingErrorTest(unittest.TestCase):
    def test_legacy_error_msg_keyword_is_accepted(self):
        monitor = Monitor()
        timestamp = datetime(2026, 5, 28, 10, 0)

        monitor.record_processing_error(
            error_msg="record_processing_error legacy keyword",
            processor_name="screenshot_processor",
            context_count=3,
            timestamp=timestamp,
        )

        errors = monitor.get_processing_errors(hours=24, top_n=1)["errors"]
        self.assertEqual(len(errors), 1)
        self.assertEqual(errors[0]["error_message"], "record_processing_error legacy keyword")
        self.assertEqual(errors[0]["processor_name"], "screenshot_processor")
        self.assertEqual(errors[0]["context_count"], 3)
        self.assertEqual(errors[0]["timestamp"], timestamp.isoformat())


if __name__ == "__main__":
    unittest.main()

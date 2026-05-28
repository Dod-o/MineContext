import json
import tempfile
import types
import unittest
from pathlib import Path

from opencontext.plugins.plugin_manager import PluginManager


class PluginManagerTest(unittest.TestCase):
    def test_dispatches_matching_event_webhook(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            plugin_dir = Path(temp_dir)
            (plugin_dir / "automation.json").write_text(
                json.dumps(
                    {
                        "name": "automation",
                        "hooks": [
                            {"event": "todo", "url": "http://127.0.0.1:9000/todo"},
                            {"event": "activity", "url": "http://127.0.0.1:9000/activity"},
                        ],
                    }
                ),
                encoding="utf-8",
            )
            manager = PluginManager(plugin_dir=plugin_dir)
            sent = []
            manager._send_webhook = lambda hook, payload: sent.append((hook, payload))
            event = types.SimpleNamespace(
                to_dict=lambda: {"id": "evt-1", "type": "todo", "data": {"content": "ship"}}
            )

            manager.dispatch_event(event)

            self.assertEqual(len(sent), 1)
            hook, payload = sent[0]
            self.assertEqual(hook.plugin_name, "automation")
            self.assertEqual(hook.url, "http://127.0.0.1:9000/todo")
            self.assertEqual(payload["data"]["content"], "ship")

    def test_wildcard_hook_receives_all_events(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            plugin_dir = Path(temp_dir)
            (plugin_dir / "all-events.json").write_text(
                json.dumps(
                    {
                        "name": "all-events",
                        "hooks": [{"event": "*", "url": "https://example.com/hook"}],
                    }
                ),
                encoding="utf-8",
            )
            manager = PluginManager(plugin_dir=plugin_dir)
            sent = []
            manager._send_webhook = lambda hook, payload: sent.append((hook, payload))

            manager.dispatch_event({"id": "evt-2", "type": "daily_summary", "data": {}})

            self.assertEqual(len(sent), 1)
            self.assertEqual(sent[0][0].plugin_name, "all-events")

    def test_disabled_plugin_is_skipped(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            plugin_dir = Path(temp_dir)
            (plugin_dir / "disabled.json").write_text(
                json.dumps(
                    {
                        "name": "disabled",
                        "enabled": False,
                        "hooks": [{"event": "todo", "url": "https://example.com/hook"}],
                    }
                ),
                encoding="utf-8",
            )
            manager = PluginManager(plugin_dir=plugin_dir)

            self.assertEqual(manager.load_plugins(), [])


if __name__ == "__main__":
    unittest.main()

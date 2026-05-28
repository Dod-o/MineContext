# -*- coding: utf-8 -*-

# Copyright (c) 2025 Beijing Volcano Engine Technology Co., Ltd.
# SPDX-License-Identifier: Apache-2.0

"""
Lightweight plugin manager.

Plugins are JSON manifests stored in the plugin directory. The first supported
extension point is an event webhook hook:

{
  "name": "my-automation",
  "enabled": true,
  "hooks": [
    {"event": "todo", "url": "http://127.0.0.1:9000/minecontext"}
  ]
}
"""

import json
import os
import threading
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional
from urllib import request as urllib_request

from opencontext.utils.logging_utils import get_logger

logger = get_logger(__name__)


@dataclass
class PluginHook:
    plugin_name: str
    event: str
    url: str


class PluginManager:
    """Loads plugin manifests and dispatches supported hooks."""

    def __init__(self, plugin_dir: Optional[Path] = None, webhook_timeout: int = 5):
        self.plugin_dir = plugin_dir or self._default_plugin_dir()
        self.webhook_timeout = webhook_timeout
        self._hooks: List[PluginHook] = []
        self._lock = threading.Lock()

    @staticmethod
    def _default_plugin_dir() -> Path:
        configured_dir = os.getenv("OPENCONTEXT_PLUGIN_DIR")
        if configured_dir:
            return Path(os.path.expandvars(configured_dir)).expanduser().resolve()

        try:
            from opencontext.config.global_config import get_config

            plugin_config = get_config("plugins") or {}
            directory = plugin_config.get("directory")
            if directory:
                return Path(os.path.expandvars(directory)).expanduser().resolve()
        except Exception:
            pass

        context_path = Path(os.getenv("CONTEXT_PATH", ".")).expanduser().resolve()
        return context_path / "plugins"

    @staticmethod
    def _is_plugin_enabled(manifest: Dict[str, Any]) -> bool:
        return manifest.get("enabled") is not False

    @staticmethod
    def _iter_manifest_hooks(manifest: Dict[str, Any]) -> Iterable[Dict[str, Any]]:
        hooks = manifest.get("hooks", [])
        return hooks if isinstance(hooks, list) else []

    def load_plugins(self) -> List[PluginHook]:
        """Load enabled webhook hooks from plugin manifests."""
        hooks: List[PluginHook] = []
        if not self.plugin_dir.exists():
            with self._lock:
                self._hooks = []
            return hooks

        for manifest_path in sorted(self.plugin_dir.glob("*.json")):
            try:
                manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
                if not isinstance(manifest, dict) or not self._is_plugin_enabled(manifest):
                    continue
                plugin_name = str(manifest.get("name") or manifest_path.stem)
                for hook in self._iter_manifest_hooks(manifest):
                    if not isinstance(hook, dict):
                        continue
                    event = str(hook.get("event") or "").strip()
                    url = str(hook.get("url") or "").strip()
                    if event and url.startswith(("http://", "https://")):
                        hooks.append(PluginHook(plugin_name=plugin_name, event=event, url=url))
            except Exception as e:
                logger.warning(f"Skipping invalid plugin manifest {manifest_path}: {e}")

        with self._lock:
            self._hooks = hooks
        return hooks

    def _matching_hooks(self, event_type: str) -> List[PluginHook]:
        with self._lock:
            hooks = list(self._hooks)
        if not hooks:
            hooks = self.load_plugins()
        return [hook for hook in hooks if hook.event == event_type or hook.event == "*"]

    def dispatch_event(self, event: Any) -> None:
        """Dispatch a published OpenContext event to matching plugin hooks."""
        payload = event.to_dict() if hasattr(event, "to_dict") else dict(event)
        event_type = str(payload.get("type") or "")
        if not event_type:
            return

        for hook in self._matching_hooks(event_type):
            try:
                self._send_webhook(hook, payload)
            except Exception as e:
                logger.warning(f"Plugin hook {hook.plugin_name} failed for {event_type}: {e}")

    def dispatch_event_async(self, event: Any) -> None:
        thread = threading.Thread(
            target=self.dispatch_event,
            args=(event,),
            name="minecontext-plugin-dispatch",
            daemon=True,
        )
        thread.start()

    def _send_webhook(self, hook: PluginHook, event_payload: Dict[str, Any]) -> None:
        payload = {
            "plugin": hook.plugin_name,
            "event": event_payload,
        }
        request = urllib_request.Request(
            hook.url,
            data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib_request.urlopen(request, timeout=self.webhook_timeout) as response:
            response.read()


_plugin_manager: Optional[PluginManager] = None
_plugin_manager_lock = threading.Lock()


def get_plugin_manager() -> PluginManager:
    global _plugin_manager
    if _plugin_manager is None:
        with _plugin_manager_lock:
            if _plugin_manager is None:
                _plugin_manager = PluginManager()
    return _plugin_manager


def dispatch_event_async(event: Any) -> None:
    get_plugin_manager().dispatch_event_async(event)


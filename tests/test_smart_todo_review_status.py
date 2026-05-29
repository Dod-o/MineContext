import importlib.util
import sys
import types
import unittest
from pathlib import Path
from unittest.mock import Mock, patch


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


def _install_fake_dependencies():
    fake_config = types.ModuleType("opencontext.config.global_config")
    fake_config.get_config = lambda _path=None: {}
    fake_config.get_prompt_group = lambda _: {"system": "", "user": ""}
    _install_fake_module(fake_config.__name__, fake_config)

    fake_debug = types.ModuleType("opencontext.context_consumption.generation.debug_helper")
    fake_debug.DebugHelper = type("DebugHelper", (), {"save_generation_debug": staticmethod(lambda **_: None)})
    _install_fake_module(fake_debug.__name__, fake_debug)

    fake_vlm = types.ModuleType("opencontext.llm.global_vlm_client")
    fake_vlm.generate_with_messages = lambda *_args, **_kwargs: "[]"
    fake_vlm.get_prompt_model_profile = lambda *_args, **_kwargs: None
    _install_fake_module(fake_vlm.__name__, fake_vlm)

    fake_models = types.ModuleType("opencontext.models.context")

    class _ContextType:
        ACTIVITY_CONTEXT = types.SimpleNamespace(value="activity")
        SEMANTIC_CONTEXT = types.SimpleNamespace(value="semantic")
        INTENT_CONTEXT = types.SimpleNamespace(value="intent")
        ENTITY_CONTEXT = types.SimpleNamespace(value="entity")

    fake_models.ContextType = _ContextType
    fake_models.Vectorize = type("Vectorize", (), {"__init__": lambda self, text=None: setattr(self, "text", text)})
    _install_fake_module(fake_models.__name__, fake_models)

    fake_storage = types.ModuleType("opencontext.storage.global_storage")
    fake_storage.get_storage = lambda: None
    _install_fake_module(fake_storage.__name__, fake_storage)

    fake_json = types.ModuleType("opencontext.utils.json_parser")
    fake_json.parse_json_from_response = lambda _: []
    _install_fake_module(fake_json.__name__, fake_json)

    fake_logging = types.ModuleType("opencontext.utils.logging_utils")
    fake_logging.get_logger = lambda _: Mock()
    _install_fake_module(fake_logging.__name__, fake_logging)


_install_fake_dependencies()

module_path = (
    Path(__file__).resolve().parents[1]
    / "opencontext"
    / "context_consumption"
    / "generation"
    / "smart_todo_manager.py"
)
spec = importlib.util.spec_from_file_location("smart_todo_manager_for_test", module_path)
smart_todo_module = importlib.util.module_from_spec(spec)
assert spec and spec.loader
spec.loader.exec_module(smart_todo_module)
_restore_fake_modules()


class SmartTodoReviewStatusTest(unittest.TestCase):
    def test_generated_todos_are_inserted_for_review(self):
        manager = smart_todo_module.SmartTodoManager()
        storage = Mock()
        storage.insert_todo.return_value = 123
        storage.get_todos.return_value = []

        tasks = [
            {
                "description": "Review the release checklist",
                "priority": "high",
                "participants": ["Alice"],
                "reason": "Release work was visible in recent activity",
                "_embedding": [0.1, 0.2],
            }
        ]

        with (
            patch.object(manager, "_get_recent_activity_insights", return_value={}),
            patch.object(manager, "_get_task_relevant_contexts", return_value=[]),
            patch.object(manager, "_extract_tasks_from_contexts_enhanced", return_value=tasks),
            patch.object(smart_todo_module, "get_storage", return_value=storage),
        ):
            result = manager.generate_todo_tasks(start_time=1, end_time=2)

        self.assertEqual(result["todo_ids"], [123])
        self.assertIn("review", result["content"])
        self.assertEqual(
            storage.insert_todo.call_args.kwargs["status"],
            smart_todo_module.TODO_STATUS_REVIEW,
        )
        storage.upsert_todo_embedding.assert_called_once()

    def test_generated_todos_can_be_auto_added_by_config(self):
        manager = smart_todo_module.SmartTodoManager()
        storage = Mock()
        storage.insert_todo.return_value = 124
        storage.get_todos.return_value = []

        tasks = [
            {
                "description": "Send the meeting notes",
                "priority": "medium",
                "participants": [],
                "reason": "Meeting wrap-up was visible in recent activity",
            }
        ]

        with (
            patch.object(manager, "_get_recent_activity_insights", return_value={}),
            patch.object(manager, "_get_task_relevant_contexts", return_value=[]),
            patch.object(manager, "_extract_tasks_from_contexts_enhanced", return_value=tasks),
            patch.object(smart_todo_module, "get_storage", return_value=storage),
            patch.object(
                smart_todo_module,
                "get_config",
                return_value={"approval_mode": smart_todo_module.TODO_APPROVAL_MODE_AUTO_ADD},
            ),
        ):
            result = manager.generate_todo_tasks(start_time=1, end_time=2)

        self.assertEqual(result["todo_ids"], [124])
        self.assertEqual(result["approval_mode"], smart_todo_module.TODO_APPROVAL_MODE_AUTO_ADD)
        self.assertIn("added", result["content"])
        self.assertEqual(
            storage.insert_todo.call_args.kwargs["status"],
            smart_todo_module.TODO_STATUS_PENDING,
        )

    def test_existing_user_todos_are_passed_to_extraction(self):
        manager = smart_todo_module.SmartTodoManager()
        storage = Mock()
        storage.get_todos.return_value = [
            {
                "id": 10,
                "content": "Prepare the launch plan",
                "status": 0,
                "urgency": 2,
                "reason": "Manually added by user",
                "start_time": "2026-05-28 09:00:00",
                "end_time": None,
            },
            {
                "id": 11,
                "content": "Unconfirmed generated suggestion",
                "status": smart_todo_module.TODO_STATUS_REVIEW,
                "urgency": 1,
                "reason": "Generated from context",
                "start_time": "2026-05-28 09:00:00",
                "end_time": None,
            },
        ]
        extractor = Mock(return_value=[])

        with (
            patch.object(manager, "_get_recent_activity_insights", return_value={}),
            patch.object(manager, "_get_task_relevant_contexts", return_value=[]),
            patch.object(manager, "_extract_tasks_from_contexts_enhanced", extractor),
            patch.object(smart_todo_module, "get_storage", return_value=storage),
        ):
            result = manager.generate_todo_tasks(start_time=1, end_time=2)

        self.assertIsNone(result)
        historical_todos = extractor.call_args.args[4]
        self.assertEqual([todo["id"] for todo in historical_todos], [10])
        self.assertEqual(historical_todos[0]["status_label"], "pending")


if __name__ == "__main__":
    unittest.main()

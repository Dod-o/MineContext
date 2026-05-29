import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT / "config" / "config.yaml"
SMART_TODO = ROOT / "opencontext" / "context_consumption" / "generation" / "smart_todo_manager.py"
CONSUMPTION_MANAGER = ROOT / "opencontext" / "managers" / "consumption_manager.py"
CONTENT_GENERATION_ROUTE = ROOT / "opencontext" / "server" / "routes" / "content_generation.py"
SETTINGS_SERVICE = ROOT / "frontend" / "src" / "renderer" / "src" / "services" / "Settings.ts"
SETTINGS_PAGE = ROOT / "frontend" / "src" / "renderer" / "src" / "pages" / "settings" / "settings.tsx"
WEB_SETTINGS_HTML = ROOT / "opencontext" / "web" / "templates" / "settings.html"
WEB_SETTINGS_JS = ROOT / "opencontext" / "web" / "static" / "js" / "settings.js"


class TodoApprovalModeStaticTest(unittest.TestCase):
    def test_backend_config_and_generation_support_review_or_auto_add(self):
        config = CONFIG.read_text(encoding="utf-8")
        smart_todo = SMART_TODO.read_text(encoding="utf-8")
        manager = CONSUMPTION_MANAGER.read_text(encoding="utf-8")
        route = CONTENT_GENERATION_ROUTE.read_text(encoding="utf-8")

        self.assertIn('approval_mode: "review"', config)
        self.assertIn('TODO_APPROVAL_MODE_AUTO_ADD = "auto_add"', smart_todo)
        self.assertIn("TODO_STATUS_PENDING", smart_todo)
        self.assertIn("approval_mode = self._get_todo_approval_mode()", smart_todo)
        self.assertIn("status=todo_status", smart_todo)
        self.assertIn("self._todo_approval_mode", manager)
        self.assertIn('"approval_mode": self._todo_approval_mode', manager)
        self.assertIn('pattern="^(review|auto_add)$"', route)
        self.assertIn('task_dict["approval_mode"] = task_config.approval_mode', route)

    def test_electron_settings_page_exposes_todo_approval_mode(self):
        service = SETTINGS_SERVICE.read_text(encoding="utf-8")
        page = SETTINGS_PAGE.read_text(encoding="utf-8")

        self.assertIn("export type TodoApprovalMode = 'review' | 'auto_add'", service)
        self.assertIn("approval_mode?: TodoApprovalMode", service)
        self.assertIn("approval_mode: 'review'", page)
        self.assertIn("normalizeTodoApprovalMode", page)
        self.assertIn("approval_mode: value as TodoApprovalMode", page)
        self.assertIn('<Radio value="review">{t(\'Review\'', page)
        self.assertIn('<Radio value="auto_add">{t(\'Auto add\'', page)

    def test_web_settings_page_preserves_todo_approval_mode(self):
        html = WEB_SETTINGS_HTML.read_text(encoding="utf-8")
        script = WEB_SETTINGS_JS.read_text(encoding="utf-8")

        self.assertIn('id="todos_approval_mode"', html)
        self.assertIn('value="review"', html)
        self.assertIn('value="auto_add"', html)
        self.assertIn("gen.todos?.approval_mode || 'review'", script)
        self.assertIn("approval_mode: document.getElementById('todos_approval_mode').value", script)


if __name__ == "__main__":
    unittest.main()

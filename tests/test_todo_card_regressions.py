import unittest
from pathlib import Path


TODO_CARD_PATH = (
    Path(__file__).resolve().parents[1]
    / "frontend"
    / "src"
    / "renderer"
    / "src"
    / "pages"
    / "home"
    / "components"
    / "to-do-card"
    / "index.tsx"
)


class TodoCardRegressionTest(unittest.TestCase):
    def test_create_todo_opens_blank_form(self):
        source = TODO_CARD_PATH.read_text(encoding="utf-8")

        self.assertIn("const handleCreateToDoList", source)
        self.assertIn("form.resetFields()", source)
        self.assertIn("content: ''", source)
        self.assertIn("urgency: TaskUrgency.Low", source)
        self.assertIn("setStatus(TODO_LIST_STATUS.Create)", source)


if __name__ == "__main__":
    unittest.main()

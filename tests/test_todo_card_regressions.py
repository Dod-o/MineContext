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

    def test_batch_todo_controls_are_available(self):
        source = TODO_CARD_PATH.read_text(encoding="utf-8")

        self.assertIn("const handleDeleteSelectedTasks", source)
        self.assertIn("const handleToggleBatchMode", source)
        self.assertIn("IconSelectAll", source)
        self.assertIn("{isBatchMode ? 'Cancel' : 'Batch'}", source)
        self.assertIn("selectedVisibleTaskIds.length === 0", source)

    def test_generated_todo_review_queue_has_bulk_actions(self):
        source = TODO_CARD_PATH.read_text(encoding="utf-8")

        self.assertIn("TaskStatus.Review", source)
        self.assertIn("handleConfirmAllGeneratedTasks", source)
        self.assertIn("handleDeleteAllGeneratedTasks", source)
        self.assertIn(">Suggested</Text>", source)
        self.assertIn("Add all", source)
        self.assertIn("Delete all", source)


if __name__ == "__main__":
    unittest.main()

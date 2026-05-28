import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MAIN_ENTRY = ROOT / "frontend" / "src" / "main" / "index.ts"


class SingleInstanceLockStaticTest(unittest.TestCase):
    def test_electron_main_process_enforces_single_instance_lock(self):
        main_entry = MAIN_ENTRY.read_text(encoding="utf-8")

        self.assertIn("const gotLock = app.requestSingleInstanceLock()", main_entry)
        self.assertIn("if (!gotLock)", main_entry)
        self.assertIn("app.quit()", main_entry)
        self.assertIn("process.exit(0)", main_entry)
        self.assertIn("app.on('second-instance'", main_entry)
        self.assertIn("BrowserWindow.getAllWindows()[0]", main_entry)
        self.assertIn("if (win.isMinimized()) win.restore()", main_entry)
        self.assertIn("win.show()", main_entry)
        self.assertIn("win.focus()", main_entry)


if __name__ == "__main__":
    unittest.main()

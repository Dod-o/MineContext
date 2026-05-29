import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
README = ROOT / "README.md"
README_ZH = ROOT / "README_zh.md"
INIT_TODOS = ROOT / "frontend" / "src" / "renderer" / "src" / "hooks" / "use-init-prepare-data.ts"
TRAY_SERVICE = ROOT / "frontend" / "src" / "main" / "services" / "TrayService.ts"


class ChineseVersionStaticTest(unittest.TestCase):
    def test_chinese_readme_is_discoverable(self):
        readme = README.read_text(encoding="utf-8")
        readme_zh = README_ZH.read_text(encoding="utf-8")

        self.assertIn("[中文](README_zh.md)", readme)
        self.assertIn("MineContext 是什么", readme_zh)
        self.assertIn("快速开始", readme_zh)

    def test_first_run_todos_follow_chinese_language(self):
        init_todos = INIT_TODOS.read_text(encoding="utf-8")

        self.assertIn("resolveAppLanguage(settings.language, navigator.language)", init_todos)
        self.assertIn("点击【创作】中的【从教程开始】", init_todos)
        self.assertIn("进入【屏幕记录】中的【设置】", init_todos)
        self.assertIn("点击屏幕右上角的【与 AI 聊天】", init_todos)
        self.assertIn("localizeInitialTodoList", init_todos)

    def test_tray_menu_has_chinese_labels(self):
        tray = TRAY_SERVICE.read_text(encoding="utf-8")

        self.assertIn("recording: '录制中'", tray)
        self.assertIn("showMainWindow: '显示主窗口'", tray)
        self.assertIn("quit: '退出 MineContext'", tray)
        self.assertIn("resolveAppLanguage(this.language, app.getLocale())", tray)


if __name__ == "__main__":
    unittest.main()

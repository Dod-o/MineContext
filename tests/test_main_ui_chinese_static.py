import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PRELOAD = ROOT / "frontend" / "src" / "preload" / "index.ts"
LANGUAGE_HOOK = ROOT / "frontend" / "src" / "renderer" / "src" / "hooks" / "use-app-language.ts"
SIDEBAR = ROOT / "frontend" / "src" / "renderer" / "src" / "components" / "Sidebar" / "index.tsx"
AI_ASSISTANT = ROOT / "frontend" / "src" / "renderer" / "src" / "components" / "ai-assistant" / "index.tsx"
AI_HEADER = ROOT / "frontend" / "src" / "renderer" / "src" / "components" / "ai-assistant" / "header.tsx"
HOME = ROOT / "frontend" / "src" / "renderer" / "src" / "pages" / "home" / "home-page.tsx"
CHAT_CARD = (
    ROOT
    / "frontend"
    / "src"
    / "renderer"
    / "src"
    / "pages"
    / "home"
    / "components"
    / "chat-card"
    / "chat-card.tsx"
)
TODO_CARD = (
    ROOT
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
PROACTIVE_FEED = (
    ROOT
    / "frontend"
    / "src"
    / "renderer"
    / "src"
    / "pages"
    / "home"
    / "components"
    / "proactive-feed-card"
    / "index.tsx"
)
SCREEN_HEADER = (
    ROOT
    / "frontend"
    / "src"
    / "renderer"
    / "src"
    / "pages"
    / "screen-monitor"
    / "components"
    / "screen-monitor-header.tsx"
)
SCREEN_EMPTY = (
    ROOT
    / "frontend"
    / "src"
    / "renderer"
    / "src"
    / "pages"
    / "screen-monitor"
    / "components"
    / "empty-state-placeholder.tsx"
)


class MainUiChineseStaticTest(unittest.TestCase):
    def test_renderer_language_hook_tracks_runtime_language(self):
        hook = LANGUAGE_HOOK.read_text(encoding="utf-8")
        preload = PRELOAD.read_text(encoding="utf-8")

        self.assertIn("export function useLocalizedText()", hook)
        self.assertIn("resolveAppLanguage(language, navigator.language)", hook)
        self.assertIn("window.api.getRuntimeSettings()", hook)
        self.assertIn("app-language-updated", hook)
        self.assertIn("window.dispatchEvent(new CustomEvent('app-language-updated'", preload)

    def test_home_and_sidebar_have_chinese_labels(self):
        sidebar = SIDEBAR.read_text(encoding="utf-8")
        home = HOME.read_text(encoding="utf-8")
        chat_card = CHAT_CARD.read_text(encoding="utf-8")
        todo_card = TODO_CARD.read_text(encoding="utf-8")
        proactive_feed = PROACTIVE_FEED.read_text(encoding="utf-8")

        self.assertIn("t('Home', '首页')", sidebar)
        self.assertIn("t('Screen Monitor', '屏幕记录')", sidebar)
        self.assertIn("每日摘要", home)
        self.assertIn("t('Recent chat', '最近聊天')", chat_card)
        self.assertIn("t('Todo', '待办')", todo_card)
        self.assertIn("t('Add todo', '添加待办')", todo_card)
        self.assertIn("t('Daily Summary', '每日摘要')", proactive_feed)
        self.assertIn("主动洞察会显示在这里", proactive_feed)

    def test_ai_assistant_has_chinese_empty_and_input_states(self):
        assistant = AI_ASSISTANT.read_text(encoding="utf-8")
        header = AI_HEADER.read_text(encoding="utf-8")

        self.assertIn("t('New chat', '新聊天')", header)
        self.assertIn("t('AI is thinking...', 'AI 正在思考...')", assistant)
        self.assertIn("t('Ask me anything', '随便问我')", assistant)
        self.assertIn("我是你的上下文感知 AI 伙伴", assistant)
        self.assertIn("总结我最近的成长", assistant)

    def test_screen_monitor_key_actions_have_chinese_labels(self):
        header = SCREEN_HEADER.read_text(encoding="utf-8")
        empty = SCREEN_EMPTY.read_text(encoding="utf-8")

        self.assertIn("t('Screen Monitor', '屏幕记录')", header)
        self.assertIn("t('Settings', '设置')", header)
        self.assertIn("t('Capture Now', '立即捕捉')", header)
        self.assertIn("t('Record Audio', '录制音频')", header)
        self.assertIn("t('Record Video', '录制视频')", header)
        self.assertIn("t('Start Recording', '开始记录')", header)
        self.assertIn("t('Enable Permission', '开启权限')", empty)
        self.assertIn("t('No data available', '暂无数据')", empty)


if __name__ == "__main__":
    unittest.main()

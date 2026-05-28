import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
USE_CHAT_STREAM = ROOT / "frontend" / "src" / "renderer" / "src" / "hooks" / "use-chat-stream.ts"
CHAT_STREAM_SERVICE = (
    ROOT / "frontend" / "src" / "renderer" / "src" / "services" / "ChatStreamService.ts"
)
AGENT_CHAT_ROUTE = ROOT / "opencontext" / "server" / "routes" / "agent_chat.py"


class BackgroundChatGenerationStaticTest(unittest.TestCase):
    def test_assistant_unmount_does_not_abort_stream_generation(self):
        hook = USE_CHAT_STREAM.read_text(encoding="utf-8")

        self.assertIn("Keep the singleton stream alive when the assistant pane unmounts", hook)
        self.assertNotIn("useEffect(() =>", hook)
        self.assertNotIn("return () => {\n      chatStreamService.abortStream()", hook)

    def test_explicit_user_actions_can_still_abort_stream_generation(self):
        hook = USE_CHAT_STREAM.read_text(encoding="utf-8")
        service = CHAT_STREAM_SERVICE.read_text(encoding="utf-8")

        self.assertIn("private abortController?: AbortController", service)
        self.assertIn("abortStream(): void", service)
        self.assertIn("this.abortController.abort()", service)
        self.assertIn("const clearChat = useCallback(() => {", hook)
        self.assertIn("const stopStreaming = useCallback(() => {", hook)
        self.assertGreaterEqual(hook.count("chatStreamService.abortStream()"), 2)

    def test_backend_stream_persists_chunks_for_later_reload(self):
        route = AGENT_CHAT_ROUTE.read_text(encoding="utf-8")

        self.assertIn("storage.create_streaming_message", route)
        self.assertIn("storage.append_message_content", route)
        self.assertIn("accumulated_content += event.content", route)
        self.assertIn("storage.mark_message_finished", route)
        self.assertIn('media_type="text/event-stream"', route)


if __name__ == "__main__":
    unittest.main()

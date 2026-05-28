import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MEDIA_ROUTE = ROOT / "opencontext" / "server" / "routes" / "media.py"
SETTINGS_SERVICE = ROOT / "frontend" / "src" / "renderer" / "src" / "services" / "Settings.ts"
SCREEN_MONITOR = ROOT / "frontend" / "src" / "renderer" / "src" / "pages" / "screen-monitor" / "screen-monitor.tsx"
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


class AudioRecordingStaticTest(unittest.TestCase):
    def test_backend_accepts_audio_recording_uploads(self):
        route = MEDIA_ROUTE.read_text(encoding="utf-8")

        self.assertIn('@router.post("/api/media_context/upload")', route)
        self.assertIn("UploadFile = File(...)", route)
        self.assertIn("media_type: str = Form(...)", route)
        self.assertIn("context_root / \"media\" / media_type", route)
        self.assertIn("Media context must include a summary, transcript, or media file path", route)
        self.assertIn("_default_media_summary", route)

    def test_frontend_upload_service_uses_multipart_form_data(self):
        service = SETTINGS_SERVICE.read_text(encoding="utf-8")

        self.assertIn("UploadMediaContextParams", service)
        self.assertIn("uploadMediaContextAPI", service)
        self.assertIn("new FormData()", service)
        self.assertIn("formData.append('media_type', params.mediaType)", service)
        self.assertIn("axiosInstance.post('/api/media_context/upload'", service)

    def test_screen_monitor_records_microphone_audio(self):
        page = SCREEN_MONITOR.read_text(encoding="utf-8")
        header = SCREEN_HEADER.read_text(encoding="utf-8")

        self.assertIn("navigator.mediaDevices.getUserMedia({ audio: true })", page)
        self.assertIn("new MediaRecorder(stream", page)
        self.assertIn("uploadMediaContextAPI({", page)
        self.assertIn("mediaType: 'audio'", page)
        self.assertIn("audioRecording", header)
        self.assertIn("Record Audio", header)
        self.assertIn("Stop Audio", header)
        self.assertIn("IconVoice", header)


if __name__ == "__main__":
    unittest.main()

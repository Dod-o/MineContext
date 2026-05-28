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


class VideoRecordingStaticTest(unittest.TestCase):
    def test_backend_upload_route_supports_video_recordings(self):
        route = MEDIA_ROUTE.read_text(encoding="utf-8")

        self.assertIn('return normalized if normalized in {"audio", "video"} else None', route)
        self.assertIn("context_root / \"media\" / media_type", route)
        self.assertIn('title=title or f"{normalized_media_type.title()} recording"', route)
        self.assertIn('"media_type": request.media_type', route)

    def test_frontend_upload_service_supports_video_media_type(self):
        service = SETTINGS_SERVICE.read_text(encoding="utf-8")

        self.assertIn("mediaType: 'audio' | 'video'", service)
        self.assertIn("formData.append('media_type', params.mediaType)", service)

    def test_screen_monitor_records_display_video(self):
        page = SCREEN_MONITOR.read_text(encoding="utf-8")
        header = SCREEN_HEADER.read_text(encoding="utf-8")

        self.assertIn("navigator.mediaDevices.getDisplayMedia", page)
        self.assertIn("'video/webm;codecs=vp9,opus'", page)
        self.assertIn("mediaType: 'video'", page)
        self.assertIn("Screen video recording captured", page)
        self.assertIn("videoRecording", header)
        self.assertIn("Record Video", header)
        self.assertIn("Stop Video", header)
        self.assertIn("IconVideoCamera", header)


if __name__ == "__main__":
    unittest.main()

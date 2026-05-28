import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MEDIA_ROUTE = ROOT / "opencontext" / "server" / "routes" / "media.py"
API_ROUTE = ROOT / "opencontext" / "server" / "api.py"
RAW_MEDIA = ROOT / "opencontext" / "utils" / "raw_context_media.py"


class MediaContextCaptureStaticTest(unittest.TestCase):
    def test_media_context_route_indexes_transcripts_as_input_context(self):
        route = MEDIA_ROUTE.read_text(encoding="utf-8")

        self.assertIn('@router.post("/api/media_context/capture")', route)
        self.assertIn('media_type: str = Field(pattern="^(audio|video)$")', route)
        self.assertIn("Media context must include a summary, transcript, or media file path", route)
        self.assertIn("ContextSource.INPUT", route)
        self.assertIn("ContentFormat.TEXT", route)
        self.assertIn("opencontext.add_context(raw_context)", route)

    def test_media_route_is_registered(self):
        api = API_ROUTE.read_text(encoding="utf-8")

        self.assertIn("media,", api)
        self.assertIn("router.include_router(media.router)", api)

    def test_audio_suffixes_are_allowed_as_context_media(self):
        media = RAW_MEDIA.read_text(encoding="utf-8")

        self.assertIn('".mp3"', media)
        self.assertIn('".m4a"', media)
        self.assertIn('".wav"', media)
        self.assertIn('".ogg"', media)


if __name__ == "__main__":
    unittest.main()

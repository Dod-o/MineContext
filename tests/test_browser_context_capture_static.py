import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DOCUMENTS_ROUTE = ROOT / "opencontext" / "server" / "routes" / "documents.py"
WEB_LINK_CAPTURE = ROOT / "opencontext" / "context_capture" / "web_link_capture.py"


class BrowserContextCaptureStaticTest(unittest.TestCase):
    def test_browser_context_capture_endpoint_queues_web_link_document(self):
        route = DOCUMENTS_ROUTE.read_text(encoding="utf-8")

        self.assertIn('class CaptureBrowserContextRequest(BaseModel):', route)
        self.assertIn('@router.post("/api/browser_context/capture"', route)
        self.assertIn("ContextSource.WEB_LINK", route)
        self.assertIn("ContentFormat.FILE", route)
        self.assertIn("filter_path=request.url", route)
        self.assertIn('"browser_context": True', route)

    def test_browser_context_requires_url_metadata(self):
        route = DOCUMENTS_ROUTE.read_text(encoding="utf-8")

        self.assertIn("Browser context URL must be http or https", route)
        self.assertIn("Browser context must include a title, summary, or content", route)

    def test_weblink_upload_preserves_filename_hint_without_duplicate_capture(self):
        route = DOCUMENTS_ROUTE.read_text(encoding="utf-8")
        capture = WEB_LINK_CAPTURE.read_text(encoding="utf-8")

        self.assertIn("component.submit_url(request.url, request.filename_hint)", route)
        self.assertNotIn("component.capture()", route)
        self.assertIn("filename_hint: Optional[str] = None", capture)
        self.assertIn("self._filename_hints.get(url)", capture)


if __name__ == "__main__":
    unittest.main()

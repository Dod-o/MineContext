import asyncio
import importlib.util
import json
import sys
import types
import unittest
from datetime import datetime
from pathlib import Path

from opencontext.models.context import RawContextProperties
from opencontext.models.enums import ContentFormat, ContextSource


class FakeAPIRouter:
    def __init__(self, *args, **kwargs):
        pass

    def get(self, *args, **kwargs):
        return lambda func: func

    def post(self, *args, **kwargs):
        return lambda func: func


class FakeHTTPException(Exception):
    def __init__(self, status_code, detail=None):
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


class FakeJinja2Templates:
    def __init__(self, *args, **kwargs):
        pass

    def TemplateResponse(self, *args, **kwargs):
        return None


class FakeJSONResponse:
    def __init__(self, status_code=200, content=None):
        self.status_code = status_code
        self.body = json.dumps(content or {}).encode("utf-8")


fake_fastapi = types.ModuleType("fastapi")
fake_fastapi.APIRouter = FakeAPIRouter
fake_fastapi.Depends = lambda dependency=None: dependency
fake_fastapi.HTTPException = FakeHTTPException
fake_fastapi.Query = lambda default=None, *args, **kwargs: default
fake_fastapi.Request = type("Request", (), {})
sys.modules.setdefault(fake_fastapi.__name__, fake_fastapi)

fake_fastapi_responses = types.ModuleType("fastapi.responses")
fake_fastapi_responses.HTMLResponse = type("HTMLResponse", (), {})
fake_fastapi_responses.JSONResponse = FakeJSONResponse
sys.modules.setdefault(fake_fastapi_responses.__name__, fake_fastapi_responses)

fake_fastapi_templating = types.ModuleType("fastapi.templating")
fake_fastapi_templating.Jinja2Templates = FakeJinja2Templates
sys.modules.setdefault(fake_fastapi_templating.__name__, fake_fastapi_templating)

fake_auth_module = types.ModuleType("opencontext.server.middleware.auth")
fake_auth_module.auth_dependency = "auth_disabled"
sys.modules.setdefault(fake_auth_module.__name__, fake_auth_module)

fake_opencontext_module = types.ModuleType("opencontext.server.opencontext")
fake_opencontext_module.OpenContext = type("OpenContext", (), {})
sys.modules.setdefault(fake_opencontext_module.__name__, fake_opencontext_module)

fake_server_utils = types.ModuleType("opencontext.server.utils")


def convert_resp(data=None, code=0, status=200, message="success"):
    content = {"code": code, "status": status, "message": message}
    if data is not None:
        content["data"] = data
    return FakeJSONResponse(status_code=status, content=content)


fake_server_utils.convert_resp = convert_resp
fake_server_utils.get_context_lab = lambda request=None: None
sys.modules.setdefault(fake_server_utils.__name__, fake_server_utils)

from opencontext.server.routes.context import ManualContextIn, add_manual_context

module_path = (
    Path(__file__).resolve().parents[1] / "opencontext" / "managers" / "processor_manager.py"
)
spec = importlib.util.spec_from_file_location("processor_manager_for_test", module_path)
processor_manager_module = importlib.util.module_from_spec(spec)
assert spec and spec.loader
spec.loader.exec_module(processor_manager_module)
ContextProcessorManager = processor_manager_module.ContextProcessorManager


class FakeOpenContext:
    def __init__(self, accepted=True):
        self.accepted = accepted
        self.contexts = []

    def add_context(self, context_data):
        self.contexts.append(context_data)
        return self.accepted


class RecordingDocumentProcessor:
    def __init__(self):
        self.processed = []

    def get_name(self):
        return "document_processor"

    def get_statistics(self):
        return {}

    def can_process(self, context):
        return context.source == ContextSource.INPUT

    def process(self, context):
        self.processed.append(context)
        return True

    def shutdown(self):
        pass

    def reset_statistics(self):
        pass


def decode_response(response):
    return json.loads(response.body.decode("utf-8"))


class ManualContextCaptureTest(unittest.TestCase):
    def test_manual_context_endpoint_queues_text_input(self):
        fake_opencontext = FakeOpenContext()
        occurred_at = datetime(2026, 5, 28, 9, 30)
        response = asyncio.run(
            add_manual_context(
                ManualContextIn(
                    title="Planning notes",
                    content="Replace automatic screenshot capture with concise manual context.",
                    occurred_at=occurred_at,
                ),
                fake_opencontext,
                "auth_disabled",
            )
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(decode_response(response)["code"], 0)
        self.assertEqual(len(fake_opencontext.contexts), 1)

        raw_context = fake_opencontext.contexts[0]
        self.assertEqual(raw_context.source, ContextSource.INPUT)
        self.assertEqual(raw_context.content_format, ContentFormat.TEXT)
        self.assertEqual(raw_context.create_time, occurred_at)
        self.assertEqual(raw_context.content_type, "manual_context")
        self.assertIn("Planning notes", raw_context.content_text)
        self.assertIn("concise manual context", raw_context.content_text)
        self.assertEqual(raw_context.additional_info["capture_mode"], "manual")

    def test_manual_context_endpoint_rejects_empty_content(self):
        fake_opencontext = FakeOpenContext()
        response = asyncio.run(
            add_manual_context(
                ManualContextIn(content="   "),
                fake_opencontext,
                "auth_disabled",
            )
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(decode_response(response)["code"], 400)
        self.assertEqual(fake_opencontext.contexts, [])

    def test_processor_manager_routes_manual_input_to_document_processor(self):
        manager = ContextProcessorManager()
        processor = RecordingDocumentProcessor()
        manager.register_processor(processor)
        raw_context = RawContextProperties(
            source=ContextSource.INPUT,
            content_format=ContentFormat.TEXT,
            content_text="Manually entered screenshot details.",
            create_time=datetime(2026, 5, 28, 9, 45),
        )

        self.assertTrue(manager.process(raw_context))
        self.assertEqual(processor.processed, [raw_context])


if __name__ == "__main__":
    unittest.main()

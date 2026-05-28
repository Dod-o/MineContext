#!/usr/bin/env python
# -*- coding: utf-8 -*-

# Copyright (c) 2025 Beijing Volcano Engine Technology Co., Ltd.
# SPDX-License-Identifier: Apache-2.0

"""
Document upload API routes
Follows the architecture of screenshots.py, managed through OpenContext class
"""

import datetime
import hashlib
import os
import re
from pathlib import Path
from typing import Optional
from urllib.parse import urlparse

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from opencontext.models.context import RawContextProperties
from opencontext.models.enums import ContentFormat, ContextSource
from opencontext.server.middleware.auth import auth_dependency
from opencontext.server.opencontext import OpenContext
from opencontext.server.utils import convert_resp, get_context_lab
from opencontext.utils.logging_utils import get_logger

logger = get_logger(__name__)
router = APIRouter(tags=["documents"])


class UploadDocumentRequest(BaseModel):
    """Document upload request (local path)"""

    file_path: str


class UploadWebLinkRequest(BaseModel):
    """Web link upload request"""

    url: str
    filename_hint: Optional[str] = None


class CaptureBrowserContextRequest(BaseModel):
    """Browser context captured by a browser extension or local history bridge."""

    url: str
    title: Optional[str] = None
    summary: Optional[str] = None
    content: Optional[str] = None
    captured_at: Optional[datetime.datetime] = None
    browser: Optional[str] = None


def _is_http_url(url: str) -> bool:
    parsed = urlparse(url)
    return parsed.scheme in {"http", "https"} and bool(parsed.netloc)


def _safe_context_filename(url: str, title: Optional[str]) -> str:
    source = title or urlparse(url).netloc or "browser-context"
    slug = re.sub(r"[^A-Za-z0-9._-]+", "-", source).strip("-._").lower()
    slug = slug[:72] or "browser-context"
    digest = hashlib.sha256(url.encode("utf-8")).hexdigest()[:10]
    return f"{slug}-{digest}.md"


def _browser_context_output_dir() -> Path:
    context_path = Path(os.getenv("CONTEXT_PATH", ".")).expanduser().resolve()
    return context_path / "uploads" / "browser_context"


def _build_browser_context_markdown(request: CaptureBrowserContextRequest) -> str:
    title = (request.title or request.url).strip()
    captured_at = request.captured_at or datetime.datetime.now()
    sections = [
        f"# {title}",
        "",
        f"- Source URL: {request.url}",
        f"- Captured at: {captured_at.isoformat()}",
    ]
    if request.browser:
        sections.append(f"- Browser: {request.browser}")
    sections.append("")

    if request.summary:
        sections.extend(["## Page Summary", "", request.summary.strip(), ""])
    if request.content:
        sections.extend(["## Page Content", "", request.content.strip(), ""])
    return "\n".join(sections).strip() + "\n"


@router.post("/api/documents/upload", response_class=JSONResponse)
async def upload_document(
    request: UploadDocumentRequest,
    opencontext: OpenContext = Depends(get_context_lab),
    _auth: str = auth_dependency,
):
    """
    Upload a single document (local path)

    Add document to processing queue via OpenContext.add_document()
    """
    try:
        err_msg = opencontext.add_document(
            file_path=request.file_path,
        )
        if err_msg:
            return convert_resp(code=400, status=400, message=err_msg)
        return convert_resp(message="Document queued for processing successfully")
    except Exception as e:
        logger.exception(f"Error adding document: {e}")
        return convert_resp(code=500, status=500, message="Internal server error")


@router.post("/api/weblinks/upload", response_class=JSONResponse)
async def upload_weblink(
    request: UploadWebLinkRequest,
    opencontext: OpenContext = Depends(get_context_lab),
    _auth: str = auth_dependency,
):
    """
    Submit a web link to be converted to PDF and processed.
    If the capture component is not initialized via config, initialize it lazily with defaults.
    """
    try:
        capture_manager = opencontext.capture_manager
        component = capture_manager.get_component("web_link_capture")
        if component is None:
            from opencontext.context_capture.web_link_capture import WebLinkCapture

            component = WebLinkCapture()
            default_config = {
                "enabled": True,
                "auto_capture": True,
                "capture_interval": 1.0,
                "output_dir": "uploads/weblinks",
            }
            capture_manager.register_component("web_link_capture", component)
            capture_manager.initialize_component("web_link_capture", default_config)
            capture_manager.start_component("web_link_capture")

        captured_contexts = component.submit_url(request.url, request.filename_hint)
        if not captured_contexts:
            return convert_resp(code=400, status=400, message="Failed to queue URL")

        return convert_resp(message="Web link queued for processing successfully")
    except Exception as e:
        logger.exception(f"Error queuing web link: {e}")
        return convert_resp(code=500, status=500, message="Internal server error")


@router.post("/api/browser_context/capture", response_class=JSONResponse)
async def capture_browser_context(
    request: CaptureBrowserContextRequest,
    opencontext: OpenContext = Depends(get_context_lab),
    _auth: str = auth_dependency,
):
    """
    Capture browser URL, page title, summary, and readable page content.

    This endpoint is designed for browser extensions or local history bridges that can
    provide URL metadata not visible in screenshots.
    """
    try:
        if not _is_http_url(request.url):
            return convert_resp(code=400, status=400, message="Browser context URL must be http or https")
        if not any([request.title, request.summary, request.content]):
            return convert_resp(
                code=400,
                status=400,
                message="Browser context must include a title, summary, or content",
            )

        output_dir = _browser_context_output_dir()
        output_dir.mkdir(parents=True, exist_ok=True)
        output_path = output_dir / _safe_context_filename(request.url, request.title)
        output_path.write_text(_build_browser_context_markdown(request), encoding="utf-8")

        raw_context = RawContextProperties(
            source=ContextSource.WEB_LINK,
            content_format=ContentFormat.FILE,
            content_path=str(output_path),
            content_text="",
            create_time=request.captured_at or datetime.datetime.now(),
            filter_path=request.url,
            additional_info={
                "url": request.url,
                "title": request.title,
                "browser": request.browser,
                "browser_context": True,
            },
            enable_merge=False,
        )
        if not opencontext.add_context(raw_context):
            return convert_resp(code=500, status=500, message="Failed to queue browser context")

        return convert_resp(
            message="Browser context queued for processing successfully",
            data={"path": str(output_path)},
        )
    except Exception as e:
        logger.exception(f"Error capturing browser context: {e}")
        return convert_resp(code=500, status=500, message="Internal server error")

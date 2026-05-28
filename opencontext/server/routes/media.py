# -*- coding: utf-8 -*-

# Copyright (c) 2025 Beijing Volcano Engine Technology Co., Ltd.
# SPDX-License-Identifier: Apache-2.0

"""Media context capture routes for audio/video transcripts."""

import datetime
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from opencontext.models.context import RawContextProperties
from opencontext.models.enums import ContentFormat, ContextSource
from opencontext.server.middleware.auth import auth_dependency
from opencontext.server.opencontext import OpenContext
from opencontext.server.utils import convert_resp, get_context_lab
from opencontext.utils.logging_utils import get_logger

logger = get_logger(__name__)
router = APIRouter(tags=["media-context"])


class CaptureMediaContextRequest(BaseModel):
    media_type: str = Field(pattern="^(audio|video)$")
    transcript: Optional[str] = None
    summary: Optional[str] = None
    title: Optional[str] = None
    file_path: Optional[str] = None
    started_at: Optional[datetime.datetime] = None
    ended_at: Optional[datetime.datetime] = None


def _build_media_context_text(request: CaptureMediaContextRequest) -> str:
    title = request.title or f"{request.media_type.title()} recording"
    captured_at = request.started_at or datetime.datetime.now()
    lines = [
        f"# {title}",
        "",
        f"- Media type: {request.media_type}",
        f"- Captured at: {captured_at.isoformat()}",
    ]
    if request.ended_at:
        lines.append(f"- Ended at: {request.ended_at.isoformat()}")
    if request.file_path:
        lines.append(f"- Local media path: {request.file_path}")
    lines.append("")

    if request.summary:
        lines.extend(["## Summary", "", request.summary.strip(), ""])
    if request.transcript:
        lines.extend(["## Transcript", "", request.transcript.strip(), ""])
    return "\n".join(lines).strip()


@router.post("/api/media_context/capture")
async def capture_media_context(
    request: CaptureMediaContextRequest,
    opencontext: OpenContext = Depends(get_context_lab),
    _auth: str = auth_dependency,
):
    """Capture audio/video transcript content for semantic indexing."""
    try:
        if not request.summary and not request.transcript:
            return convert_resp(
                code=400,
                status=400,
                message="Media context must include a summary or transcript",
            )

        media_path = Path(request.file_path).expanduser().resolve() if request.file_path else None
        if media_path and not media_path.exists():
            return convert_resp(code=400, status=400, message="Media file does not exist")

        raw_context = RawContextProperties(
            source=ContextSource.INPUT,
            content_format=ContentFormat.TEXT,
            content_text=_build_media_context_text(request),
            content_path=str(media_path) if media_path else "",
            create_time=request.started_at or datetime.datetime.now(),
            additional_info={
                "media_type": request.media_type,
                "title": request.title,
                "file_path": str(media_path) if media_path else None,
                "started_at": request.started_at.isoformat() if request.started_at else None,
                "ended_at": request.ended_at.isoformat() if request.ended_at else None,
            },
            enable_merge=False,
        )

        if not opencontext.add_context(raw_context):
            return convert_resp(code=500, status=500, message="Failed to queue media context")

        return convert_resp(message="Media context queued for processing successfully")
    except Exception as e:
        logger.exception(f"Error capturing media context: {e}")
        return convert_resp(code=500, status=500, message=f"Failed to capture media context: {str(e)}")


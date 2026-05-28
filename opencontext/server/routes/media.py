# -*- coding: utf-8 -*-

# Copyright (c) 2025 Beijing Volcano Engine Technology Co., Ltd.
# SPDX-License-Identifier: Apache-2.0

"""Media context capture routes for audio/video transcripts."""

import datetime
import os
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, UploadFile
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


def _default_media_summary(request: CaptureMediaContextRequest) -> str:
    if not request.file_path:
        return ""
    title = request.title or f"{request.media_type.title()} recording"
    return (
        f"{title} was captured as a local {request.media_type} recording. "
        "Open the linked media file for the original recording."
    )


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

    summary = request.summary or _default_media_summary(request)
    if summary:
        lines.extend(["## Summary", "", summary.strip(), ""])
    if request.transcript:
        lines.extend(["## Transcript", "", request.transcript.strip(), ""])
    return "\n".join(lines).strip()


def _safe_media_filename(filename: str, media_type: str) -> str:
    suffix = Path(filename or "").suffix.lower()
    if not suffix:
        suffix = ".webm" if media_type == "video" else ".webm"
    stem = Path(filename or f"{media_type}-recording").stem
    safe_stem = "".join(ch if ch.isalnum() or ch in {"-", "_"} else "-" for ch in stem)
    safe_stem = safe_stem.strip("-_") or f"{media_type}-recording"
    timestamp = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
    return f"{timestamp}-{safe_stem}{suffix}"


async def _save_uploaded_media(file: UploadFile, media_type: str) -> Path:
    context_root = Path(os.getenv("CONTEXT_PATH", ".")).expanduser().resolve()
    media_dir = context_root / "media" / media_type / datetime.datetime.now().strftime("%Y%m%d")
    media_dir.mkdir(parents=True, exist_ok=True)
    output_path = media_dir / _safe_media_filename(file.filename or "", media_type)

    with output_path.open("wb") as output_file:
        while True:
            chunk = await file.read(1024 * 1024)
            if not chunk:
                break
            output_file.write(chunk)
    return output_path


def _validate_media_type(media_type: str) -> Optional[str]:
    normalized = (media_type or "").strip().lower()
    return normalized if normalized in {"audio", "video"} else None


@router.post("/api/media_context/capture")
async def capture_media_context(
    request: CaptureMediaContextRequest,
    opencontext: OpenContext = Depends(get_context_lab),
    _auth: str = auth_dependency,
):
    """Capture audio/video transcript content for semantic indexing."""
    try:
        if not request.summary and not request.transcript and not request.file_path:
            return convert_resp(
                code=400,
                status=400,
                message="Media context must include a summary, transcript, or media file path",
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


@router.post("/api/media_context/upload")
async def upload_media_context(
    media_type: str = Form(...),
    title: Optional[str] = Form(None),
    summary: Optional[str] = Form(None),
    transcript: Optional[str] = Form(None),
    started_at: Optional[datetime.datetime] = Form(None),
    ended_at: Optional[datetime.datetime] = Form(None),
    file: UploadFile = File(...),
    opencontext: OpenContext = Depends(get_context_lab),
    _auth: str = auth_dependency,
):
    """Upload a local audio/video recording and queue it as media context."""
    try:
        normalized_media_type = _validate_media_type(media_type)
        if not normalized_media_type:
            return convert_resp(code=400, status=400, message="media_type must be audio or video")

        output_path = await _save_uploaded_media(file, normalized_media_type)
        request = CaptureMediaContextRequest(
            media_type=normalized_media_type,
            transcript=transcript,
            summary=summary,
            title=title or f"{normalized_media_type.title()} recording",
            file_path=str(output_path),
            started_at=started_at,
            ended_at=ended_at,
        )

        raw_context = RawContextProperties(
            source=ContextSource.INPUT,
            content_format=ContentFormat.TEXT,
            content_text=_build_media_context_text(request),
            content_path=str(output_path),
            create_time=request.started_at or datetime.datetime.now(),
            additional_info={
                "media_type": request.media_type,
                "title": request.title,
                "file_path": str(output_path),
                "started_at": request.started_at.isoformat() if request.started_at else None,
                "ended_at": request.ended_at.isoformat() if request.ended_at else None,
            },
            enable_merge=False,
        )

        if not opencontext.add_context(raw_context):
            return convert_resp(code=500, status=500, message="Failed to queue media context")

        return convert_resp(
            data={"file_path": str(output_path)},
            message="Media recording uploaded and queued successfully",
        )
    except Exception as e:
        logger.exception(f"Error uploading media context: {e}")
        return convert_resp(code=500, status=500, message=f"Failed to upload media context: {str(e)}")

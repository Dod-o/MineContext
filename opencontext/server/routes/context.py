# -*- coding: utf-8 -*-

# Copyright (c) 2025 Beijing Volcano Engine Technology Co., Ltd.
# SPDX-License-Identifier: Apache-2.0

"""
Context management routes
"""

import json
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel

from opencontext.models.context import ProcessedContextModel, RawContextProperties
from opencontext.models.enums import ContentFormat, ContextSource
from opencontext.server.middleware.auth import auth_dependency
from opencontext.server.opencontext import OpenContext
from opencontext.server.utils import convert_resp, get_context_lab
from opencontext.utils.json_encoder import CustomJSONEncoder
from opencontext.utils.logging_utils import get_logger

logger = get_logger(__name__)
router = APIRouter(tags=["context"])

project_root = Path(__file__).parent.parent.parent.parent.resolve()
templates_path = Path(__file__).parent.parent.parent / "web" / "templates"
templates = Jinja2Templates(directory=templates_path)


class ContextIn(BaseModel):
    source: ContextSource
    content_format: ContentFormat
    data: Any
    metadata: Optional[dict] = {}


class UpdateContextIn(BaseModel):
    title: Optional[str] = None
    summary: Optional[str] = None
    keywords: Optional[List[str]] = None


class ManualContextIn(BaseModel):
    title: Optional[str] = None
    content: str
    occurred_at: Optional[datetime] = None


class QueryIn(BaseModel):
    query: str


class ConsumeIn(BaseModel):
    query: str
    context_ids: List[str]


class ContextDetailRequest(BaseModel):
    id: str
    context_type: str


class VectorSearchRequest(BaseModel):
    query: str
    top_k: int = 10
    context_types: Optional[List[str]] = None
    filters: Optional[Dict[str, Any]] = None


def _build_manual_context(request: ManualContextIn) -> RawContextProperties:
    content = request.content.strip()
    if not content:
        raise ValueError("Manual context content cannot be empty")

    title = request.title.strip() if request.title else ""
    object_id = f"manual_{uuid.uuid4()}"
    content_text = f"{title}\n\n{content}" if title else content

    return RawContextProperties(
        source=ContextSource.INPUT,
        content_format=ContentFormat.TEXT,
        create_time=request.occurred_at or datetime.now(),
        object_id=object_id,
        content_type="manual_context",
        content_text=content_text,
        filter_path=f"/manual/{object_id}",
        additional_info={
            "raw_type": "manual_context",
            "raw_id": object_id,
            "title": title,
            "capture_mode": "manual",
            "content_length": len(content),
        },
        enable_merge=False,
    )


@router.post("/contexts/delete")
def delete_context(
    detail_request: ContextDetailRequest,
    opencontext: OpenContext = Depends(get_context_lab),
    _auth: str = auth_dependency,
):
    """Delete a processed context by its ID and context_type."""
    success = opencontext.delete_context(detail_request.id, detail_request.context_type)
    if not success:
        raise HTTPException(status_code=404, detail="Context not found or failed to delete")
    return {"message": "Context deleted successfully"}


@router.post("/contexts/detail", response_class=HTMLResponse)
async def read_context_detail(
    detail_request: ContextDetailRequest,
    request: Request,
    opencontext: OpenContext = Depends(get_context_lab),
    _auth: str = auth_dependency,
):
    context = opencontext.get_context(detail_request.id, detail_request.context_type)
    if context is None:
        return templates.TemplateResponse(
            "error.html", {"request": request, "message": "Context not found"}, status_code=404
        )

    return templates.TemplateResponse(
        "context_detail.html",
        {
            "request": request,
            "context": ProcessedContextModel.from_processed_context(context, project_root),
        },
    )


@router.post("/api/contexts/manual")
async def add_manual_context(
    request: ManualContextIn,
    opencontext: OpenContext = Depends(get_context_lab),
    _auth: str = auth_dependency,
):
    """Queue manually entered text context for processing."""
    try:
        raw_context = _build_manual_context(request)
    except ValueError as e:
        return convert_resp(code=400, status=400, message=str(e))

    try:
        if not opencontext.add_context(raw_context):
            return convert_resp(
                code=500, status=500, message="Failed to queue manual context"
            )

        return convert_resp(
            data={"object_id": raw_context.object_id},
            message="Manual context queued for processing",
        )
    except Exception as e:
        logger.exception(f"Error adding manual context: {e}")
        return convert_resp(code=500, status=500, message=f"Manual context failed: {str(e)}")


@router.get("/api/context_types")
async def get_context_types(
    opencontext: OpenContext = Depends(get_context_lab), _auth: str = auth_dependency
):
    """Get all available context types."""
    try:
        context_types = opencontext.get_context_types()
        return context_types
    except Exception as e:
        logger.exception(f"Error getting context types: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get context types: {str(e)}")


@router.post("/api/vector_search")
async def vector_search(
    request: VectorSearchRequest,
    opencontext: OpenContext = Depends(get_context_lab),
    _auth: str = auth_dependency,
):
    """Directly search vector database without using LLM."""
    try:
        results = opencontext.search(
            query=request.query,
            top_k=request.top_k,
            context_types=request.context_types,
            filters=request.filters,
        )

        return convert_resp(
            data={
                "results": results,
                "total": len(results),
                "query": request.query,
                "top_k": request.top_k,
                "context_types": request.context_types,
                "filters": request.filters,
            }
        )

    except Exception as e:
        logger.exception(f"Error in vector search: {e}")
        return convert_resp(code=500, status=500, message=f"Vector search failed: {str(e)}")

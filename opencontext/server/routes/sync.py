# -*- coding: utf-8 -*-

# Copyright (c) 2025 Beijing Volcano Engine Technology Co., Ltd.
# SPDX-License-Identifier: Apache-2.0

"""Multi-device sync routes for portable todos and summary reports."""

import datetime
import socket
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from opencontext.models.enums import VaultType
from opencontext.server.middleware.auth import auth_dependency
from opencontext.server.utils import convert_resp
from opencontext.storage.global_storage import get_storage
from opencontext.utils.logging_utils import get_logger

logger = get_logger(__name__)
router = APIRouter(tags=["sync"])


class SyncTodo(BaseModel):
    content: str
    start_time: Optional[Any] = None
    end_time: Optional[Any] = None
    status: int = 0
    urgency: int = 0
    assignee: Optional[str] = None
    reason: Optional[str] = None


class SyncVault(BaseModel):
    title: str
    summary: str = ""
    content: str = ""
    tags: Optional[str] = None
    document_type: str
    updated_at: Optional[Any] = None


class SyncActivity(BaseModel):
    title: str
    content: str = ""
    resources: Optional[str] = None
    metadata: Optional[str] = None
    start_time: Optional[Any] = None
    end_time: Optional[Any] = None


class SyncBundle(BaseModel):
    schema_version: int = Field(default=1, ge=1)
    device_id: Optional[str] = None
    exported_at: Optional[Any] = None
    todos: List[SyncTodo] = Field(default_factory=list)
    vaults: List[SyncVault] = Field(default_factory=list)
    activities: List[SyncActivity] = Field(default_factory=list)


def _parse_datetime(value: Any) -> Optional[datetime.datetime]:
    if isinstance(value, datetime.datetime):
        return value
    if isinstance(value, str) and value.strip():
        text = value.strip()
        if text.endswith("Z"):
            text = text[:-1] + "+00:00"
        try:
            return datetime.datetime.fromisoformat(text)
        except ValueError:
            return None
    return None


def _datetime_key(value: Any) -> str:
    parsed = _parse_datetime(value)
    return parsed.isoformat() if parsed else str(value or "")


def _todo_key(todo: Dict[str, Any]) -> tuple[str, str, str]:
    return (
        str(todo.get("content") or "").strip(),
        _datetime_key(todo.get("start_time")),
        _datetime_key(todo.get("end_time")),
    )


def _vault_key(vault: Dict[str, Any]) -> tuple[str, str]:
    return (
        str(vault.get("document_type") or "").strip(),
        str(vault.get("title") or "").strip(),
    )


def _activity_key(activity: Dict[str, Any]) -> tuple[str, str, str, str]:
    return (
        str(activity.get("title") or "").strip(),
        str(activity.get("content") or "").strip(),
        _datetime_key(activity.get("start_time")),
        _datetime_key(activity.get("end_time")),
    )


def _export_todos(limit: int = 5000) -> List[Dict[str, Any]]:
    return get_storage().get_todos(limit=limit, offset=0)


def _export_summary_vaults(limit: int = 5000) -> List[Dict[str, Any]]:
    storage = get_storage()
    vaults = []
    for document_type in (VaultType.DAILY_REPORT.value, VaultType.WEEKLY_REPORT.value):
        vaults.extend(
            storage.get_vaults(
                document_type=document_type,
                is_deleted=False,
                limit=limit,
                offset=0,
            )
        )
    return vaults


def _export_activities(limit: int = 5000) -> List[Dict[str, Any]]:
    return get_storage().get_activities(limit=limit, offset=0)


@router.get("/api/sync/export")
async def export_sync_bundle(_auth: str = auth_dependency):
    """Export todos, summary reports, and activity records for another MineContext device."""
    try:
        bundle = {
            "schema_version": 1,
            "device_id": socket.gethostname(),
            "exported_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "todos": _export_todos(),
            "vaults": _export_summary_vaults(),
            "activities": _export_activities(),
        }
        return convert_resp(data=bundle)
    except Exception as e:
        logger.exception(f"Failed to export sync bundle: {e}")
        return convert_resp(code=500, status=500, message=f"Failed to export sync bundle: {str(e)}")


@router.post("/api/sync/import")
async def import_sync_bundle(bundle: SyncBundle, _auth: str = auth_dependency):
    """Import a sync bundle from another MineContext device and merge records."""
    try:
        storage = get_storage()
        existing_todo_keys = {_todo_key(todo) for todo in storage.get_todos(limit=10000, offset=0)}
        existing_vaults = {
            _vault_key(vault): vault
            for vault in (
                storage.get_vaults(
                    document_type=VaultType.DAILY_REPORT.value,
                    is_deleted=False,
                    limit=10000,
                    offset=0,
                )
                + storage.get_vaults(
                    document_type=VaultType.WEEKLY_REPORT.value,
                    is_deleted=False,
                    limit=10000,
                    offset=0,
                )
            )
        }
        existing_activity_keys = {
            _activity_key(activity) for activity in storage.get_activities(limit=10000, offset=0)
        }

        imported_todos = 0
        skipped_todos = 0
        for todo in bundle.todos:
            todo_dict = todo.model_dump()
            key = _todo_key(todo_dict)
            if key in existing_todo_keys:
                skipped_todos += 1
                continue
            storage.insert_todo(
                content=todo.content,
                start_time=_parse_datetime(todo.start_time),
                end_time=_parse_datetime(todo.end_time),
                status=todo.status,
                urgency=todo.urgency,
                assignee=todo.assignee,
                reason=todo.reason,
            )
            existing_todo_keys.add(key)
            imported_todos += 1

        imported_vaults = 0
        updated_vaults = 0
        skipped_vaults = 0
        allowed_types = {VaultType.DAILY_REPORT.value, VaultType.WEEKLY_REPORT.value}
        for vault in bundle.vaults:
            if vault.document_type not in allowed_types:
                skipped_vaults += 1
                continue
            vault_dict = vault.model_dump()
            key = _vault_key(vault_dict)
            existing = existing_vaults.get(key)
            if existing:
                if (
                    existing.get("content") == vault.content
                    and existing.get("summary") == vault.summary
                    and existing.get("tags") == vault.tags
                ):
                    skipped_vaults += 1
                    continue
                storage.update_vault(
                    existing["id"],
                    summary=vault.summary,
                    content=vault.content,
                    tags=vault.tags,
                )
                updated_vaults += 1
                continue

            vault_id = storage.insert_vaults(
                title=vault.title,
                summary=vault.summary,
                content=vault.content,
                document_type=vault.document_type,
                tags=vault.tags,
            )
            existing_vaults[key] = {"id": vault_id, **vault_dict}
            imported_vaults += 1

        imported_activities = 0
        skipped_activities = 0
        for activity in bundle.activities:
            activity_dict = activity.model_dump()
            key = _activity_key(activity_dict)
            if key in existing_activity_keys:
                skipped_activities += 1
                continue
            storage.insert_activity(
                title=activity.title,
                content=activity.content,
                resources=activity.resources,
                metadata=activity.metadata,
                start_time=_parse_datetime(activity.start_time),
                end_time=_parse_datetime(activity.end_time),
            )
            existing_activity_keys.add(key)
            imported_activities += 1

        return convert_resp(
            data={
                "imported_todos": imported_todos,
                "skipped_todos": skipped_todos,
                "imported_vaults": imported_vaults,
                "updated_vaults": updated_vaults,
                "skipped_vaults": skipped_vaults,
                "imported_activities": imported_activities,
                "skipped_activities": skipped_activities,
            },
            message="Sync bundle imported",
        )
    except Exception as e:
        logger.exception(f"Failed to import sync bundle: {e}")
        return convert_resp(code=500, status=500, message=f"Failed to import sync bundle: {str(e)}")

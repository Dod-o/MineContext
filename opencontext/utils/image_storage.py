# -*- coding: utf-8 -*-

# Copyright (c) 2025 Beijing Volcano Engine Technology Co., Ltd.
# SPDX-License-Identifier: Apache-2.0

"""Local image storage accounting and cleanup helpers."""

import os
import time
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional


IMAGE_SUFFIXES = {".bmp", ".gif", ".jpeg", ".jpg", ".png", ".webp"}


def resolve_context_path(path_value: str | Path, context_path: str | Path | None = None) -> Path:
    """Resolve config paths that may still contain CONTEXT_PATH placeholders."""
    context_root = str(context_path or os.getenv("CONTEXT_PATH", "."))
    raw_path = str(path_value)
    raw_path = raw_path.replace("${CONTEXT_PATH:.}", context_root)
    raw_path = raw_path.replace("${CONTEXT_PATH}", context_root)
    return Path(raw_path).expanduser().resolve()


def _append_root(roots: List[Path], root: str | Path | None, context_path: str | Path | None) -> None:
    if not root:
        return
    try:
        resolved_root = resolve_context_path(root, context_path)
    except OSError:
        return
    if resolved_root not in roots:
        roots.append(resolved_root)


def get_image_storage_roots(config: Optional[Dict[str, Any]] = None) -> List[Path]:
    """Return configured directories that can hold local screenshots/images."""
    config = config or {}
    context_path = os.getenv("CONTEXT_PATH", ".")
    roots: List[Path] = []

    screenshot_config = config.get("capture", {}).get("screenshot", {})
    _append_root(roots, screenshot_config.get("storage_path"), context_path)

    context_root = resolve_context_path(context_path, context_path)
    for relative_path in (
        "screenshots",
        Path("Data") / "screenshot" / "activity",
        Path("screenshot") / "activity",
    ):
        _append_root(roots, context_root / relative_path, context_path)

    return roots


def _is_under_root(path: Path, root: Path) -> bool:
    try:
        path.relative_to(root)
        return True
    except ValueError:
        return False


def _iter_image_files(roots: Iterable[Path]):
    seen: set[Path] = set()
    for root in roots:
        try:
            resolved_root = root.expanduser().resolve()
        except OSError:
            continue
        if not resolved_root.exists() or not resolved_root.is_dir():
            continue

        for path in resolved_root.rglob("*"):
            try:
                if path.is_symlink() or not path.is_file():
                    continue
                resolved_path = path.resolve()
                if resolved_path in seen:
                    continue
                if not _is_under_root(resolved_path, resolved_root):
                    continue
                if resolved_path.suffix.lower() not in IMAGE_SUFFIXES:
                    continue
                stats = resolved_path.stat()
            except OSError:
                continue
            seen.add(resolved_path)
            yield {
                "path": resolved_path,
                "root": resolved_root,
                "size": stats.st_size,
                "mtime": stats.st_mtime,
            }


def get_image_storage_status(roots: Iterable[Path]) -> Dict[str, Any]:
    """Return image file counts and sizes for the supplied roots."""
    items = list(_iter_image_files(roots))
    root_stats: Dict[str, Dict[str, Any]] = {}
    for root in roots:
        try:
            resolved_root = root.expanduser().resolve()
        except OSError:
            resolved_root = root
        root_stats[str(resolved_root)] = {
            "path": str(resolved_root),
            "exists": resolved_root.exists(),
            "count": 0,
            "size_bytes": 0,
        }

    for item in items:
        root_key = str(item["root"])
        root_stat = root_stats.setdefault(
            root_key,
            {"path": root_key, "exists": True, "count": 0, "size_bytes": 0},
        )
        root_stat["count"] += 1
        root_stat["size_bytes"] += item["size"]

    total_size = sum(item["size"] for item in items)
    mtimes = [item["mtime"] for item in items]
    return {
        "count": len(items),
        "size_bytes": total_size,
        "size_mb": round(total_size / 1024 / 1024, 2),
        "oldest_mtime": min(mtimes) if mtimes else None,
        "newest_mtime": max(mtimes) if mtimes else None,
        "roots": list(root_stats.values()),
    }


def _cleanup_empty_dirs(path: Path, roots: Iterable[Path]) -> None:
    root_list = [root.expanduser().resolve() for root in roots]
    current = path.parent
    while True:
        if any(current == root for root in root_list):
            return
        if not any(_is_under_root(current, root) for root in root_list):
            return
        try:
            current.rmdir()
        except OSError:
            return
        current = current.parent


def cleanup_image_storage(
    roots: Iterable[Path],
    *,
    retention_days: Optional[int] = None,
    max_total_size_mb: Optional[float] = None,
    max_file_count: Optional[int] = None,
    dry_run: bool = False,
) -> Dict[str, Any]:
    """Delete local image files by age, total size, and count limits."""
    root_list = [root.expanduser().resolve() for root in roots]
    items = list(_iter_image_files(root_list))
    targets: Dict[Path, Dict[str, Any]] = {}

    if retention_days is not None and retention_days >= 0:
        cutoff = time.time() - retention_days * 24 * 60 * 60
        for item in items:
            if item["mtime"] < cutoff:
                targets[item["path"]] = item

    if max_file_count is not None and max_file_count >= 0:
        newest_first = sorted(items, key=lambda item: item["mtime"], reverse=True)
        for item in newest_first[max_file_count:]:
            targets[item["path"]] = item

    if max_total_size_mb is not None and max_total_size_mb >= 0:
        max_total_size = int(max_total_size_mb * 1024 * 1024)
        remaining_size = sum(item["size"] for item in items if item["path"] not in targets)
        oldest_first = sorted(
            (item for item in items if item["path"] not in targets),
            key=lambda item: item["mtime"],
        )
        for item in oldest_first:
            if remaining_size <= max_total_size:
                break
            targets[item["path"]] = item
            remaining_size -= item["size"]

    deleted_count = 0
    deleted_size = 0
    errors = []
    for path, item in targets.items():
        if dry_run:
            deleted_count += 1
            deleted_size += item["size"]
            continue
        try:
            path.unlink()
            _cleanup_empty_dirs(path, root_list)
            deleted_count += 1
            deleted_size += item["size"]
        except OSError as exc:
            errors.append({"path": str(path), "error": str(exc)})

    return {
        "dry_run": dry_run,
        "scanned_count": len(items),
        "deleted_count": deleted_count,
        "deleted_size_bytes": deleted_size,
        "deleted_size_mb": round(deleted_size / 1024 / 1024, 2),
        "errors": errors,
    }

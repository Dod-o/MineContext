# -*- coding: utf-8 -*-

# Copyright (c) 2025 Beijing Volcano Engine Technology Co., Ltd.
# SPDX-License-Identifier: Apache-2.0

"""Helpers for exposing raw context media through opaque debug-page URLs."""

import base64
import binascii
import os
from pathlib import Path
from typing import Iterable


CONTEXT_MEDIA_SUFFIXES = {
    ".bmp",
    ".gif",
    ".jpeg",
    ".jpg",
    ".m4a",
    ".m4v",
    ".mov",
    ".mp3",
    ".mp4",
    ".ogg",
    ".png",
    ".wav",
    ".webm",
    ".webp",
}


def encode_context_media_path(file_path: str | Path) -> str:
    """Encode a local media path into a URL-safe token."""
    resolved_path = Path(file_path).expanduser().resolve()
    encoded = base64.urlsafe_b64encode(str(resolved_path).encode("utf-8")).decode("ascii")
    return encoded.rstrip("=")


def decode_context_media_path(path_token: str) -> Path:
    """Decode a URL-safe media token into an absolute path."""
    if not path_token:
        raise ValueError("Empty context media token")

    try:
        padding = "=" * (-len(path_token) % 4)
        decoded = base64.urlsafe_b64decode((path_token + padding).encode("ascii"))
        raw_path = decoded.decode("utf-8")
    except (binascii.Error, UnicodeDecodeError) as exc:
        raise ValueError("Invalid context media token") from exc

    return Path(raw_path).expanduser().resolve()


def build_context_media_url(file_path: str | Path) -> str:
    """Build the debug web URL for a raw context media file."""
    return f"/context-files/{encode_context_media_path(file_path)}"


def is_path_relative_to(path: Path, root: Path) -> bool:
    try:
        path.relative_to(root)
        return True
    except ValueError:
        return False


def get_context_media_roots(project_root: Path) -> list[Path]:
    """Return directories that may contain raw context media files."""
    roots = [
        project_root / "screenshots",
        Path.cwd() / "screenshots",
    ]

    context_path = os.getenv("CONTEXT_PATH")
    if context_path:
        roots.append(Path(context_path))

    screenshot_dir = os.getenv("OPENCONTEXT_SCREENSHOT_DIR")
    if screenshot_dir:
        roots.append(Path(screenshot_dir))

    resolved_roots = []
    for root in roots:
        try:
            resolved_roots.append(root.expanduser().resolve())
        except OSError:
            continue
    return resolved_roots


def validate_context_media_path(file_path: str | Path, allowed_roots: Iterable[Path]) -> Path:
    """Validate and resolve a raw context media path before serving it."""
    try:
        resolved_path = Path(file_path).expanduser().resolve(strict=True)
    except (OSError, RuntimeError) as exc:
        raise FileNotFoundError("File not found") from exc

    if not resolved_path.is_file():
        raise FileNotFoundError("File not found")

    if resolved_path.suffix.lower() not in CONTEXT_MEDIA_SUFFIXES:
        raise PermissionError("Only raw context media files can be served")

    if not any(is_path_relative_to(resolved_path, root) for root in allowed_roots):
        raise PermissionError("Access forbidden: file is outside context data")

    return resolved_path

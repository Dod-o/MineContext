# -*- coding: utf-8 -*-

# Copyright (c) 2025 Beijing Volcano Engine Technology Co., Ltd.
# SPDX-License-Identifier: Apache-2.0

"""Helpers for locating and listing prompt generation history files."""

import json
import os
from pathlib import Path
from typing import Any, Dict, List, Optional


PROMPT_HISTORY_CATEGORY_DIRS = {
    "smart_tip_generation": "tips",
    "todo_extraction": "todo",
    "generation_report": "report",
    "realtime_activity_monitor": "activity",
}


def resolve_context_path_template(path_value: str) -> str:
    if "${CONTEXT_PATH" not in path_value:
        return path_value

    context_path = os.getenv("CONTEXT_PATH", ".")
    return path_value.replace("${CONTEXT_PATH:.}", context_path).replace(
        "${CONTEXT_PATH}", context_path
    )


def get_prompt_history_dir(config: Dict[str, Any], category: str) -> Optional[Path]:
    dir_name = PROMPT_HISTORY_CATEGORY_DIRS.get(category)
    if not dir_name:
        return None

    debug_config = config.get("content_generation", {}).get("debug", {})
    base_path = debug_config.get("output_path", "${CONTEXT_PATH:.}/debug/generation")
    return Path(resolve_context_path_template(base_path)).expanduser().resolve() / dir_name


def is_safe_history_filename(filename: str) -> bool:
    return bool(filename) and ".." not in filename and "/" not in filename and "\\" not in filename


def list_prompt_history_files(config: Dict[str, Any], category: str) -> Optional[List[Dict[str, Any]]]:
    history_dir = get_prompt_history_dir(config, category)
    if history_dir is None:
        return None

    if not history_dir.exists():
        return []

    history_files = []
    for filepath in sorted(history_dir.glob("*.json"), reverse=True):
        try:
            with open(filepath, "r", encoding="utf-8") as f:
                data = json.load(f)

            history_files.append(
                {
                    "filename": filepath.name,
                    "timestamp": data.get("timestamp", ""),
                    "has_result": bool(data.get("response")),
                }
            )
        except Exception:
            continue

    return history_files

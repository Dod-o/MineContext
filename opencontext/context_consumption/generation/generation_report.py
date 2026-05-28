# -*- coding: utf-8 -*-

# Copyright (c) 2025 Beijing Volcano Engine Technology Co., Ltd.
# SPDX-License-Identifier: Apache-2.0

"""
OpenContext module: generation_report
"""

import datetime
import json
import re
from typing import Any, Dict, List, Optional

from opencontext.config.global_config import get_prompt_group
from opencontext.context_consumption.generation.debug_helper import DebugHelper
from opencontext.llm.global_vlm_client import (
    generate_with_messages_async,
    get_feature_model_profile,
)
from opencontext.models.enums import ContextType
from opencontext.storage.global_storage import get_storage
from opencontext.tools.tool_definitions import ALL_TOOL_DEFINITIONS
from opencontext.tools.tools_executor import ToolsExecutor
from opencontext.utils.logging_utils import get_logger

logger = get_logger(__name__)
TODO_STATUS_REVIEW = 2
NO_ACTIVITY_REPORT = "No activity data available for the specified time range."
MAX_TIMELINE_ACTIVITIES = 100


class ReportGenerator:
    """
    Context consumer - directly retrieves context from the database, calls the large model to generate results, and supports tool calls to obtain background information.
    """

    def __init__(self):
        self.tools_executor = ToolsExecutor()

    async def generate_report(self, start_time: int, end_time: int) -> str:
        """
        Generate an activity report for a specified time range.

        Args:
            start_time: The start time as a Unix timestamp in seconds.
            end_time: The end time as a Unix timestamp in seconds.

        Returns:
            str: The activity report in Markdown format.
        """
        try:
            result = await self._generate_report_with_llm(start_time, end_time)
            if not result or result == NO_ACTIVITY_REPORT:
                return result

            from opencontext.managers.event_manager import EventType, publish_event
            from opencontext.models.enums import VaultType
            from opencontext.storage.global_storage import get_storage

            report_title = self._build_daily_report_title(start_time)
            report_id = get_storage().insert_vaults(
                title=report_title,
                summary="",
                content=result,
                document_type=VaultType.DAILY_REPORT.value,
            )
            publish_event(
                event_type=EventType.DAILY_SUMMARY_GENERATED,
                data={
                    "doc_id": str(report_id),
                    "doc_type": "vaults",
                    "title": report_title,
                    "content": result,
                },
            )
            return result
        except Exception as e:
            logger.exception(f"Error generating activity report: {e}")
            return f"Error generating activity report: {str(e)}"

    def _build_daily_report_title(self, start_time: int) -> str:
        report_date = datetime.datetime.fromtimestamp(start_time).date()
        return f"Daily Report - {report_date.strftime('%Y-%m-%d')}"

    async def _process_chunks_concurrently(self, start_time: int, end_time: int) -> list:
        """Process all time chunks concurrently."""
        import asyncio

        hour_chunks = []
        current_time = start_time

        while current_time < end_time:
            chunk_end = min(current_time + 3600, end_time)  # 1-hour chunks
            hour_chunks.append((current_time, chunk_end))
            current_time = chunk_end

        tasks = []
        for chunk_start, chunk_end in hour_chunks:
            task = self._process_single_chunk_async(chunk_start, chunk_end)
            tasks.append(task)
        semaphore = asyncio.Semaphore(5)

        async def limited_task(task):
            async with semaphore:
                return await task

        limited_tasks = [limited_task(task) for task in tasks]
        results = await asyncio.gather(*limited_tasks, return_exceptions=True)
        hourly_summaries = []
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                chunk_start, chunk_end = hour_chunks[i]
                logger.error(
                    f"Failed to process time chunk {self._format_timestamp(chunk_start)} - {self._format_timestamp(chunk_end)}: {result}"
                )
            elif result:
                hourly_summaries.append(result)
        return hourly_summaries

    async def _process_single_chunk_async(self, chunk_start: int, chunk_end: int) -> dict:
        """Process a single time chunk asynchronously."""

        filters = {}
        if chunk_start or chunk_end:
            filters["create_time_ts"] = {}
            if chunk_start:
                filters["create_time_ts"]["$gte"] = chunk_start
            if chunk_end:
                filters["create_time_ts"]["$lte"] = chunk_end

        context_types = [ContextType.ACTIVITY_CONTEXT.value, ContextType.SEMANTIC_CONTEXT.value, ContextType.ENTITY_CONTEXT.value, ContextType.INTENT_CONTEXT.value,
                         ContextType.PROCEDURAL_CONTEXT.value, ContextType.ACTIVITY_CONTEXT.value]
        all_contexts = get_storage().get_all_processed_contexts(
            context_types=context_types, limit=1000, offset=0, filter=filters
        )
        contexts = []
        for context_list in all_contexts.values():
            contexts.extend(context_list)
        contexts.sort(key=lambda x: x.properties.create_time)
        contexts_data = [context.get_llm_context_string() for context in contexts]

        # Convert timestamps to datetime objects for storage queries
        start_datetime = datetime.datetime.fromtimestamp(chunk_start) if chunk_start else None
        end_datetime = datetime.datetime.fromtimestamp(chunk_end) if chunk_end else None

        tips = get_storage().get_tips(start_time=start_datetime, end_time=end_datetime, limit=100)
        tips_list = []
        for tip in tips:
            tips_list.append({
                "id": tip.get("id"),
                "content": tip.get("content"),
                "created_at": tip.get("created_at"),
            })

        # Get todos within the time range
        todos = get_storage().get_todos(start_time=start_datetime, end_time=end_datetime, limit=100)
        todos_list = []
        for todo in todos:
            if todo.get("status") == TODO_STATUS_REVIEW:
                continue
            todos_list.append({
                "id": todo.get("id"),
                "content": todo.get("content"),
                "status": todo.get("status"),
                "status_label": "completed" if todo.get("status") == 1 else "pending",
                "urgency": todo.get("urgency"),
                "assignee": todo.get("assignee"),
                "reason": todo.get("reason"),
                "created_at": todo.get("created_at"),
                "start_time": todo.get("start_time"),
                "end_time": todo.get("end_time"),
            })

        # Get activities within the time range
        activities = get_storage().get_activities(start_time=start_datetime, end_time=end_datetime, limit=100)
        activities_list = []
        for activity in activities:
            activities_list.append({
                "id": activity.get("id"),
                "title": activity.get("title"),
                "content": activity.get("content"),
                "metadata": activity.get("metadata"),  # 包含 category_distribution, extracted_insights 等
                "start_time": activity.get("start_time"),
                "end_time": activity.get("end_time"),
            })


        prompt_group = get_prompt_group("generation.generation_report")

        start_time_str = self._format_timestamp(chunk_start)
        end_time_str = self._format_timestamp(chunk_end)

        if not contexts_data and not tips_list and not todos_list and not activities_list:
            return None
        messages = [
            {"role": "system", "content": prompt_group["system"]},
            {
                "role": "user",
                "content": prompt_group["user"].format(
                    start_time_str=start_time_str,
                    end_time_str=end_time_str,
                    start_timestamp=chunk_start,
                    end_timestamp=chunk_end,
                    contexts=json.dumps(contexts_data, ensure_ascii=False, indent=2),
                    tips=json.dumps(tips_list, ensure_ascii=False, indent=2),
                    todos=json.dumps(todos_list, ensure_ascii=False, indent=2),
                    activities=json.dumps(activities_list, ensure_ascii=False, indent=2),
                ),
            },
        ]
        summary = await generate_with_messages_async(
            messages,
            model_profile=get_feature_model_profile("content_generation.report"),
        )

        if summary:
            return {"start_time": chunk_start, "end_time": chunk_end, "summary": summary}
        return None

    async def _generate_report_with_llm(self, start_time: int, end_time: int) -> str:
        """
        Generate a comprehensive activity report by merging hourly summaries.
        """
        # Get hourly summaries
        hourly_summaries = await self._process_chunks_concurrently(start_time, end_time)

        if not hourly_summaries:
            return NO_ACTIVITY_REPORT

        # Format hourly summaries for the prompt
        summaries_text = []
        for item in hourly_summaries:
            start_str = self._format_timestamp(item["start_time"])
            end_str = self._format_timestamp(item["end_time"])
            summaries_text.append(f"**{start_str} - {end_str}**\n\n{item['summary']}")

        summaries_formatted = "\n\n---\n\n".join(summaries_text)

        # Get prompt template
        prompt_group = get_prompt_group("generation.merge_hourly_reports")

        start_time_str = self._format_timestamp(start_time)
        end_time_str = self._format_timestamp(end_time)

        # Build messages
        messages = [
            {"role": "system", "content": prompt_group["system"]},
            {
                "role": "user",
                "content": prompt_group["user"].format(
                    start_time_str=start_time_str,
                    end_time_str=end_time_str,
                    hourly_summaries=summaries_formatted,
                ),
            },
        ]

        # Generate report with LLM
        report = await generate_with_messages_async(
            messages,
            model_profile=get_feature_model_profile("content_generation.report"),
        )

        if not report:
            logger.error("Failed to generate report.")
            return None

        timeline_section = self._build_activity_timeline_section(start_time, end_time)
        if timeline_section:
            report = self._insert_activity_timeline_section(report, timeline_section)

        # Save debug information (sync call within async function)
        DebugHelper.save_generation_debug(
            task_type="report",
            messages=messages,
            response=report,
            metadata={
                "start_time": start_time,
                "end_time": end_time,
                "num_hourly_summaries": len(hourly_summaries),
                "is_merged_report": True,
            },
        )

        return report

    def _build_activity_timeline_section(self, start_time: int, end_time: int) -> str:
        """Build a deterministic Mermaid timeline from stored activity records."""
        start_datetime = datetime.datetime.fromtimestamp(start_time) if start_time else None
        end_datetime = datetime.datetime.fromtimestamp(end_time) if end_time else None

        try:
            activities = get_storage().get_activities(
                start_time=start_datetime,
                end_time=end_datetime,
                limit=MAX_TIMELINE_ACTIVITIES,
            )
        except Exception as e:
            logger.exception(f"Failed to load activities for timeline: {e}")
            return ""

        timeline_items = []
        for activity in activities:
            item = self._format_timeline_activity(activity)
            if item:
                timeline_items.append(item)

        if not timeline_items:
            return ""

        timeline_items.sort(key=lambda item: (item["start_time"] or item["end_time"], item["id"]))
        title = self._sanitize_mermaid_text(
            f"Activity Timeline - {self._format_timeline_title_date(start_datetime, end_datetime)}"
        )
        lines = [
            "## Activity Timeline",
            "",
            "```mermaid",
            "timeline",
            f"    title {title}",
        ]
        for item in timeline_items:
            lines.append(f"    {item['time_range']} : {item['label']}")
        lines.append("```")
        return "\n".join(lines)

    def _format_timeline_activity(self, activity: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        start_dt = self._coerce_datetime(activity.get("start_time"))
        end_dt = self._coerce_datetime(activity.get("end_time"))
        if not start_dt and not end_dt:
            return None
        if start_dt and end_dt and end_dt < start_dt:
            end_dt = start_dt

        label = self._sanitize_mermaid_text(activity.get("title") or activity.get("content") or "Activity")
        if not label:
            return None

        return {
            "id": activity.get("id") or 0,
            "start_time": start_dt,
            "end_time": end_dt,
            "time_range": self._format_timeline_time_range(start_dt, end_dt),
            "label": label,
        }

    def _coerce_datetime(self, value: Any) -> Optional[datetime.datetime]:
        if isinstance(value, datetime.datetime):
            return self._normalize_datetime(value)
        if isinstance(value, (int, float)):
            return datetime.datetime.fromtimestamp(value)
        if isinstance(value, str):
            value = value.strip()
            if not value:
                return None
            normalized = value[:-1] + "+00:00" if value.endswith("Z") else value
            try:
                return self._normalize_datetime(datetime.datetime.fromisoformat(normalized))
            except ValueError:
                pass
            for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%d"):
                try:
                    return datetime.datetime.strptime(value, fmt)
                except ValueError:
                    continue
        return None

    def _normalize_datetime(self, value: datetime.datetime) -> datetime.datetime:
        if value.tzinfo:
            return value.astimezone().replace(tzinfo=None)
        return value

    def _format_timeline_title_date(
        self, start_datetime: Optional[datetime.datetime], end_datetime: Optional[datetime.datetime]
    ) -> str:
        if start_datetime and end_datetime and start_datetime.date() != end_datetime.date():
            return f"{start_datetime.strftime('%Y-%m-%d')} to {end_datetime.strftime('%Y-%m-%d')}"
        if start_datetime:
            return start_datetime.strftime("%Y-%m-%d")
        if end_datetime:
            return end_datetime.strftime("%Y-%m-%d")
        return "Selected range"

    def _format_timeline_time_range(
        self, start_dt: Optional[datetime.datetime], end_dt: Optional[datetime.datetime]
    ) -> str:
        primary_dt = start_dt or end_dt
        if not primary_dt:
            return "Unknown time"
        if not end_dt or end_dt == primary_dt:
            return primary_dt.strftime("%H:%M")
        if primary_dt.date() == end_dt.date():
            return f"{primary_dt.strftime('%H:%M')}-{end_dt.strftime('%H:%M')}"
        return f"{primary_dt.strftime('%m-%d %H:%M')}-{end_dt.strftime('%m-%d %H:%M')}"

    def _sanitize_mermaid_text(self, value: Any, max_length: int = 80) -> str:
        text = re.sub(r"\s+", " ", str(value or "").strip())
        text = text.replace(":", " -")
        text = text.replace("`", "'")
        text = text.replace("|", "-")
        text = text.replace("{", "(").replace("}", ")")
        text = text.replace("[", "(").replace("]", ")")
        if len(text) > max_length:
            text = text[: max_length - 3].rstrip() + "..."
        return text

    def _insert_activity_timeline_section(self, report: str, timeline_section: str) -> str:
        if "## Activity Timeline" in report or re.search(r"```mermaid\s+timeline", report, re.IGNORECASE):
            return report

        lines = report.splitlines()
        if lines and lines[0].startswith("# "):
            return "\n".join([lines[0], "", timeline_section, "", *lines[1:]]).strip()
        return f"{timeline_section}\n\n{report}".strip()

    def _format_timestamp(self, timestamp: int) -> str:
        """
        Format a timestamp into a readable string.
        """
        try:
            if timestamp:
                dt = datetime.datetime.fromtimestamp(timestamp)
                return dt.strftime("%Y-%m-%d %H:%M:%S")
            return "Unknown time"
        except (ValueError, OSError):
            return "Invalid time"

#!/usr/bin/env python
# -*- coding: utf-8 -*-

# Copyright (c) 2025 Beijing Volcano Engine Technology Co., Ltd.
# SPDX-License-Identifier: Apache-2.0

"""
Global LLM manager singleton wrapper
Provides global access to LLMManager instances
"""

import asyncio
import concurrent.futures
import json
import threading
from typing import Any, Dict, Optional

from opencontext.config.global_config import get_config
from opencontext.llm.llm_client import LLMClient, LLMType
from opencontext.storage.unified_storage import UnifiedStorage
from opencontext.utils.json_parser import parse_json_from_response
from opencontext.utils.logging_utils import get_logger

logger = get_logger(__name__)

MODEL_ASSIGNMENTS_CONFIG_KEY = "model_assignments"


class GlobalVLMClient:
    """
    Global LLM manager (singleton pattern)
    """

    _instance = None
    _lock = threading.Lock()
    _initialized = False

    def __new__(cls):
        """Ensure singleton pattern"""
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self):
        """Initialize VLM client"""
        if not self._initialized:
            with self._lock:
                if not self._initialized:
                    self._vlm_client: Optional[LLMClient] = None
                    self._vlm_clients: list[LLMClient] = []
                    self._vlm_configs: list[Dict[str, Any]] = []
                    self._vlm_config_names: list[str] = []
                    self._active_client_index = 0
                    self._auto_initialized = False
                    GlobalVLMClient._initialized = True

    @classmethod
    def get_instance(cls) -> "GlobalVLMClient":
        """
        Get global LLM manager instance
        """
        instance = cls()
        if not instance._auto_initialized and instance._vlm_client is None:
            instance._auto_initialize()
        return instance

    @classmethod
    def reset(cls):
        """Reset singleton instance (mainly for testing)"""
        with cls._lock:
            cls._instance = None
            cls._initialized = False

    @staticmethod
    def _normalize_vlm_config(config: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        """Normalize saved settings/profile shapes into LLMClient config."""
        if not isinstance(config, dict):
            return None

        api_key = config.get("api_key")
        if api_key is None:
            api_key = config.get("apiKey", "")

        normalized = {
            "base_url": config.get("base_url") or config.get("baseUrl") or "",
            "api_key": api_key or "",
            "model": config.get("model") or config.get("modelId") or "",
            "provider": config.get("provider") or config.get("modelPlatform") or "openai",
        }
        if config.get("timeout") is not None:
            normalized["timeout"] = config["timeout"]

        if not normalized["base_url"] or not normalized["model"]:
            return None
        return normalized

    @staticmethod
    def _vlm_config_key(config: Dict[str, Any]) -> tuple:
        return (
            (config.get("provider") or "").lower(),
            (config.get("base_url") or "").rstrip("/"),
            config.get("model") or "",
            config.get("api_key") or "",
        )

    def _get_vlm_configs(self) -> list[Dict[str, Any]]:
        """Return primary VLM config followed by saved profile configs."""
        config = get_config() or {}
        if not isinstance(config, dict):
            vlm_config = get_config("vlm_model")
            config = {"vlm_model": vlm_config} if vlm_config else {}

        candidates = [("default", config.get("vlm_model"))]
        for profile in config.get("model_profiles", []) or []:
            if isinstance(profile, dict):
                candidates.append((profile.get("name") or "", profile.get("config") or profile))

        configs = []
        seen = set()
        for profile_name, candidate in candidates:
            normalized = self._normalize_vlm_config(candidate)
            if not normalized:
                continue
            normalized["_profile_name"] = str(profile_name or normalized.get("model") or "")
            key = self._vlm_config_key(normalized)
            if key in seen:
                continue
            seen.add(key)
            configs.append(normalized)
        return configs

    def _create_vlm_clients(self) -> tuple[list[LLMClient], list[Dict[str, Any]]]:
        clients = []
        configs = []
        for vlm_config in self._get_vlm_configs():
            try:
                clients.append(LLMClient(llm_type=LLMType.CHAT, config=vlm_config))
                configs.append(vlm_config)
            except Exception as e:
                provider = vlm_config.get("provider", "unknown")
                model = vlm_config.get("model", "unknown")
                logger.warning(f"Skipping VLM model candidate {provider}/{model}: {e}")
        return clients, configs

    def _set_vlm_clients(self, clients: list[LLMClient], configs: list[Dict[str, Any]]):
        self._vlm_clients = clients
        self._vlm_configs = configs
        self._vlm_config_names = [str(config.get("_profile_name") or "") for config in configs]
        self._active_client_index = 0
        self._vlm_client = clients[0] if clients else None

    def _set_active_client(self, index: int):
        self._active_client_index = index
        self._vlm_client = self._vlm_clients[index]

    def _model_profile_index(self, model_profile: Optional[str]) -> Optional[int]:
        if not model_profile:
            return None
        profile_key = model_profile.casefold()
        for index, name in enumerate(self._vlm_config_names):
            if name.casefold() == profile_key:
                return index
        return None

    def _ordered_clients(self, model_profile: Optional[str] = None):
        if not self._vlm_clients:
            raise RuntimeError("GlobalVLMClient is not initialized")
        assigned_index = self._model_profile_index(model_profile)
        start = (
            assigned_index
            if assigned_index is not None
            else min(max(self._active_client_index, 0), len(self._vlm_clients) - 1)
        )
        for offset in range(len(self._vlm_clients)):
            index = (start + offset) % len(self._vlm_clients)
            yield index, self._vlm_clients[index]

    def _describe_client(self, index: int, client: LLMClient) -> str:
        if index < len(self._vlm_configs):
            config = self._vlm_configs[index]
            provider = config.get("provider", "unknown")
            model = config.get("model", getattr(client, "model", "unknown"))
            return f"{provider}/{model}"
        return getattr(client, "model", "unknown")

    def _log_client_failure(self, index: int, client: LLMClient, error: Exception):
        logger.warning(
            f"VLM model {self._describe_client(index, client)} failed; "
            f"trying next configured model: {error}"
        )

    def _run_with_failover(self, method_name: str, *args, model_profile: Optional[str] = None, **kwargs):
        last_error = None
        for index, client in self._ordered_clients(model_profile):
            try:
                result = getattr(client, method_name)(*args, **kwargs)
                if index != self._active_client_index:
                    logger.info(
                        f"Switched active VLM model to {self._describe_client(index, client)}"
                    )
                self._set_active_client(index)
                return result
            except Exception as e:
                last_error = e
                self._log_client_failure(index, client, e)
        raise last_error

    async def _run_with_failover_async(
        self, method_name: str, *args, model_profile: Optional[str] = None, **kwargs
    ):
        last_error = None
        for index, client in self._ordered_clients(model_profile):
            try:
                result = await getattr(client, method_name)(*args, **kwargs)
                if index != self._active_client_index:
                    logger.info(
                        f"Switched active VLM model to {self._describe_client(index, client)}"
                    )
                self._set_active_client(index)
                return result
            except Exception as e:
                last_error = e
                self._log_client_failure(index, client, e)
        raise last_error

    async def _stream_with_failover(self, method_name: str, *args, model_profile: Optional[str] = None, **kwargs):
        last_error = None
        for index, client in self._ordered_clients(model_profile):
            yielded = False
            try:
                async for chunk in getattr(client, method_name)(*args, **kwargs):
                    yielded = True
                    yield chunk
                if index != self._active_client_index:
                    logger.info(
                        f"Switched active VLM model to {self._describe_client(index, client)}"
                    )
                self._set_active_client(index)
                return
            except Exception as e:
                if yielded:
                    logger.warning(
                        f"VLM stream from {self._describe_client(index, client)} failed "
                        f"after output started: {e}"
                    )
                    raise
                last_error = e
                self._log_client_failure(index, client, e)
        raise last_error

    def _auto_initialize(self):
        """Auto-initialize VLM client"""
        if self._auto_initialized:
            return
        from opencontext.tools.tools_executor import ToolsExecutor

        self._tools_executor = ToolsExecutor()
        try:
            clients, configs = self._create_vlm_clients()
            if not clients:
                logger.warning("No valid VLM config found")
                self._auto_initialized = True
                return

            self._set_vlm_clients(clients, configs)
            logger.info(f"GlobalVLMClient auto-initialized with {len(clients)} model(s)")
            self._auto_initialized = True
        except Exception as e:
            logger.error(f"GlobalVLMClient auto-initialization failed: {e}")
            self._auto_initialized = True

    def is_initialized(self) -> bool:
        return bool(self._vlm_clients)

    def reinitialize(self):
        """
        Thread-safe reinitialization of VLM client
        """
        with self._lock:
            try:
                clients, configs = self._create_vlm_clients()
                if not clients:
                    logger.error("No vlm config found during reinitialize")
                    raise ValueError("No vlm config found")
                self._set_vlm_clients(clients, configs)
                logger.info(f"GlobalVLMClient reinitialized with {len(clients)} model(s)")

            except Exception as e:
                logger.error(f"Failed to reinitialize VLM client: {e}")
                return False
            return True

    def generate_with_messages(
        self,
        messages: list,
        enable_executor: bool = True,
        max_calls: int = 5,
        model_profile: Optional[str] = None,
        **kwargs,
    ):
        response = self._run_with_failover(
            "generate_with_messages", messages, model_profile=model_profile, **kwargs
        )
        call_count = 0
        while enable_executor:
            call_count += 1
            if call_count > max_calls:
                logger.warning(
                    f"Reached maximum tool call limit ({max_calls}), stopping further calls"
                )
                messages.append(
                    {
                        "role": "system",
                        "content": f"System notice: Maximum tool call limit ({max_calls}) reached. Cannot execute more tool calls. Please answer the user's question directly without attempting more tool calls.",
                    }
                )
                response = self._run_with_failover(
                    "generate_with_messages", messages, model_profile=model_profile, **kwargs
                )
                break
            message = response.choices[0].message
            if not message.tool_calls:
                break
            messages.append(message)
            tool_calls = message.tool_calls
            tool_call_info = []
            for tc in tool_calls:
                function_name = tc.function.name
                function_args = parse_json_from_response(tc.function.arguments)
                tool_call_info.append((tc.id, function_name, function_args))
            results = []
            with concurrent.futures.ThreadPoolExecutor() as executor:
                future_to_tool = {
                    executor.submit(self._tools_executor.run, function_name, function_args): (
                        tool_id,
                        function_name,
                    )
                    for tool_id, function_name, function_args in tool_call_info
                }
                for future in concurrent.futures.as_completed(future_to_tool):
                    tool_id, function_name = future_to_tool[future]
                    try:
                        content = future.result()
                        # logger.info(f"Tool call {function_name} successful, result: {content}")
                        results.append((tool_id, function_name, content))
                    except Exception as e:
                        # logger.exception(f"Tool call {function_name} failed: {e}")
                        results.append((tool_id, function_name, "failed"))
            # logger.info(f"Tool call results: {results}")
            for tool_id, function_name, content in results:
                messages.append(
                    {
                        "role": "tool",
                        "name": function_name,
                        "content": json.dumps(content),
                        "tool_call_id": tool_id,
                    }
                )
            response = self._run_with_failover(
                "generate_with_messages", messages, model_profile=model_profile, **kwargs
            )

        message = response.choices[0].message
        return message.content

    async def generate_with_messages_async(
        self,
        messages: list,
        enable_executor: bool = True,
        max_calls: int = 5,
        model_profile: Optional[str] = None,
        **kwargs,
    ):
        response = await self._run_with_failover_async(
            "generate_with_messages_async", messages, model_profile=model_profile, **kwargs
        )
        call_count = 0
        while enable_executor:
            call_count += 1
            if call_count > max_calls:
                # logger.warning(f"Reached maximum tool call limit ({max_calls}), stopping further calls")
                messages.append(
                    {
                        "role": "system",
                        "content": f"System notice: Maximum tool call limit ({max_calls}) reached. Cannot execute more tool calls. Please answer the user's question directly without attempting more tool calls.",
                    }
                )
                response = await self._run_with_failover_async(
                    "generate_with_messages_async", messages, model_profile=model_profile, **kwargs
                )
                break
            message = response.choices[0].message
            if not message.tool_calls:
                break
            messages.append(message)
            tool_calls = message.tool_calls

            # Collect all async tasks for tool calls
            tasks = []
            tool_call_info = []
            for tc in tool_calls:
                function_name = tc.function.name
                function_args = parse_json_from_response(tc.function.arguments)
                if function_args is not None:
                    tasks.append(self._tools_executor.run_async(function_name, function_args))
                    tool_call_info.append((tc.id, function_name))
                else:
                    logger.error(
                        f"Failed to parse arguments for {function_name}: {tc.function.arguments}"
                    )

            # Execute all tool calls in parallel
            results = await asyncio.gather(*tasks)

            # Collect results and add to message list
            for result, (tool_id, function_name) in zip(results, tool_call_info):
                # logger.info(f"Tool call {function_name} successful, result: {result}")
                messages.append(
                    {
                        "role": "tool",
                        "name": function_name,
                        "content": json.dumps(result),
                        "tool_call_id": tool_id,
                    }
                )

            # Call LLM again
            response = await self._run_with_failover_async(
                "generate_with_messages_async", messages, model_profile=model_profile, **kwargs
            )

        message = response.choices[0].message
        return message.content

    async def generate_for_agent_async(self, messages: list, tools: list = None, **kwargs):
        """
        Agent-specific generation method that returns raw response without auto-executing tool calls

        Args:
            messages: Message list
            tools: Available tool definitions
            **kwargs: Other parameters

        Returns:
            Raw LLM response object, including possible tool_calls
        """
        response = await self._run_with_failover_async(
            "generate_with_messages_async", messages, tools=tools, **kwargs
        )
        return response

    async def generate_stream_for_agent(self, messages: list, tools: list = None, **kwargs):
        """
        Agent-specific streaming generation method
        """
        async for chunk in self._stream_with_failover(
            "_openai_chat_completion_stream_async", messages, tools=tools, **kwargs
        ):
            yield chunk

    async def execute_tool_async(self, tool_call):
        """
        Execute a single tool call independently

        Args:
            tool_call: OpenAI format tool call object

        Returns:
            Tool execution result
        """
        function_name = tool_call.function.name
        function_args = parse_json_from_response(tool_call.function.arguments)

        if function_args is None:
            logger.error(
                f"Failed to parse arguments for {function_name}: {tool_call.function.arguments}"
            )
            return {"error": f"Failed to parse arguments for {function_name}"}

        try:
            result = await self._tools_executor.run_async(function_name, function_args)
            logger.info(f"Tool {function_name} executed successfully")
            return result
        except Exception as e:
            logger.exception(f"Tool {function_name} execution failed: {e}")
            return {"error": str(e)}


def is_initialized() -> bool:
    return GlobalVLMClient.get_instance()._auto_initialized


def generate_with_messages(
    messages: list, enable_executor: bool = True, max_calls: int = 5, **kwargs
):
    return GlobalVLMClient.get_instance().generate_with_messages(
        messages, enable_executor, max_calls, **kwargs
    )


async def generate_with_messages_async(
    messages: list, enable_executor: bool = True, max_calls: int = 5, **kwargs
):
    return await GlobalVLMClient.get_instance().generate_with_messages_async(
        messages, enable_executor, max_calls, **kwargs
    )


async def generate_for_agent_async(messages: list, tools: list = None, **kwargs):
    return await GlobalVLMClient.get_instance().generate_for_agent_async(messages, tools, **kwargs)


async def generate_stream_for_agent(messages: list, tools: list = None, **kwargs):
    async for chunk in GlobalVLMClient.get_instance().generate_stream_for_agent(
        messages, tools, **kwargs
    ):
        yield chunk


def get_feature_model_profile(feature_key: Optional[str]) -> Optional[str]:
    """Return the configured model profile for a feature, if one is assigned."""
    if not feature_key:
        return None

    assignments = get_config(MODEL_ASSIGNMENTS_CONFIG_KEY) or {}
    if not isinstance(assignments, dict):
        return None

    feature_assignments = assignments.get("features", {})
    if not isinstance(feature_assignments, dict):
        return None

    candidates = [feature_key]
    short_key = feature_key.rsplit(".", 1)[-1]
    if short_key != feature_key:
        candidates.append(short_key)

    for candidate in candidates:
        profile_name = feature_assignments.get(candidate)
        if isinstance(profile_name, str) and profile_name.strip():
            return profile_name.strip()
    return None

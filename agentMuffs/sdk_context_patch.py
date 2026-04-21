"""
Claude Agent SDK: get_context_usage() can return {} because _send_control_request
only returns result["response"]. Some CLI builds put totalTokens/maxTokens on the
same object as subtype/request_id (no nested "response" key). This patch merges
those top-level fields when the nested payload is empty.
"""

from __future__ import annotations

import json
import os
from typing import Any

import anyio


def apply_sdk_context_response_patch() -> None:
    from claude_agent_sdk._internal.query import Query

    async def _send_control_request_fixed(
        self: Any,
        request: dict[str, Any],
        timeout: float = 60.0,
    ) -> dict[str, Any]:
        if not self.is_streaming_mode:
            raise Exception("Control requests require streaming mode")

        self._request_counter += 1
        request_id = f"req_{self._request_counter}_{os.urandom(4).hex()}"

        event = anyio.Event()
        self.pending_control_responses[request_id] = event

        control_request = {
            "type": "control_request",
            "request_id": request_id,
            "request": request,
        }

        await self.transport.write(json.dumps(control_request) + "\n")

        try:
            with anyio.fail_after(timeout):
                await event.wait()

            result = self.pending_control_results.pop(request_id)
            self.pending_control_responses.pop(request_id, None)

            if isinstance(result, Exception):
                raise result

            response_data = result.get("response") or {}
            if not response_data and isinstance(result, dict):
                if any(
                    k in result
                    for k in (
                        "totalTokens",
                        "total_tokens",
                        "maxTokens",
                        "max_tokens",
                        "percentage",
                        "rawMaxTokens",
                        "raw_max_tokens",
                    )
                ):
                    response_data = {
                        k: v
                        for k, v in result.items()
                        if k not in ("subtype", "request_id", "error")
                    }
            return response_data if isinstance(response_data, dict) else {}
        except TimeoutError as e:
            self.pending_control_responses.pop(request_id, None)
            self.pending_control_results.pop(request_id, None)
            raise Exception(f"Control request timeout: {request.get('subtype')}") from e

    Query._send_control_request = _send_control_request_fixed  # type: ignore[method-assign]

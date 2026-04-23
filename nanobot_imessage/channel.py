"""iMessage channel for nanobot — powered by the Sendblue API.

Receives inbound iMessages via an HTTP webhook that Sendblue POSTs to,
and sends replies back via Sendblue's REST API.

Setup
-----
1. Install alongside nanobot: ``pip install -e .``
2. The entry point registers this channel automatically; nanobot discovers
   it under the name ``imessage``.
3. Point your Sendblue webhook URL to:
   ``http://<your-host>:<webhook_port><webhook_path>``
   (default: port 8765, path /webhook/sendblue)
4. Configure ~/.nanobot/config.json — see nanobot.example.json in the repo.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

import httpx
from aiohttp import web
from pydantic import BaseModel, Field

from nanobot.bus.events import OutboundMessage
from nanobot.bus.queue import MessageBus
from nanobot.channels.base import BaseChannel

logger = logging.getLogger(__name__)

_SENDBLUE_SEND_URL = "https://api.sendblue.com/api/send-message"
_SENDBLUE_TYPING_URL = "https://api.sendblue.com/api/send-typing-indicator"


class IMessageConfig(BaseModel):
    """Pydantic config for the iMessage/Sendblue channel."""

    enabled: bool = False
    # Sendblue credentials (sb-api-key-id / sb-api-secret-key)
    api_key_id: str = ""
    api_secret_key: str = ""
    # E.164 number Sendblue sends FROM (e.g. "+15551234567")
    from_number: str = ""
    # Allowlist of E.164 numbers that may send messages; ["*"] = allow all
    allow_from: list[str] = Field(default_factory=list)
    # Webhook listener settings
    webhook_host: str = "0.0.0.0"
    webhook_port: int = 8765
    webhook_path: str = "/webhook/sendblue"
    # Send a typing bubble to the user while the agent is thinking
    send_typing_indicator: bool = True


class IMessageChannel(BaseChannel):
    """Nanobot channel that bridges iMessage via the Sendblue API.

    Inbound path:  Sendblue → POST webhook → nanobot message bus → agent
    Outbound path: agent response → Sendblue REST API → iMessage
    """

    name = "imessage"
    display_name = "iMessage (Sendblue)"

    def __init__(self, config: IMessageConfig, bus: MessageBus) -> None:
        super().__init__(config, bus)
        self.config: IMessageConfig = config
        self._runner: web.AppRunner | None = None
        self._http: httpx.AsyncClient | None = None
        self._stop_event: asyncio.Event | None = None

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    async def start(self) -> None:
        self._running = True
        self._stop_event = asyncio.Event()
        self._http = httpx.AsyncClient(timeout=30)

        app = web.Application()
        app.router.add_post(self.config.webhook_path, self._handle_webhook)

        self._runner = web.AppRunner(app)
        await self._runner.setup()
        site = web.TCPSite(
            self._runner,
            self.config.webhook_host,
            self.config.webhook_port,
        )
        await site.start()
        logger.info(
            "iMessage channel webhook listening on %s:%d%s",
            self.config.webhook_host,
            self.config.webhook_port,
            self.config.webhook_path,
        )
        await self._stop_event.wait()

    async def stop(self) -> None:
        self._running = False
        if self._stop_event:
            self._stop_event.set()
        if self._runner:
            await self._runner.cleanup()
        if self._http:
            await self._http.aclose()

    # ------------------------------------------------------------------
    # Outbound
    # ------------------------------------------------------------------

    async def send(self, msg: OutboundMessage) -> None:
        if not msg.content:
            return
        resp = await self._http.post(
            _SENDBLUE_SEND_URL,
            headers=self._auth_headers(),
            json={
                "number": msg.chat_id,
                "from_number": self.config.from_number,
                "content": msg.content,
            },
        )
        if not resp.is_success:
            raise RuntimeError(
                f"Sendblue send failed ({resp.status_code}): {resp.text}"
            )

    # ------------------------------------------------------------------
    # Inbound webhook handler
    # ------------------------------------------------------------------

    async def _handle_webhook(self, request: web.Request) -> web.Response:
        try:
            payload: dict[str, Any] = await request.json()
        except Exception:
            return web.Response(status=400, text="invalid json")

        # Sendblue fires this endpoint for both inbound and outbound status
        # updates; ignore the latter.
        if payload.get("is_outbound"):
            return web.Response(text="ok")

        from_number: str = payload.get("from_number", "")
        content: str = (payload.get("content") or "").strip()

        if not content or not from_number:
            return web.Response(text="ok")

        if not self.is_allowed(from_number):
            logger.warning("iMessage: message from %s is not in allow_from — ignored", from_number)
            return web.Response(text="ok")

        # Show a typing bubble while the agent thinks (fire-and-forget)
        if self.config.send_typing_indicator:
            asyncio.create_task(self._send_typing(from_number))

        await self._handle_message(
            sender_id=from_number,
            chat_id=from_number,
            content=content,
            metadata={"sendblue": payload},
        )
        return web.Response(text="ok")

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _auth_headers(self) -> dict[str, str]:
        return {
            "sb-api-key-id": self.config.api_key_id,
            "sb-api-secret-key": self.config.api_secret_key,
        }

    async def _send_typing(self, to_number: str) -> None:
        try:
            await self._http.post(
                _SENDBLUE_TYPING_URL,
                headers=self._auth_headers(),
                json={
                    "number": to_number,
                    "from_number": self.config.from_number,
                },
            )
        except Exception as exc:
            logger.debug("Typing indicator skipped: %s", exc)

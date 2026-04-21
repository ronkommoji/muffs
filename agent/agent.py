"""
Muffs agent — FastAPI server wrapping Claude Agent SDK + Composio.
Runs on port 8000. Shares SQLite with the Next.js dashboard.
"""

import asyncio
import json
import logging
import os
import re
import sqlite3
import sys
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

import httpx
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

load_dotenv()

# Fix SDK control response shape for get_context_usage (see sdk_context_patch.py)
_agent_dir = Path(__file__).resolve().parent
if str(_agent_dir) not in sys.path:
    sys.path.insert(0, str(_agent_dir))
from sdk_context_patch import apply_sdk_context_response_patch

apply_sdk_context_response_patch()


def _normalize_context_usage(usage: dict[str, Any]) -> tuple[int, float, int]:
    """Return (total_tokens, percentage, max_tokens) from SDK dict (camelCase or snake_case)."""
    if not usage:
        return 0, 0.0, 0
    nested = usage.get("response")
    if isinstance(nested, dict):
        usage = {**usage, **nested}
    total = int(usage.get("totalTokens") or usage.get("total_tokens") or 0)
    mx = int(
        usage.get("maxTokens")
        or usage.get("max_tokens")
        or usage.get("rawMaxTokens")
        or usage.get("raw_max_tokens")
        or 0
    )
    pct = float(usage.get("percentage") or usage.get("percent") or 0)
    if mx == 0 and total > 0:
        raw = int(usage.get("rawMaxTokens") or usage.get("raw_max_tokens") or 0)
        if raw > 0:
            mx = raw
    if pct == 0 and mx > 0 and total > 0:
        pct = min(100.0, (total / mx) * 100.0)
    return total, pct, mx

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

ROOT = Path(__file__).parent.parent
DB_PATH = os.getenv("DB_PATH", str(ROOT / "muffs.db"))
MEMORY_PATH = ROOT / "agent" / "memory" / "memory.md"
PROMPTS_DIR = ROOT / "agent" / "prompts"

# ---------------------------------------------------------------------------
# Database helpers (sync, runs in thread pool via asyncio.to_thread)
# ---------------------------------------------------------------------------

def _get_db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def init_db():
    schema = (ROOT / "db" / "schema.sql").read_text()
    with _get_db() as conn:
        conn.executescript(schema)
        cols = [row[1] for row in conn.execute("PRAGMA table_info(sessions)").fetchall()]
        if "title" not in cols:
            conn.execute("ALTER TABLE sessions ADD COLUMN title TEXT")
        if "context_percentage" not in cols:
            conn.execute("ALTER TABLE sessions ADD COLUMN context_percentage REAL")
        if "context_max_tokens" not in cols:
            conn.execute("ALTER TABLE sessions ADD COLUMN context_max_tokens INTEGER")
        conn.execute(
            """
            UPDATE sessions SET title = (
              SELECT CASE
                WHEN length(trim(replace(replace(m.content, char(10), ' '), char(13), ' '))) > 60
                THEN substr(trim(replace(replace(m.content, char(10), ' '), char(13), ' ')), 1, 57) || '...'
                ELSE trim(replace(replace(m.content, char(10), ' '), char(13), ' '))
              END
              FROM messages m WHERE m.session_id = sessions.id ORDER BY m.created_at ASC LIMIT 1
            )
            WHERE (title IS NULL OR trim(title) = '')
              AND EXISTS (SELECT 1 FROM messages WHERE session_id = sessions.id)
            """
        )
        conn.commit()


def _db_write_event(session_id: str, event_type: str, tool_name: str | None, payload: dict, status: str):
    with _get_db() as conn:
        conn.execute(
            "INSERT INTO agent_events (session_id, event_type, tool_name, payload, status) VALUES (?, ?, ?, ?, ?)",
            (session_id, event_type, tool_name, json.dumps(payload), status),
        )
        conn.commit()


def _db_write_message(session_id: str, role: str, content: str, source: str = "sendblue"):
    with _get_db() as conn:
        conn.execute(
            "INSERT INTO messages (session_id, role, content, source) VALUES (?, ?, ?, ?)",
            (session_id, role, content, source),
        )
        conn.commit()


def _db_merge_sdk_session(session_id: str, sdk_session_id: str):
    """Store Claude SDK session id without touching token/context counters."""
    with _get_db() as conn:
        conn.execute(
            """INSERT INTO sessions (id, sdk_session_id, status) VALUES (?, ?, 'active')
               ON CONFLICT(id) DO UPDATE SET
                 sdk_session_id=excluded.sdk_session_id,
                 updated_at=CURRENT_TIMESTAMP""",
            (session_id, sdk_session_id),
        )
        conn.commit()


def _db_update_context_usage(
    session_id: str,
    total_tokens: int,
    percentage: float,
    max_tokens: int,
):
    with _get_db() as conn:
        conn.execute(
            """UPDATE sessions SET token_count=?, context_percentage=?, context_max_tokens=?,
                   updated_at=CURRENT_TIMESTAMP WHERE id=?""",
            (total_tokens, percentage, max_tokens, session_id),
        )
        conn.commit()


def _db_get_setting(key: str, default: str = "") -> str:
    with _get_db() as conn:
        row = conn.execute("SELECT value FROM settings WHERE key = ?", (key,)).fetchone()
        return row["value"] if row else default


def _db_get_active_session() -> str | None:
    with _get_db() as conn:
        row = conn.execute(
            "SELECT id FROM sessions WHERE status='active' ORDER BY updated_at DESC LIMIT 1"
        ).fetchone()
        return row["id"] if row else None


def _db_close_session(session_id: str):
    with _get_db() as conn:
        conn.execute(
            "UPDATE sessions SET status='closed', updated_at=CURRENT_TIMESTAMP WHERE id=?",
            (session_id,),
        )
        conn.commit()


def _db_get_routine(routine_id: int) -> dict | None:
    with _get_db() as conn:
        row = conn.execute("SELECT * FROM routines WHERE id=?", (routine_id,)).fetchone()
        return dict(row) if row else None


def _db_update_routine_run(routine_id: int, status: str):
    with _get_db() as conn:
        conn.execute(
            "UPDATE routines SET last_run_at=CURRENT_TIMESTAMP, last_run_status=? WHERE id=?",
            (status, routine_id),
        )
        conn.commit()


def _db_get_enabled_routines() -> list[dict]:
    with _get_db() as conn:
        rows = conn.execute("SELECT * FROM routines WHERE enabled=1").fetchall()
        return [dict(r) for r in rows]

# ---------------------------------------------------------------------------
# Sendblue credentials (reads DB first, falls back to env vars)
# ---------------------------------------------------------------------------

def _get_sendblue_creds() -> dict:
    try:
        with _get_db() as conn:
            rows = conn.execute(
                "SELECT key, value FROM settings WHERE key IN "
                "('sendblue_api_key','sendblue_api_secret','sendblue_from','sendblue_to')"
            ).fetchall()
            db = {r[0]: r[1] for r in rows}
    except Exception:
        db = {}
    return {
        "api_key_id":     db.get("sendblue_api_key")    or os.getenv("SENDBLUE_API_KEY_ID", ""),
        "api_secret_key": db.get("sendblue_api_secret") or os.getenv("SENDBLUE_API_SECRET_KEY", ""),
        "from_number":    db.get("sendblue_from")       or os.getenv("SENDBLUE_FROM_NUMBER", ""),
        "to_number":      db.get("sendblue_to")         or os.getenv("SENDBLUE_TO_NUMBER", ""),
    }

# ---------------------------------------------------------------------------
# Prompt builder
# ---------------------------------------------------------------------------

# Display names for Composio toolkit slugs (keep in sync with dashboard INTEGRATION_META)
_COMPOSIO_TOOLKIT_LABELS: dict[str, str] = {
    "gmail": "Gmail",
    "googlecalendar": "Google Calendar",
    "googledrive": "Google Drive",
    "googledocs": "Google Docs",
    "googlesheets": "Google Sheets",
    "notion": "Notion",
    "slack": "Slack",
    "outlook": "Outlook",
    "linear": "Linear",
    "jira": "Jira",
    "trello": "Trello",
    "airtable": "Airtable",
    "github": "GitHub",
    "supabase": "Supabase",
    "hubspot": "HubSpot",
    "twitter": "X (Twitter)",
    "linkedin": "LinkedIn",
    "youtube": "YouTube",
    "discord": "Discord",
    "spotify": "Spotify",
    "perplexityai": "Perplexity AI",
    "serpapi": "SerpAPI",
    "firecrawl": "Firecrawl",
    "figma": "Figma",
    "zoom": "Zoom",
    "dropbox": "Dropbox",
    "stripe": "Stripe",
    "google-calendar": "Google Calendar",
    "google-drive": "Google Drive",
}


def _append_composio_tool_truth(system_prompt: str, loaded_slugs: list[str]) -> str:
    """Ground the model in which Composio tools are actually mounted (avoids capability hallucination)."""
    if loaded_slugs:
        labels = [_COMPOSIO_TOOLKIT_LABELS.get(s, s) for s in loaded_slugs]
        lines = "\n".join(f"- {lb}" for lb in labels)
        return (
            system_prompt
            + "\n\n## External integrations (authoritative)\n"
            + "These are the ONLY third-party services you have as callable Composio tools "
            + "in this session:\n"
            + f"{lines}\n\n"
            + "When describing what you can do, mention only these integrations for "
            + "email/calendar/files/comms/etc. Do not claim Slack, Notion, Figma, Google Drive, "
            + "web browsing, or other products unless they appear in the list above. "
            + "You may still help with general advice from training knowledge, but do not "
            + "imply you can take actions in apps that are not listed."
        )
    return (
        system_prompt
        + "\n\n## External integrations (authoritative)\n"
        + "No Composio toolkits are loaded in this agent process (missing or empty "
        + "COMPOSIO_TOOLKITS, load error, or no tools returned). You do not have API-backed "
        + "tools for Gmail, Calendar, or other integrations unless they get loaded. "
        + "Do not claim specific app integrations. If the user connected accounts in the "
        + "dashboard, explain that the agent server needs COMPOSIO_TOOLKITS set to matching "
        + "slugs (e.g. gmail,googlecalendar) and a restart."
    )


# Common timezone labels from User Facts → IANA (best-effort; full names work via ZoneInfo)
_TZ_ALIASES: dict[str, str] = {
    "EST": "America/New_York",
    "EDT": "America/New_York",
    "ET": "America/New_York",
    "EASTERN": "America/New_York",
    "CST": "America/Chicago",
    "CDT": "America/Chicago",
    "CT": "America/Chicago",
    "CENTRAL": "America/Chicago",
    "MST": "America/Denver",
    "MDT": "America/Denver",
    "MT": "America/Denver",
    "MOUNTAIN": "America/Denver",
    "PST": "America/Los_Angeles",
    "PDT": "America/Los_Angeles",
    "PT": "America/Los_Angeles",
    "PACIFIC": "America/Los_Angeles",
    "GMT": "UTC",
    "UTC": "UTC",
    "UK": "Europe/London",
    "BST": "Europe/London",
}


def _user_timezone_raw_from_memory() -> str:
    memory = MEMORY_PATH.read_text() if MEMORY_PATH.exists() else ""
    if not memory:
        return ""
    uf_match = re.search(r"## User Facts\n(.*?)(?=## |\Z)", memory, re.DOTALL)
    if not uf_match:
        return ""
    block = uf_match.group(1)
    m = re.search(r"^\s*-\s*Timezone:\s*(.+)$", block, re.MULTILINE | re.IGNORECASE)
    return m.group(1).strip() if m else ""


def _resolve_user_local_now(tz_raw: str) -> tuple[datetime, str]:
    """Return (aware local now, label for the prompt)."""
    raw = tz_raw.strip()
    if not raw:
        z = ZoneInfo("UTC")
        return datetime.now(z), "UTC (set timezone in User Facts via /setup)"

    try:
        z = ZoneInfo(raw)
        return datetime.now(z), raw
    except Exception:
        pass

    key = raw.upper().replace(" ", "_")
    if key in _TZ_ALIASES:
        iana = _TZ_ALIASES[key]
        z = ZoneInfo(iana)
        return datetime.now(z), f"{raw} ({iana})"

    z = ZoneInfo("UTC")
    return datetime.now(z), f"{raw} (unrecognized; showing UTC)"


def _append_current_datetime_context(system_prompt: str) -> str:
    tz_raw = _user_timezone_raw_from_memory()
    local_now, tz_label = _resolve_user_local_now(tz_raw)
    utc_now = datetime.now(timezone.utc)
    pretty_local = local_now.strftime("%A, %B %d, %Y · %I:%M %p")
    block = (
        "\n\n## Current time (authoritative)\n"
        "Use this block for anything about “today”, dates, or scheduling. Do not guess the calendar date.\n\n"
        f"- User local ({tz_label}): {pretty_local}\n"
        f"- UTC (ISO 8601): {utc_now.isoformat(timespec='seconds')}\n"
    )
    return system_prompt + block


def _assistant_plaintext(text: str) -> str:
    """Strip common Markdown so iMessage and the dashboard stay readable."""
    if not text or not text.strip():
        return text

    def _unfence(m: re.Match[str]) -> str:
        return (m.group(1) or "").strip()

    t = re.sub(r"```(?:\w*\n)?([\s\S]*?)```", _unfence, text)
    t = re.sub(r"`([^`]+)`", r"\1", t)
    t = re.sub(r"\*\*([^*]+)\*\*", r"\1", t)
    t = re.sub(r"__([^_]+)__", r"\1", t)
    t = re.sub(r"(?<!\*)\*([^*]+)\*(?!\*)", r"\1", t)
    t = re.sub(r"(?<!_)_([^_]+)_(?!_)", r"\1", t)
    t = re.sub(r"^#{1,6}\s*(.+)$", r"\1", t, flags=re.MULTILINE)
    t = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", r"\1 (\2)", t)
    t = re.sub(r"^---+$\s?", "", t, flags=re.MULTILINE)
    t = re.sub(r"\n{3,}", "\n\n", t)
    return t.strip()


def _build_system_prompt(override: str | None = None) -> str:
    if override:
        return override

    base = (PROMPTS_DIR / "muffs_base.txt").read_text()
    memory = MEMORY_PATH.read_text() if MEMORY_PATH.exists() else ""

    user_facts = ""
    agent_notes = ""
    if memory:
        uf_match = re.search(r"## User Facts\n(.*?)(?=## |\Z)", memory, re.DOTALL)
        an_match = re.search(r"## Agent Notes\n(.*?)(?=## |\Z)", memory, re.DOTALL)
        user_facts = uf_match.group(1).strip() if uf_match else ""
        agent_notes = an_match.group(1).strip() if an_match else ""

    personality_notes = _db_get_setting("personality_notes")
    response_style = _db_get_setting("response_style", "Concise")
    tone_adjustments = _db_get_setting("tone_adjustments")
    off_limits = _db_get_setting("off_limits_topics")

    prompt = base.replace("{{USER_FACTS}}", user_facts or "Not yet configured. Run /setup.").replace(
        "{{AGENT_NOTES}}", agent_notes or "Nothing yet."
    )

    extra = []
    if personality_notes:
        extra.append(f"Additional personality context: {personality_notes}")
    if response_style != "Concise":
        extra.append(f"Response style preference: {response_style}")
    if tone_adjustments:
        extra.append(f"Tone adjustments: {tone_adjustments}")
    if off_limits:
        extra.append(f"Never bring up unprompted: {off_limits}")

    if extra:
        prompt += "\n\n## User Preferences\n" + "\n".join(extra)

    return prompt

# ---------------------------------------------------------------------------
# Sendblue sender
# ---------------------------------------------------------------------------

async def send_sendblue_message(content: str, to_number: str | None = None):
    creds = _get_sendblue_creds()
    to = to_number or creds["to_number"]
    if not all([creds["api_key_id"], creds["api_secret_key"], creds["from_number"], to]):
        print("[Sendblue] Credentials missing — skipping send")
        return
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            "https://api.sendblue.com/api/send-message",
            headers={
                "sb-api-key-id": creds["api_key_id"],
                "sb-api-secret-key": creds["api_secret_key"],
            },
            json={"number": to, "from_number": creds["from_number"], "content": content},
            timeout=30,
        )
        if not resp.is_success:
            print(f"[Sendblue] Send failed {resp.status_code}: {resp.text}")

# ---------------------------------------------------------------------------
# Core agent runner
# ---------------------------------------------------------------------------

async def run_agent(
    message: str,
    session_id: str | None = None,
    system_prompt_override: str | None = None,
    send_via_sendblue: bool = True,
    normalize_assistant_text: bool = True,
) -> tuple[str, str]:
    """Run the agent with the given message. Returns (response_text, session_id)."""
    from claude_agent_sdk import (
        AssistantMessage,
        ClaudeAgentOptions,
        ClaudeSDKClient,
        ResultMessage,
        TextBlock,
        ToolUseBlock,
    )

    system_prompt = _build_system_prompt(system_prompt_override)

    # Composio MCP: use ClaudeAgentSDKProvider + tools.get() → SdkMcpTool list (not raw dicts).
    mcp_servers: dict[str, Any] = {}
    loaded_composio_toolkits: list[str] = []
    composio_key = os.getenv("COMPOSIO_API_KEY")
    if composio_key:
        try:
            from composio import Composio
            from composio_claude_agent_sdk import ClaudeAgentSDKProvider

            toolkit_raw = os.getenv("COMPOSIO_TOOLKITS", "")
            toolkits = [t.strip() for t in toolkit_raw.split(",") if t.strip()]
            if not toolkits:
                print(
                    "Composio: set COMPOSIO_TOOLKITS (comma-separated slugs, e.g. gmail,slack) "
                    "to load MCP tools; continuing without Composio tools."
                )
            else:
                provider = ClaudeAgentSDKProvider()
                composio = Composio(api_key=composio_key, provider=provider)
                wrapped = composio.tools.get(user_id="default", toolkits=toolkits)
                if wrapped:
                    mcp_servers["composio"] = provider.create_mcp_server(wrapped)
                    loaded_composio_toolkits = toolkits
        except Exception as e:
            print(f"Composio init error (continuing without tools): {e}")

    system_prompt = _append_composio_tool_truth(system_prompt, loaded_composio_toolkits)
    system_prompt = _append_current_datetime_context(system_prompt)

    # dashboard_session_id: the ID used for DB message storage (stays constant)
    # sdk_session_id: the ID the Claude SDK assigns (used for resumption)
    dashboard_session_id = session_id or f"sess_{int(datetime.now(timezone.utc).timestamp() * 1000)}"
    sdk_session_id: str | None = None

    # If resuming, we need to pass the SDK's own session ID, not the dashboard one
    resume_id = None
    with _get_db() as conn:
        row = conn.execute(
            "SELECT sdk_session_id FROM sessions WHERE id=?", (dashboard_session_id,)
        ).fetchone()
        if row and row[0]:
            resume_id = row[0]

    options = ClaudeAgentOptions(
        system_prompt=system_prompt,
        permission_mode="bypassPermissions",
        mcp_servers=mcp_servers if mcp_servers else None,
        resume=resume_id,
    )

    response_text = ""

    async with ClaudeSDKClient(options=options) as client:
        await client.query(message)

        async for msg in client.receive_response():
            if isinstance(msg, AssistantMessage):
                for block in msg.content:
                    if isinstance(block, TextBlock):
                        response_text += block.text
                    elif isinstance(block, ToolUseBlock):
                        await asyncio.to_thread(
                            _db_write_event,
                            dashboard_session_id,
                            "tool_call",
                            block.name,
                            {"input": block.input},
                            "success",
                        )

            elif isinstance(msg, ResultMessage):
                cost = getattr(msg, "total_cost_usd", 0) or 0
                await asyncio.to_thread(
                    _db_write_event,
                    dashboard_session_id,
                    "result",
                    None,
                    {"cost_usd": cost},
                    "success",
                )

            # Capture SDK session ID from system init — store it for future resumption
            elif hasattr(msg, "subtype") and msg.subtype == "init":
                sid = getattr(msg, "session_id", None) or (
                    msg.data.get("session_id") if hasattr(msg, "data") else None
                )
                if sid:
                    sdk_session_id = sid
                    await asyncio.to_thread(_db_merge_sdk_session, dashboard_session_id, sid)

        # Check context usage and auto-rotate if > 90%
        try:
            raw_usage = await client.get_context_usage()
            total, pct, max_toks = _normalize_context_usage(
                raw_usage if isinstance(raw_usage, dict) else {}
            )
            await asyncio.to_thread(
                _db_update_context_usage,
                dashboard_session_id,
                total,
                pct,
                max_toks,
            )
            if pct > 90:
                auto_rotate_setting = _db_get_setting("auto_rotate_session", "true")
                if auto_rotate_setting.lower() == "true":
                    await asyncio.to_thread(_db_close_session, dashboard_session_id)
                    await send_sendblue_message(
                        "Heads up — we're almost out of room in this chat, so I'm starting fresh. "
                        "What do you need?"
                    )
        except Exception:
            logging.exception(
                "get_context_usage / persist failed for session %s", dashboard_session_id
            )

    if response_text:
        if normalize_assistant_text:
            response_text = _assistant_plaintext(response_text)
        await asyncio.to_thread(
            _db_write_message, dashboard_session_id, "assistant", response_text, "agent"
        )
        if send_via_sendblue:
            await send_sendblue_message(response_text)

    return response_text, dashboard_session_id

# ---------------------------------------------------------------------------
# Routine runner
# ---------------------------------------------------------------------------

async def run_routine(routine_id: int):
    routine = await asyncio.to_thread(_db_get_routine, routine_id)
    if not routine:
        return
    try:
        await run_agent(
            message="Execute your scheduled routine now.",
            system_prompt_override=routine["system_prompt"],
            send_via_sendblue=True,
        )
        await asyncio.to_thread(_db_update_routine_run, routine_id, "success")
    except Exception as e:
        await asyncio.to_thread(_db_update_routine_run, routine_id, "error")
        print(f"Routine {routine_id} failed: {e}")

# ---------------------------------------------------------------------------
# Scheduler
# ---------------------------------------------------------------------------

scheduler = AsyncIOScheduler()


def _reload_routines():
    scheduler.remove_all_jobs()
    routines = _db_get_enabled_routines()
    for r in routines:
        try:
            cron_kwargs = _parse_cron(r["schedule_cron"])
        except ValueError as e:
            print(f"Routine {r['id']} skipped — {e}")
            continue
        scheduler.add_job(
            run_routine,
            "cron",
            args=[r["id"]],
            id=f"routine_{r['id']}",
            **cron_kwargs,
            timezone=r.get("timezone", "UTC"),
            replace_existing=True,
        )


def _parse_cron(expr: str) -> dict:
    parts = expr.strip().split()
    if len(parts) != 5:
        raise ValueError(f"Invalid cron expression (expected 5 fields): {expr!r}")
    keys = ["minute", "hour", "day", "month", "day_of_week"]
    return dict(zip(keys, parts))

# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    _reload_routines()
    scheduler.start()
    yield
    scheduler.shutdown()


app = FastAPI(title="Muffs Agent", lifespan=lifespan)


class RunRequest(BaseModel):
    message: str
    session_id: str | None = None
    send_via_sendblue: bool = True


class NewSessionRequest(BaseModel):
    pass


class GenerateRoutinePromptRequest(BaseModel):
    user_intent: str
    schedule_description: str


class ConnectIntegrationRequest(BaseModel):
    toolkit: str
    user_id: str = "default"


@app.get("/")
async def root():
    return {"service": "muffs-agent", "health": "/health", "docs": "/docs"}


@app.get("/health")
async def health():
    return {"status": "ok", "time": datetime.now(timezone.utc).isoformat()}


@app.post("/run")
async def run(req: RunRequest):
    session_id = req.session_id or await asyncio.to_thread(_db_get_active_session)
    try:
        text, sid = await run_agent(
            message=req.message,
            session_id=session_id,
            send_via_sendblue=req.send_via_sendblue,
        )
        return {"response": text, "session_id": sid}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/new-session")
async def new_session():
    old_id = await asyncio.to_thread(_db_get_active_session)
    if old_id:
        await asyncio.to_thread(_db_close_session, old_id)
    return {"ok": True, "closed_session_id": old_id}


@app.get("/context")
async def context_usage():
    from claude_agent_sdk import ClaudeAgentOptions, ClaudeSDKClient

    dashboard_session_id = await asyncio.to_thread(_db_get_active_session)
    if not dashboard_session_id:
        return {"percentage": 0, "totalTokens": 0, "maxTokens": 0}

    # Must resume with the SDK's own session ID, not the dashboard one
    with _get_db() as conn:
        row = conn.execute(
            "SELECT sdk_session_id FROM sessions WHERE id=?", (dashboard_session_id,)
        ).fetchone()
    sdk_session_id = row[0] if row and row[0] else None
    if not sdk_session_id:
        return {"percentage": 0, "totalTokens": 0, "maxTokens": 0}

    options = ClaudeAgentOptions(resume=sdk_session_id)
    async with ClaudeSDKClient(options=options) as client:
        raw = await client.get_context_usage()
    total, pct, mx = _normalize_context_usage(raw if isinstance(raw, dict) else {})
    return {"percentage": pct, "totalTokens": total, "maxTokens": mx}


@app.post("/routine/run/{routine_id}")
async def trigger_routine(routine_id: int):
    await run_routine(routine_id)
    return {"ok": True}


@app.post("/routine/reload")
async def reload_routines():
    await asyncio.to_thread(_reload_routines)
    return {"ok": True}


@app.post("/generate-routine-prompt")
async def generate_routine_prompt(req: GenerateRoutinePromptRequest):
    template = (PROMPTS_DIR / "routine_generator.txt").read_text()
    filled = template.replace("{{USER_INTENT}}", req.user_intent).replace(
        "{{SCHEDULE_DESCRIPTION}}", req.schedule_description
    )
    text, _ = await run_agent(
        message="Generate the routine system prompt as instructed.",
        system_prompt_override=filled,
        send_via_sendblue=False,
        normalize_assistant_text=False,
    )
    return {"prompt": text}


@app.post("/integrations/connect")
async def connect_integration(req: ConnectIntegrationRequest):
    composio_key = os.getenv("COMPOSIO_API_KEY")
    if not composio_key:
        raise HTTPException(status_code=400, detail="COMPOSIO_API_KEY not configured")
    try:
        from composio import Composio
        composio = Composio(api_key=composio_key)
        session = composio.tool_router.create(
            user_id=req.user_id, toolkits=[req.toolkit]
        )
        connection_request = session.authorize(req.toolkit)
        return {"redirect_url": connection_request.redirect_url}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/integrations")
async def list_integrations():
    composio_key = os.getenv("COMPOSIO_API_KEY")
    if not composio_key:
        return {"items": []}
    try:
        from composio import Composio
        composio = Composio(api_key=composio_key)
        session = composio.tool_router.create(user_id="default")
        toolkits = session.toolkits()
        return {
            "items": [
                {
                    "slug": t.slug,
                    "name": getattr(t, "name", t.slug),
                    "connected": t.connection.is_active if t.connection else False,
                }
                for t in toolkits.items
            ]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("agent:app", host="0.0.0.0", port=8000, reload=True)

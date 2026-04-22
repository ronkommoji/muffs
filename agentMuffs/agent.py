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
import threading
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

import httpx
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel

load_dotenv()

# Repo root on path so `python agentMuffs/agent.py` works (not only `python -m agentMuffs.agent`).
_agent_dir = Path(__file__).resolve().parent
_repo_root = _agent_dir.parent
if str(_repo_root) not in sys.path:
    sys.path.insert(0, str(_repo_root))

from agentMuffs.workspace import ensure_workspace, read_preferences_json

_ws = ensure_workspace()
if not os.getenv("DB_PATH", "").strip():
    os.environ["DB_PATH"] = str(_ws.db_file)
if not os.getenv("MEMORY_PATH", "").strip():
    os.environ["MEMORY_PATH"] = str(_ws.memory_file)
if not os.getenv("SOUL_PATH", "").strip():
    os.environ["SOUL_PATH"] = str(_ws.soul_file)
if not os.getenv("IDENTITY_PATH", "").strip():
    os.environ["IDENTITY_PATH"] = str(_ws.identity_file)
if not os.getenv("PERSONALITY_PATH", "").strip():
    os.environ["PERSONALITY_PATH"] = str(_ws.personality_file)

from agentMuffs.sdk_context_patch import apply_sdk_context_response_patch

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

_AGENT_DIR = Path(__file__).resolve().parent
ROOT = _AGENT_DIR.parent
DB_PATH = os.getenv("DB_PATH", str(_ws.db_file))
_mp = os.getenv("MEMORY_PATH", "").strip()
MEMORY_PATH = Path(_mp) if _mp else _ws.memory_file
_sp = os.getenv("SOUL_PATH", "").strip()
SOUL_PATH = Path(_sp) if _sp else _ws.soul_file
_id = os.getenv("IDENTITY_PATH", "").strip()
IDENTITY_PATH = Path(_id) if _id else _ws.identity_file
_pp = os.getenv("PERSONALITY_PATH", "").strip()
PERSONALITY_PATH = Path(_pp) if _pp else _ws.personality_file
PROMPTS_DIR = _AGENT_DIR / "prompts"

_memory_file_lock = threading.Lock()
_memory_mcp_server: Any = None

# ---------------------------------------------------------------------------
# Database helpers (sync, runs in thread pool via asyncio.to_thread)
# ---------------------------------------------------------------------------

def _get_db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


LEGACY_SETTING_KEYS: tuple[str, ...] = (
    "user_display_name",
    "agent_display_name",
    "response_style",
    "personality_notes",
    "tone_adjustments",
    "off_limits_topics",
    "composio_toolkits",
    "onboarding_completed",
    "auto_rotate_session",
    "sendblue_api_key",
    "sendblue_api_secret",
    "sendblue_from",
    "sendblue_to",
)


def _prune_legacy_settings(conn: sqlite3.Connection) -> None:
    """Remove keys that no longer belong in SQLite (markdown, env, or preferences.json)."""
    if not LEGACY_SETTING_KEYS:
        return
    q = ",".join("?" * len(LEGACY_SETTING_KEYS))
    conn.execute(f"DELETE FROM settings WHERE key IN ({q})", LEGACY_SETTING_KEYS)


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
        if "kind" not in cols:
            conn.execute("ALTER TABLE sessions ADD COLUMN kind TEXT DEFAULT 'general'")
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS routine_runs (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              routine_id INTEGER NOT NULL REFERENCES routines(id) ON DELETE CASCADE,
              started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
              finished_at DATETIME,
              status TEXT NOT NULL,
              output_excerpt TEXT,
              error TEXT
            )
            """
        )
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
        _prune_legacy_settings(conn)
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


def _db_get_active_session() -> str | None:
    """Most recently touched session (chat-native multi-session; no global single active)."""
    with _get_db() as conn:
        row = conn.execute(
            "SELECT id FROM sessions ORDER BY updated_at DESC LIMIT 1"
        ).fetchone()
        return row["id"] if row else None


def _db_get_session_kind(session_id: str) -> str:
    with _get_db() as conn:
        row = conn.execute("SELECT kind FROM sessions WHERE id=?", (session_id,)).fetchone()
        if row and row["kind"]:
            return str(row["kind"])
    return "general"


def _db_touch_session_updated(session_id: str) -> None:
    with _get_db() as conn:
        conn.execute(
            "UPDATE sessions SET updated_at=CURRENT_TIMESTAMP WHERE id=?",
            (session_id,),
        )
        conn.commit()


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


def _db_insert_routine_run_row(routine_id: int) -> int:
    with _get_db() as conn:
        cur = conn.execute(
            "INSERT INTO routine_runs (routine_id, status) VALUES (?, 'running')",
            (routine_id,),
        )
        conn.commit()
        return int(cur.lastrowid)


def _db_finish_routine_run(
    run_row_id: int,
    status: str,
    output_excerpt: str | None = None,
    error: str | None = None,
) -> None:
    with _get_db() as conn:
        conn.execute(
            """UPDATE routine_runs SET finished_at=CURRENT_TIMESTAMP, status=?,
                   output_excerpt=?, error=? WHERE id=?""",
            (status, output_excerpt, error, run_row_id),
        )
        conn.commit()


def _db_get_enabled_routines() -> list[dict]:
    with _get_db() as conn:
        rows = conn.execute("SELECT * FROM routines WHERE enabled=1").fetchall()
        return [dict(r) for r in rows]

# ---------------------------------------------------------------------------
# Sendblue — env only (no secrets in SQLite)
# ---------------------------------------------------------------------------

def _get_sendblue_creds() -> dict:
    return {
        "api_key_id": os.getenv("SENDBLUE_API_KEY_ID", ""),
        "api_secret_key": os.getenv("SENDBLUE_API_SECRET_KEY", ""),
        "from_number": os.getenv("SENDBLUE_FROM_NUMBER", ""),
        "to_number": os.getenv("SENDBLUE_TO_NUMBER", ""),
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


def _agent_name_from_markdown() -> str:
    """Assistant display name: identity.md Assistant name, then soul.md 'You are **Name**', else default."""
    if IDENTITY_PATH.exists():
        raw = IDENTITY_PATH.read_text(encoding="utf-8")
        for line in raw.splitlines():
            ln = line.strip()
            # `- **Assistant name:** Muffs` (colon inside bold run)
            m = re.search(r"(?i)(?:[-*]\s+)?\*\*Assistant name:\*\*\s*(.+)$", ln)
            if not m:
                m = re.search(r"(?i)(?:[-*]\s+)?Assistant name:\s*(.+)$", ln)
            if m:
                v = m.group(1).strip().strip("*").strip()
                if v and v != "—":
                    return v
    if SOUL_PATH.exists():
        raw = SOUL_PATH.read_text(encoding="utf-8")
        m = re.search(r"You are\s+\*\*([^*]+)\*\*", raw)
        if m:
            return m.group(1).strip()
    return "Muffs"


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

    agent_name = _agent_name_from_markdown()

    blocks: list[str] = []
    if SOUL_PATH.exists():
        soul_raw = SOUL_PATH.read_text(encoding="utf-8").strip()
        if soul_raw:
            blocks.append("## Soul\n\n" + soul_raw)

    if IDENTITY_PATH.exists():
        id_raw = IDENTITY_PATH.read_text(encoding="utf-8").strip()
        if id_raw:
            blocks.append("## Identity\n\n" + id_raw)

    mid = (
        base.replace("{{AGENT_NAME}}", agent_name)
        .replace("{{USER_FACTS}}", user_facts or "Not yet configured. Run /setup.")
        .replace("{{AGENT_NOTES}}", agent_notes or "Nothing yet.")
    )

    prompt = ("\n\n---\n\n").join(blocks) + ("\n\n---\n\n" if blocks else "") + mid

    if PERSONALITY_PATH.exists():
        p_raw = PERSONALITY_PATH.read_text(encoding="utf-8").strip()
        if p_raw:
            prompt += "\n\n## Personality\n\n" + p_raw

    return prompt


def _atomic_write_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".tmp")
    try:
        tmp.write_text(text, encoding="utf-8")
        tmp.replace(path)
    except Exception:
        if tmp.exists():
            tmp.unlink(missing_ok=True)
        raise


def _append_agent_note_sync(note: str) -> None:
    """Append one bullet line under ## Agent Notes in memory.md (thread-safe)."""
    note_one_line = " ".join(note.split())
    if not note_one_line:
        raise ValueError("empty note")
    if len(note_one_line) > 2000:
        note_one_line = note_one_line[:2000] + "…"
    line = f"- {note_one_line}"

    with _memory_file_lock:
        path = MEMORY_PATH
        raw = path.read_text(encoding="utf-8") if path.exists() else ""

        if not raw.strip():
            raw = (
                "# Muffs Memory\n\n## User Facts\n\n"
                "Not yet configured. Run /setup.\n\n"
                "## Agent Notes\n\n"
            )

        if "## Agent Notes" not in raw:
            raw = raw.rstrip() + "\n\n## Agent Notes\n\n"

        parts = re.split(r"(## Agent Notes\s*\n)", raw, maxsplit=1)
        if len(parts) != 3:
            raise RuntimeError("memory.md: could not find Agent Notes section")

        before, sep, after = parts[0], parts[1], parts[2]
        new_after = after.rstrip() + "\n" + line + "\n"
        _atomic_write_text(path, before + sep + new_after)


def _get_muffs_memory_mcp() -> Any:
    """In-process MCP server: tools to persist Agent Notes (singleton)."""
    global _memory_mcp_server

    if _memory_mcp_server is not None:
        return _memory_mcp_server

    from claude_agent_sdk import create_sdk_mcp_server, tool

    @tool(
        "append_agent_memory",
        "Save a durable note to the Agent Notes section of memory.md so future sessions remember it. "
        "Use when the user asks you to remember something, or when you learn stable preferences or facts "
        "(not throwaway chat). One short line per call. Do not store passwords, API keys, or one-time codes.",
        {"note": str},
    )
    async def append_agent_memory(args: dict[str, Any]) -> dict[str, Any]:
        n = (args.get("note") or "").strip()
        if not n:
            return {
                "content": [{"type": "text", "text": "Error: `note` must be non-empty."}],
                "is_error": True,
            }
        try:
            await asyncio.to_thread(_append_agent_note_sync, n)
            return {"content": [{"type": "text", "text": "Saved to Agent Notes."}]}
        except Exception as e:
            return {
                "content": [{"type": "text", "text": f"Could not save memory: {e}"}],
                "is_error": True,
            }

    _memory_mcp_server = create_sdk_mcp_server("muffs_memory", tools=[append_agent_memory])
    return _memory_mcp_server


def _create_propose_routine_mcp(dashboard_session_id: str) -> Any:
    """Per-run MCP server so propose_routine closes over the dashboard session id."""
    from claude_agent_sdk import create_sdk_mcp_server, tool

    @tool(
        "propose_routine",
        "Submit the finalized scheduled automation: 5-field cron, IANA timezone, concise name, "
        "one-line description, and a complete system_prompt the runner will use each time. "
        "Call once when ready. User confirms creation in the dashboard.",
        {
            "name": str,
            "description": str,
            "schedule_cron": str,
            "timezone": str,
            "system_prompt": str,
        },
    )
    async def propose_routine(args: dict[str, Any]) -> dict[str, Any]:
        name = (args.get("name") or "").strip()
        desc = (args.get("description") or "").strip()
        cron_s = (args.get("schedule_cron") or "").strip()
        tz = (args.get("timezone") or "UTC").strip()
        sys_p = (args.get("system_prompt") or "").strip()
        if not name or not cron_s or not sys_p:
            return {
                "content": [{"type": "text", "text": "Error: name, schedule_cron, and system_prompt are required."}],
                "is_error": True,
            }
        parts = cron_s.split()
        if len(parts) != 5:
            return {
                "content": [{"type": "text", "text": "Error: schedule_cron must have exactly 5 fields."}],
                "is_error": True,
            }
        proposal = {
            "name": name,
            "description": desc or name,
            "schedule_cron": cron_s,
            "timezone": tz,
            "system_prompt": sys_p,
        }
        try:
            line = "__MUFFS_ROUTINE_PROPOSAL__\n" + json.dumps(proposal, ensure_ascii=False)

            def _persist() -> None:
                _db_write_message(dashboard_session_id, "assistant", line, "routine_proposal")
                _db_touch_session_updated(dashboard_session_id)

            await asyncio.to_thread(_persist)
            return {
                "content": [
                    {
                        "type": "text",
                        "text": "Proposal saved. Tell the user they can tap Open in the chat to review and create the automation.",
                    }
                ],
            }
        except Exception as e:
            return {
                "content": [{"type": "text", "text": f"Could not save proposal: {e}"}],
                "is_error": True,
            }

    return create_sdk_mcp_server("muffs_automation", tools=[propose_routine])


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
    if session_id and _db_get_session_kind(session_id) == "automation_creator":
        ac_path = PROMPTS_DIR / "automation_creator.txt"
        if ac_path.exists():
            system_prompt = system_prompt + "\n\n" + ac_path.read_text()

    # Composio MCP: use ClaudeAgentSDKProvider + tools.get() → SdkMcpTool list (not raw dicts).
    mcp_servers: dict[str, Any] = {"muffs_memory": _get_muffs_memory_mcp()}
    if session_id and _db_get_session_kind(session_id) == "automation_creator":
        mcp_servers["muffs_automation"] = _create_propose_routine_mcp(session_id)
    loaded_composio_toolkits: list[str] = []
    composio_key = os.getenv("COMPOSIO_API_KEY")
    if composio_key:
        try:
            from composio import Composio
            from composio_claude_agent_sdk import ClaudeAgentSDKProvider

            toolkit_raw = os.getenv("COMPOSIO_TOOLKITS", "").strip()
            if not toolkit_raw:
                toolkit_raw = read_preferences_json().get("composio_toolkits", "").strip()
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
        setting_sources=["project"],
        allowed_tools=["Skill"],
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
                auto_rotate_setting = os.getenv("MUFFS_AUTO_ROTATE_SESSION", "").strip()
                if not auto_rotate_setting:
                    auto_rotate_setting = read_preferences_json().get(
                        "auto_rotate_session", "true"
                    )
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
    run_row_id = await asyncio.to_thread(_db_insert_routine_run_row, routine_id)
    try:
        response_text, _sid = await run_agent(
            message="Execute your scheduled routine now.",
            system_prompt_override=routine["system_prompt"],
            send_via_sendblue=True,
        )
        excerpt = (response_text or "")[:4000]
        await asyncio.to_thread(_db_update_routine_run, routine_id, "success")
        await asyncio.to_thread(_db_finish_routine_run, run_row_id, "success", excerpt, None)
    except Exception as e:
        await asyncio.to_thread(_db_update_routine_run, routine_id, "error")
        await asyncio.to_thread(_db_finish_routine_run, run_row_id, "error", None, str(e))
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


class DisconnectIntegrationRequest(BaseModel):
    toolkit: str
    user_id: str = "default"


def _connected_accounts_index(composio: Any, user_id: str) -> dict[str, list[str]]:
    """Map lowercased toolkit slug -> connected account nanoids (ACTIVE only)."""
    from composio_client._types import omit

    slug_to_ids: dict[str, list[str]] = {}
    next_cursor: str | object = omit
    while True:
        kwargs: dict[str, Any] = {
            "user_ids": [user_id],
            "statuses": ["ACTIVE"],
            "limit": 100.0,
        }
        if next_cursor is not omit:
            kwargs["cursor"] = next_cursor
        resp = composio.connected_accounts.list(**kwargs)
        for item in resp.items:
            key = item.toolkit.slug.lower()
            slug_to_ids.setdefault(key, []).append(item.id)
        if not resp.next_cursor:
            break
        next_cursor = resp.next_cursor
    return slug_to_ids


def _fetch_integrations_catalog_sync(
    composio_key: str,
    user_id: str,
    search: str | None,
    cursor: str | None,
    limit: int,
) -> dict[str, Any]:
    from composio import Composio
    from composio_client._types import omit

    composio = Composio(api_key=composio_key)
    list_kwargs: dict[str, Any] = {
        "limit": float(limit),
        "sort_by": "usage",
    }
    if search and search.strip():
        list_kwargs["search"] = search.strip()
    else:
        list_kwargs["search"] = omit
    if cursor:
        list_kwargs["cursor"] = cursor
    else:
        list_kwargs["cursor"] = omit

    catalog = composio.client.toolkits.list(**list_kwargs)
    slug_to_ids = _connected_accounts_index(composio, user_id)

    items: list[dict[str, Any]] = []
    for it in catalog.items:
        slug_lc = it.slug.lower()
        meta = it.meta
        items.append(
            {
                "slug": it.slug,
                "name": it.name,
                "connected": slug_lc in slug_to_ids,
                "logo_url": meta.logo if meta else None,
                "description": meta.description if meta else None,
                "tools_count": int(meta.tools_count) if meta else None,
            }
        )

    return {
        "items": items,
        "next_cursor": catalog.next_cursor,
        "connected_slugs": sorted(slug_to_ids.keys()),
        "total_items": int(catalog.total_items),
    }


def _connected_slugs_only_sync(composio_key: str, user_id: str) -> list[str]:
    from composio import Composio

    composio = Composio(api_key=composio_key)
    return sorted(_connected_accounts_index(composio, user_id).keys())


def _disconnect_toolkit_sync(composio_key: str, user_id: str, toolkit: str) -> int:
    from composio import Composio
    from composio_client._types import omit

    composio = Composio(api_key=composio_key)
    target = toolkit.strip().lower()
    if not target:
        return 0
    deleted = 0
    next_cursor: str | object = omit
    while True:
        kwargs: dict[str, Any] = {
            "user_ids": [user_id],
            "statuses": ["ACTIVE"],
            "limit": 100.0,
        }
        if next_cursor is not omit:
            kwargs["cursor"] = next_cursor
        resp = composio.connected_accounts.list(**kwargs)
        for item in resp.items:
            if item.toolkit.slug.lower() == target:
                composio.connected_accounts.delete(item.id)
                deleted += 1
        if not resp.next_cursor:
            break
        next_cursor = resp.next_cursor
    return deleted


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
async def list_integrations(
    search: str | None = Query(None),
    cursor: str | None = Query(None),
    limit: int = Query(48, ge=1, le=50),
    user_id: str = Query("default"),
):
    composio_key = os.getenv("COMPOSIO_API_KEY")
    if not composio_key:
        return {"items": [], "next_cursor": None, "connected_slugs": [], "total_items": 0}
    try:
        return await asyncio.to_thread(
            _fetch_integrations_catalog_sync,
            composio_key,
            user_id,
            search,
            cursor,
            limit,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/integrations/connection-state")
async def integrations_connection_state(user_id: str = Query("default")):
    composio_key = os.getenv("COMPOSIO_API_KEY")
    if not composio_key:
        return {"connected_slugs": []}
    try:
        slugs = await asyncio.to_thread(_connected_slugs_only_sync, composio_key, user_id)
        return {"connected_slugs": slugs}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/integrations/disconnect")
async def disconnect_integration(req: DisconnectIntegrationRequest):
    composio_key = os.getenv("COMPOSIO_API_KEY")
    if not composio_key:
        raise HTTPException(status_code=400, detail="COMPOSIO_API_KEY not configured")
    try:
        n = await asyncio.to_thread(
            _disconnect_toolkit_sync,
            composio_key,
            req.user_id,
            req.toolkit,
        )
        return {"ok": True, "removed": n}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("agentMuffs.agent:app", host="0.0.0.0", port=8000, reload=True)

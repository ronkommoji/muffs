# Muffs — AI Agent: Product Requirements & Build Prompt

> **Named after my cat. Built for my life.**
> Muffs is a personal AI agent built on the Claude Agent SDK. Open-source, self-hostable, and designed to feel like a real companion — not a generic assistant.

---

## Before Writing Any Code

Thoroughly read and research the following before touching a single file:

1. **Claude Agent SDK — Observability**: `https://code.claude.com/docs/en/agent-sdk/observability`
  - Propose the best architecture for surfacing agent actions in the dashboard before implementing
2. **Claude Agent SDK — Sessions**: `https://code.claude.com/docs/en/agent-sdk/sessions`
  - Understand context window limits and session lifecycle before implementing session management
3. **Composio documentation** — Read the full Composio docs to understand how MCP tool connectivity, OAuth flows, and tool discovery work
4. **Sendblue API docs** — Understand webhook payload structure, authentication, and message sending before building the SMS bridge
5. **shadcn/ui** — Review available components before designing the dashboard

---

## Project Structure

The project must follow this exact directory structure. It mirrors the pattern shown for `research-agent` with a clean `.claude` directory scaffold so future commands, subagents, and skills can be dropped in without restructuring.

```
muffs/
├── .claude/
│   ├── commands/               # Slash commands live here (one file per command)
│   │   ├── new.md              # /new — start a new session
│   │   └── setup.md            # /setup — first-run onboarding
│   ├── skills/                 # Reusable skill definitions for subagents
│   └── subagents/              # Future subagent definitions (calendar, gmail, etc.)
├── agent/
│   ├── prompts/
│   │   ├── muffs_base.txt      # Muffs' core identity and personality
│   │   ├── routine_generator.txt  # Prompt used to generate routine system prompts
│   │   └── setup.txt           # /setup onboarding prompt
│   ├── memory/
│   │   └── memory.md           # Muffs' persistent memory file (auto-updated by agent)
│   ├── tools/                  # Custom tool definitions
│   └── agent.py                # Main agent entrypoint
├── dashboard/                  # Next.js web dashboard
│   ├── app/
│   │   ├── (pages)/
│   │   │   ├── overview/       # Metrics + observability
│   │   │   ├── integrations/   # Composio MCP connectors
│   │   │   ├── routines/       # Schedule and manage routines
│   │   │   ├── chat/           # Synced chat interface
│   │   │   └── settings/       # Memory, Sendblue config, personality editor
│   │   └── api/
│   │       ├── webhook/        # Sendblue inbound webhook handler
│   │       ├── agent/          # Agent run endpoints
│   │       └── routines/       # Routine CRUD and scheduling
│   └── components/
├── db/
│   └── schema.sql              # SQLite schema
├── .env.example
├── .gitignore
├── fly.toml                    # Fly.io deployment config
├── pyproject.toml
└── README.md
```

---

## Tech Stack


| Layer               | Choice                                 | Notes                                              |
| ------------------- | -------------------------------------- | -------------------------------------------------- |
| Agent SDK           | Claude Agent SDK                       | Python                                             |
| Frontend            | Next.js + shadcn/ui                    | Use the super-admin dashboard template as the base |
| Database            | SQLite                                 | Local-first; works on Fly.io with a mounted volume |
| MCP Connectivity    | Composio                               | Manages all OAuth and tool discovery               |
| SMS/iMessage Bridge | Sendblue API                           | Primary user communication channel                 |
| Realtime UI updates | Server-Sent Events (SSE) or polling    | See Dashboard Refresh section                      |
| Job Scheduling      | `node-cron` (or APScheduler in Python) | For firing routines on schedule                    |


---

## Muffs' Identity & Personality

Muffs has a real soul. She is not a generic assistant.

### Default Character

- **Name**: Muffs
- **Personality**: Calm, clever, and slightly dry-humored. Like a cat — she operates on her own terms but is deeply loyal. She protects her user's time fiercely and does not waste words.
- **Voice**: Concise and confident. She doesn't over-explain. She occasionally makes a dry observation but never at the expense of getting something done. She is warm but never saccharine.
- **Tone examples**:
  - ✅ "Done. Your 9am was moved and your inbox is clear."
  - ✅ "You have three things that actually matter today. Want the rest?"
  - ❌ "Great question! I'd be happy to help you with that! Let me look into it right away!"

### Base System Prompt Location

Embed Muffs' personality in `agent/prompts/muffs_base.txt`. This file is read at the start of every session. It should include her identity, voice, and the user's persistent memory (injected at runtime).

### User-Editable Personality

The user can customize Muffs' personality and voice from the **Settings page** in the dashboard. This does not override her core identity — it layers on top. The editable fields are:

- **Personality notes**: Free-text field. e.g., "Be a bit more casual with me in the mornings."
- **Response style**: Toggle options — `Concise` / `Balanced` / `Detailed`
- **Tone adjustments**: Free-text. e.g., "You can use light humor but keep it dry."
- **Off-limits topics**: Things Muffs should never bring up unprompted

These settings are stored in the database and injected into the base system prompt at runtime, after the core identity block. The Settings page shows a live preview of the combined personality prompt so the user can see exactly what Muffs is reading.

---

## Dashboard — Pages & Features

Use the shadcn/ui super-admin dashboard template as the structural foundation. All pages share a left sidebar nav.

---

### Dashboard Refresh Strategy

The dashboard should feel alive without requiring a manual refresh. Use the following approach:

- **Observability logs / agent activity**: Use **Server-Sent Events (SSE)**. The backend streams new log events to the dashboard in real time as the agent runs. No polling needed for live agent sessions.
- **Metrics (cost, token usage, run count)**: Refresh every **30 seconds** via lightweight polling. These don't need to be live — 30s lag is acceptable.
- **Chat messages**: Poll every **3 seconds** when the chat page is active. This handles Sendblue inbound messages appearing without a manual refresh. If SSE is already implemented, consider extending it to cover chat as well.
- **Routine status (last run, next run)**: Refresh every **60 seconds** on the Routines page.
- **User control**: Add a small "Last updated X seconds ago" indicator with a manual refresh button on each page for power users who want it.

Implement SSE as the primary realtime mechanism and fall back to polling only for lower-priority data.

---

### 1. Overview / Metrics Page

Before implementing this page, read the Claude Agent SDK observability docs and document your chosen approach in a comment block at the top of the relevant API route.

**Metrics panel:**

- Total agent runs (all time and last 7 days)
- Estimated cost (based on token usage × model pricing)
- Token usage (input / output breakdown)
- Active session count

**Observability / Activity Feed:**

- Live feed of agent actions: tool calls, tool results, model reasoning steps, errors
- Each entry shows: timestamp, action type, tool name (if applicable), brief description, status (success / error)
- Filter by: all / tool calls only / errors only
- Streamed via SSE when the agent is actively running; shows historical log when idle
- Propose and implement the best data model for storing these events (suggest: an `agent_events` table in SQLite with event type, payload JSON, session ID, and timestamp)

---

### 2. Integrations Page (Composio MCP Connectors)

Read Composio documentation thoroughly before implementing this page.

**Layout:**

- Search bar at top to filter the full list of Composio integrations
- Card grid showing all available integrations with logo, name, and category
- Each card has a "Connect" button that initiates the Composio OAuth/auth flow in a modal or new tab
- A "Connected" section at the top shows active integrations with:
  - Connection status indicator (green / yellow / red)
  - Last synced timestamp
  - "Disconnect" and "Reconnect" actions
  - List of tools/actions available from that integration

**Behavior:**

- Muffs' available tools at runtime are dynamically sourced from whatever the user has connected here
- Composio handles all auth — the dashboard just needs to initiate and confirm the flow
- Store connected integration metadata in SQLite for display purposes

---

### 3. Routines Page

A routine is a scheduled, agent-run task with a user-approved system prompt.

**Creating a routine (step-by-step flow in the UI):**

1. **Step 1 — Schedule**: User sets when the routine runs. Input: time (e.g., 8:00 AM), timezone, recurrence (daily / weekdays / specific days / custom cron)
2. **Step 2 — Intent**: User writes a brief natural language description of what they want. e.g., "Check my inbox, summarize unread emails, and add my top 3 priorities to today's calendar."
3. **Step 3 — Prompt generation**: Muffs generates a full system prompt for the routine using `agent/prompts/routine_generator.txt`. This prompt is shown in the UI in a code/text editor block.
4. **Step 4 — Review & approve**: User reads the generated prompt, edits it inline if needed, then clicks "Approve & Schedule."
5. **Step 5 — Confirmation**: Routine is saved and appears in the routines list.

**Routines list:**

- Table or card list showing all saved routines
- Columns: Name/description, schedule, status toggle (on/off), last run time + status, next run time
- Clicking a routine opens a detail view where the user can edit the prompt, schedule, or delete it
- Toggle switch to enable/disable each routine without deleting it

**Scheduling backend:**

- Use `node-cron` (if Next.js) or `APScheduler` (if Python) to manage routine execution
- Store routine definitions, schedules, and run history in SQLite

---

### 4. Chat Page

The chat page mirrors the conversation the user has with Muffs via iMessage. It is a secondary interface — iMessage is primary.

**Layout:**

- Left sidebar: list of sessions, sorted by most recent. Each session shows a timestamp and a brief preview of the first or last message.
- Right panel: active conversation thread. Messages are displayed as a chat UI (user on right, Muffs on left).
- New session button at the top of the sidebar (equivalent to `/new`)

**Sync architecture:**

- Inbound Sendblue message → hits `/api/webhook/sendblue` → stored in `messages` table in SQLite → reflected in chat UI via 3-second poll or SSE
- Outbound message from dashboard → stored in `messages` table → sent via Sendblue API → delivered to user's iPhone
- Both directions write to the same `messages` table, keyed by session ID
- Messages have a `source` field: `dashboard` or `sendblue` — displayed identically in the UI but tracked for debugging

**Session handling in chat:**

- Each session in the sidebar corresponds to a Claude Agent SDK session
- When a session is selected, the full message history for that session is loaded
- The active session shows the live conversation

---

### 5. Settings Page

The settings page has the following sections, organized as tabs or clearly separated panels:

#### a) Personality Editor

The user can customize how Muffs speaks and behaves. Fields:

- **Personality notes** (textarea): Free-form additional personality context
- **Response style** (segmented control): `Concise` / `Balanced` / `Detailed`
- **Tone adjustments** (textarea): Fine-tuning instructions for tone
- **Off-limits topics** (textarea): Topics Muffs should never raise unprompted

Below the form, show a **live preview panel** labeled "What Muffs is reading" — a read-only text block showing the full merged personality prompt (base identity + user customizations). This refreshes live as the user edits the fields above.

#### b) Persistent Memory

The memory file has two sections, both visible and editable here:

**User-defined facts** (editable):

- Name, timezone, and any constant facts the user wants Muffs to always know
- Rendered as an editable form or structured text block
- Managed via `/setup` command initially; editable here afterward

**Agent-maintained memory** (viewable, optionally editable):

- Notes Muffs has written to herself over time (inferred preferences, recurring patterns, useful context)
- Rendered as a read-only text block with an "Edit" toggle for power users who want to correct or remove entries
- Shows the raw content of `agent/memory/memory.md`

#### c) Session Management

- Explanation of how sessions work (brief, friendly copy — not technical jargon)
- Setting: "Auto-rotate session when context window is near limit" — toggle (default: on)
- When toggled on, Muffs automatically starts a new session when within ~10% of the context window limit, with no interruption to the user
- Also callable via `/new` slash command
- Show current session ID and approximate token usage

#### d) Sendblue Configuration

**Credential fields:**

- API Key (masked input)
- "From" phone number (the Sendblue number Muffs sends from)
- "To" phone number (the user's iPhone number)
- Any additional required Sendblue fields

**Webhook setup guide** — displayed inline in the UI, no external doc link needed:

> **Step 1**: Copy your webhook URL below.
> `[your-domain]/api/webhook/sendblue` ← auto-populated
>
> **Step 2**: Go to your Sendblue dashboard → Settings → Webhooks
>
> **Step 3**: Paste the URL into the "Inbound Message Webhook" field and save.
>
> **Step 4**: Click "Test Connection" below to verify everything is working.

- "Test Connection" button that sends a test message and confirms receipt
- Connection status indicator: Connected / Not connected / Error

---

## Slash Commands

Slash commands live in `.claude/commands/`. Each command is a markdown file defining the command's behavior. They are invocable from both the dashboard chat and via Sendblue SMS.

### `/new` — New Session

**File**: `.claude/commands/new.md`

**Behavior:**

- Closes the current session gracefully (saves context summary if possible)
- Opens a new Claude Agent SDK session
- Muffs acknowledges: "Starting fresh. What do you need?"
- In the dashboard, the new session appears in the chat sidebar immediately

**Auto-trigger:**

- Also triggered automatically when the context window approaches its limit (within ~10% of max tokens), if the auto-rotate setting is enabled in Settings

### `/setup` — First-Run Onboarding

**File**: `.claude/commands/setup.md`

**Behavior:**

- Triggered manually by the user on first launch, or via the "Run Setup" button in Settings
- Muffs guides the user through a short onboarding conversation to collect:
  - Name
  - Timezone
  - Preferred communication style (feeds into personality layer)
  - Any standing context they want Muffs to always know
- Results are written to the `user_facts` section of `agent/memory/memory.md` and stored in SQLite
- Muffs confirms what she's saved and offers to adjust anything

---

## Memory & Self-Improvement Layer

Keep this simple for Phase 1. A single markdown file is the source of truth.

**File**: `agent/memory/memory.md`

**Structure:**

```markdown
# Muffs Memory

## User Facts
<!-- Set by /setup or edited in Settings. Muffs reads but does not overwrite this section. -->
- Name: [name]
- Timezone: [timezone]
- [Any other user-defined constants]

## Agent Notes
<!-- Muffs writes to this section automatically during and after sessions. -->
<!-- She adds inferred preferences, recurring patterns, and useful context she has learned. -->
- [Muffs' auto-generated notes]
```

**Runtime behavior:**

- Muffs reads the entire file at the start of every session
- During a session, Muffs can append to or update the `Agent Notes` section
- The Settings page shows both sections and allows editing
- The file is committed to the repo (with a `.gitkeep` or example file) so self-hosters have a clean starting point

---

## Sendblue / iMessage Integration

This is the **primary communication channel**. Design everything around this being the main interface, with the dashboard as a secondary mirror.

**Inbound flow:**

1. User sends iMessage from iPhone
2. Sendblue receives the message and fires a POST to `/api/webhook/sendblue`
3. Webhook handler validates the request, extracts the message body, and writes it to the `messages` table in SQLite
4. The agent processes the message and generates a response
5. Response is written to `messages` table and sent back via the Sendblue API
6. Dashboard chat reflects the full conversation via poll or SSE

**Outbound flow (from dashboard):**

1. User types in the dashboard chat and hits send
2. Message is written to `messages` table with `source: dashboard`
3. Message is sent via Sendblue API to the user's iPhone (so the iMessage thread stays in sync)
4. Agent processes the message and responds via both dashboard and iMessage

**Key constraint:** Every message — regardless of source — goes through the same processing pipeline and is stored in SQLite. The Sendblue thread and the dashboard chat are always in sync.

---

## Database Schema (SQLite)

```sql
-- Sessions
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  token_count INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active'  -- active | closed
);

-- Messages
CREATE TABLE messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT REFERENCES sessions(id),
  role TEXT NOT NULL,              -- user | assistant
  content TEXT NOT NULL,
  source TEXT DEFAULT 'dashboard', -- dashboard | sendblue
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Agent Events (observability)
CREATE TABLE agent_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT REFERENCES sessions(id),
  event_type TEXT NOT NULL,        -- tool_call | tool_result | reasoning | error
  tool_name TEXT,
  payload TEXT,                    -- JSON blob
  status TEXT,                     -- success | error
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Routines
CREATE TABLE routines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  schedule_cron TEXT NOT NULL,     -- cron expression
  timezone TEXT DEFAULT 'UTC',
  system_prompt TEXT NOT NULL,     -- the approved prompt for this routine
  enabled INTEGER DEFAULT 1,       -- 0 | 1
  last_run_at DATETIME,
  last_run_status TEXT,            -- success | error | null
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Settings
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
-- Keys used: sendblue_api_key, sendblue_from, sendblue_to,
--            personality_notes, response_style, tone_adjustments, off_limits_topics

-- Connected Integrations (Composio)
CREATE TABLE integrations (
  id TEXT PRIMARY KEY,             -- Composio integration ID
  name TEXT NOT NULL,
  status TEXT DEFAULT 'connected', -- connected | error | disconnected
  connected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  metadata TEXT                    -- JSON blob (available tools, etc.)
);
```

---

## Open Source & Self-Hosting

The repo is public on GitHub. New users should be able to clone it, run `/setup`, and be operational within 15 minutes.

`**README.md` must include:**

- Prerequisites (Python version, Node version, API keys needed)
- Step-by-step local setup instructions
- Environment variable reference (`.env.example` is the source of truth)
- Fly.io deployment guide (include `fly.toml` in the repo)
- A note directing first-time users to run `/setup` after launching

`**.env.example`** should include all required keys with placeholder values and comments explaining each one.

---

## Key Architectural Decisions to Make Early

Before scaffolding, resolve these explicitly:

1. **SSE vs WebSocket for realtime**: SSE is simpler for this use case (unidirectional: server → client). Use SSE for observability logs and optionally extend to chat messages.
2. **Routine scheduler placement**: If the dashboard is Next.js, use a long-running Node process or a separate Python worker for cron jobs — Next.js serverless functions cannot maintain persistent timers. A simple Python APScheduler process running alongside the Next.js app is likely the cleanest solution for self-hosting.
3. **Session auto-rotation**: Read the Claude Agent SDK sessions docs to understand how context window limits are surfaced by the SDK. Do not assume you can detect token count client-side — the SDK may expose this directly.
4. **Composio tool discovery at runtime**: Understand exactly how Composio-connected tools are passed to the Claude Agent SDK at runtime. This determines how the integrations page data flows into the agent.
5. **Memory file write strategy**: Decide whether Muffs writes to `memory.md` during the session (streaming partial updates) or at session close (single atomic write). Atomic write at close is simpler and safer for Phase 1.


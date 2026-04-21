# Muffs

> Named after my cat. Built for a life.

Muffs is a personal AI agent built on the Claude Agent SDK. She manages your calendar, inbox, and daily tasks via iMessage — with a companion dashboard for observability and control.

**Primary interface**: iMessage (Sendblue)  
**Secondary interface**: Web dashboard (Next.js)

---

## How this repo relates to “agent stacks” (Claude SDK, Nanobot, Hermes)

Understanding these patterns helps when you fork or extend Muffs.

**Claude Agent SDK (Anthropic)** — The Python API centers on `ClaudeSDKClient` for ongoing sessions (resume, tool use, streaming) and optional `query()` for one-shot runs. Tooling layers on **MCP**: you register in-process or external MCP servers; Composio exposes connected SaaS accounts as MCP tools for the model. See the [Python SDK reference](https://docs.anthropic.com/en/docs/claude-code/sdk/sdk-python/).

**Nanobot-style agents (e.g. HKUDS/nanobot)** — Typical layout: a small runtime process, **Markdown or SQLite memory**, **MCP** for Gmail/Calendar/etc., and **channel bridges** (webhooks, SMS, WebSocket) that forward user messages into the agent loop. Muffs matches that shape: FastAPI worker + `memory.md` / `soul.md` + Composio MCP + Sendblue webhook.

**Hermes (NousResearch/hermes-agent)** — Another MCP-forward framework: MCP servers are configured declaratively, tools are namespaced, and the same ideas (stdio vs HTTP MCP, tool filtering) apply. Muffs is narrower: one opinionated product (personal assistant + Sendblue + SQLite dashboard), not a general multi-interface framework.

**This repository’s contract** — Anyone can clone, fill `.env`, run the **onboarding wizard** at `/onboarding`, start **`muffs-agent`**, use the dashboard for Composio OAuth + observability, and optionally deploy to a VPS with a public HTTPS URL for Sendblue.

---

## Prerequisites

- Python 3.11+
- Node.js 20+
- API keys:
  - [Anthropic API key](https://console.anthropic.com) (Claude Agent SDK)
  - [Composio API key](https://composio.dev) (tool integrations)
  - [Sendblue account](https://sendblue.com) (iMessage bridge)

---

## One-line install (curl + `muffs onboard`)

Comparable to tools that ship **`curl … \| bash`** and a single **`onboard`** step:

```bash
export MUFFS_REPO=https://github.com/yourusername/muffs.git
curl -fsSL https://raw.githubusercontent.com/yourusername/muffs/main/scripts/install.sh | bash
```

- Clones to **`~/.local/share/muffs`** (override with **`MUFFS_HOME`**).
- Creates **`.venv`**, runs **`pip install -e .`** and **`npm install`** in **`dashboard/`**.
- Writes **`~/.config/muffs/env`** (`MUFFS_HOME=…`) and symlinks **`muffs`**, **`muffs-agent`**, and **`muffs-setup`** into **`~/.local/bin`**.
- Add **`~/.local/bin`** to your **`PATH`**, then copy **`.env`**, init the **DB** (see below), and run **`muffs onboard`**.

From a **local clone**, you can run **`bash scripts/install.sh`** instead — it defaults **`MUFFS_HOME`** to that repo.

| Command | Purpose |
|--------|---------|
| `muffs setup` | Install deps (same as **`muffs-setup`**) |
| `muffs start` | Run the stack (same as **`muffs-agent`**, ports 8141 / 3141) |
| `muffs onboard` | Opens **`/onboarding`**; starts the stack in the background if nothing is listening |
| `muffs onboard --install-daemon` | Onboarding + install **launchd** (macOS) or **systemd --user** (Linux) |
| `muffs daemon install` / `uninstall` / `status` | Manage the background **`muffs-agent`** service |

---

## Local Setup

```bash
# 1. Clone the repo
git clone https://github.com/yourusername/muffs.git
cd muffs

# 2. Virtualenv (recommended)
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate

# 3. Install dependencies once (Python editable install + dashboard npm)
python -m pip install -e .
muffs-setup
# Alternative: `make install` (same result, if you have Make)

# 4. Environment variables
cp .env.example .env
# Edit .env — defaults assume muffs-agent ports (8141 / 3141)

# 5. Initialize the database
python -c "
import sqlite3, pathlib
conn = sqlite3.connect('muffs.db')
conn.executescript(pathlib.Path('db/schema.sql').read_text())
conn.close()
print('Database ready.')
"

# 6. Start dashboard + Python agent together (one terminal)
muffs start
# (same as muffs-agent)
```

`muffs start` / **`muffs-agent`** starts **FastAPI on port 8141** and the **Next.js dev server on port 3141** by default (uncommon ports to reduce clashes with other tools). Open the printed URL or:

- Dashboard: [http://localhost:3141](http://localhost:3141)  
- Agent API: [http://127.0.0.1:8141](http://127.0.0.1:8141)

Optional flags: `muffs-agent --agent-only` (Python only), `muffs-agent --dashboard-only` (Next only). Override ports with **`MUFFS_AGENT_PORT`** / **`MUFFS_DASHBOARD_PORT`** or `--agent-port` / `--dashboard-port`. Development auto-reload for the agent only: `MUFFS_RELOAD=true muffs-agent --agent-only` (when running both processes, reload is not passed to avoid odd subprocess behavior—you can still restart manually).

### First-time onboarding (UI)

Open [http://localhost:3141/onboarding](http://localhost:3141/onboarding) after the dashboard is up. The wizard (shadcn UI) walks through prerequisites, your name, the **agent display name**, timezone, **Composio CLI** steps (`@composio/cli`, `composio login`, `composio link …`), optional Sendblue webhook URL, and writes:

- **Workspace** on your machine (default **`~/muffs-workspace/`** on **macOS** — next to `claude-workspace`; **`~/.local/share/muffs/`** on **Linux**; override with **`MUFFS_WORKSPACE`**):
  - **`workspace/memory/memory.md`** — **User Facts** / **Agent Notes**
  - **`workspace/memory/soul.md`** — short identity snippet
  - **`workspace/user/preferences.json`** — mirror of non-secret dashboard settings (SQLite stays the runtime source of truth)
  - **`workspace/projects/`** — your per-project files and notes
  - **`db/muffs.db`** — SQLite (see below)
- SQLite **`settings`** rows — `agent_display_name`, optional `composio_toolkits`, etc.; secrets like Sendblue may live only in DB/env.

If you already have a configured `memory.md` with a **Name:** line, you are treated as onboarded and can skip the wizard.

### Sendblue webhook (local development)

Sendblue’s servers must **POST to a public HTTPS URL**. They cannot reach `http://localhost:3141`, so for **inbound iMessage** while developing on your laptop you need a **tunnel** (or deploy the app to a public URL).

1. Start the stack (`muffs-agent` — dashboard on port **3141** by default).
2. Run a tunnel that forwards to that port, for example:
  - [ngrok](https://ngrok.com): `ngrok http 3141`
  - [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/) or similar
3. In the Sendblue dashboard → Settings → Webhooks, set the inbound webhook to:
  - `https://<your-tunnel-host>/api/webhook/sendblue`  
   (use the **https** URL the tunnel gives you, plus that path).
4. Optional: set `NEXT_PUBLIC_APP_URL` in `.env` to the same tunnel base URL so the Settings page shows the correct webhook for copy-paste.

You **do not** need a tunnel once the app is deployed to a public host (e.g. Fly.io); use your real dashboard URL there instead.

---

## First Run

After starting both processes, send `/setup` to Muffs via:

- iMessage (configure Sendblue webhook first — see Settings page)
- Or the dashboard Chat page

Muffs will guide you through a short onboarding to collect your name, timezone, and preferences.

---

## Environment Variables


| Variable                  | Description                                              |
| ------------------------- | -------------------------------------------------------- |
| `ANTHROPIC_API_KEY`       | Claude API key for the Agent SDK                         |
| `COMPOSIO_API_KEY`        | Composio key for tool integrations                       |
| `COMPOSIO_TOOLKITS`       | Comma-separated toolkit slugs mounted as MCP tools (e.g. `gmail,googlecalendar`) — align with Integrations you use; restart after changes |
| `SENDBLUE_API_KEY_ID`     | Sendblue API key ID                                      |
| `SENDBLUE_API_SECRET_KEY` | Sendblue API secret                                      |
| `SENDBLUE_FROM_NUMBER`    | Your Sendblue number (E.164 format)                      |
| `SENDBLUE_TO_NUMBER`      | Your iPhone number (E.164 format)                        |
| `MUFFS_WORKSPACE`         | Data directory (default **`~/muffs-workspace`** on Mac, **`~/.local/share/muffs`** on Linux); contains `db/`, `workspace/` |
| `DB_PATH`                 | SQLite file (default: `$MUFFS_WORKSPACE/db/muffs.db`)   |
| `PYTHON_AGENT_URL`        | Base URL the Next.js server uses to call FastAPI (default: `http://127.0.0.1:8141` with `muffs-agent`) |
| `NEXT_PUBLIC_APP_URL`     | Public dashboard origin (webhooks; default `http://localhost:3141` locally) |
| `MEMORY_PATH` / `SOUL_PATH` | Optional overrides; defaults under `$MUFFS_WORKSPACE/workspace/memory/` |
| `MUFFS_AGENT_PORT` / `MUFFS_DASHBOARD_PORT` | Defaults **8141** / **3141** for `muffs-agent` |
| `MUFFS_HOST` | Bind address for the Python agent with `muffs-agent --agent-only` (default `0.0.0.0`) |
| `MUFFS_RELOAD` | `true` / `1` to enable uvicorn `--reload` when using `muffs-agent --agent-only` |

If you previously used **`~/.local/share/muffs`** (older default), either set **`MUFFS_WORKSPACE`** to that path or move the folder contents into **`~/muffs-workspace`**.

**SQLite (`muffs.db`)** holds operational data: chat **sessions**, **messages**, **agent_events**, **routines**, **integrations** cache, and **settings** (including secrets). **Filesystem** under **`workspace/`** holds durable **markdown memory**, **preferences.json** (non-secret mirror), and your **`projects/`** tree—back both up if you care about recovery.

### Composio: your connections vs. what Muffs loads

Composio stores OAuth connections per **project** (`COMPOSIO_API_KEY`) and **user id** (Muffs uses `user_id="default"` for the dashboard and agent). [Composio’s tool APIs](https://docs.composio.dev) scope tools to that user and filter by **which toolkits you request** (`tools.get(..., toolkits=[...])`).

- **Same Composio project + same user id elsewhere** (e.g. Claude Code with Composio MCP using the same API key and `default`): you **reuse the same connected accounts** (Gmail, Calendar, etc.) for execution. That is one Composio identity, not a separate copy per app.
- **What this Muffs process exposes to the model** is only the toolkits listed in **`COMPOSIO_TOOLKITS`**. The dashboard “Integrations” page handles OAuth; the agent must still list matching slugs in that env var and be restarted, or those tools are not mounted.
- **Claude on the web / Anthropic app** (“connect Slack”, etc.) uses **Anthropic’s own connectors**, not your Composio project, unless you explicitly integrated Composio there. So “Claude in general has tools” does **not** mean Muffs automatically has the same tools — different systems.

---

## Deploy on a VPS (Sendblue production)

For iMessage in production, Sendblue must reach a **public HTTPS** URL (no tunnel). Typical flow:

1. Deploy this repo (or the provided `Dockerfile` / Fly process split) so port **3000** serves the Next.js app and **8000** runs the Python agent, with `DB_PATH` / `MEMORY_PATH` / `SOUL_PATH` on persistent disk if you use SQLite files on disk.
2. Set `NEXT_PUBLIC_APP_URL` to the dashboard’s public origin (e.g. `https://your-domain.com`).
3. In Sendblue → Webhooks, set the inbound URL to `https://your-domain.com/api/webhook/sendblue` (copy also appears under **Settings → Sendblue**).
4. Fill Sendblue credentials in the dashboard or `.env` on the server.

Local development still uses a tunnel (ngrok, Cloudflare Tunnel, etc.) as described above.

---

## Fly.io Deployment

```bash
# Install Fly CLI
brew install flyctl

# Authenticate
flyctl auth login

# Create app and volume
flyctl apps create muffs
flyctl volumes create muffs_data --region iad --size 1

# Set secrets
flyctl secrets set \
  ANTHROPIC_API_KEY=your_key \
  COMPOSIO_API_KEY=your_key \
  COMPOSIO_TOOLKITS=gmail,googlecalendar \
  SENDBLUE_API_KEY_ID=your_key \
  SENDBLUE_API_SECRET_KEY=your_secret \
  SENDBLUE_FROM_NUMBER=+15551234567 \
  SENDBLUE_TO_NUMBER=+15559876543

# Deploy
flyctl deploy
```

---

## Slash Commands (Muffs product — not the IDE)

Users text these to **Muffs** over iMessage or the dashboard chat. Implementation lives in `agentMuffs/` (see `agentMuffs/docs/muffs-slash-and-memory.md`). This is separate from Cursor / Claude Code commands.

| Command  | Description                                                    |
| -------- | -------------------------------------------------------------- |
| `/setup` | First-time onboarding — collects name, timezone, preferences   |
| `/new`   | Start a fresh session (also auto-triggered near context limit) |


---

## Architecture

```
iPhone → Sendblue → Next.js webhook → SQLite ← Python agent (FastAPI)
                                             ↓
                                     Claude Agent SDK
                                             ↓
                                     Composio MCP tools
                                             ↓
                                     Sendblue (send reply)
```

The Python agent and Next.js dashboard share a single SQLite database. The agent writes events and responses; the dashboard reads them for display and SSE streaming.
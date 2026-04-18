# Muffs

> Named after a cat. Built for a life.

Muffs is a personal AI agent built on the Claude Agent SDK. She manages your calendar, inbox, and daily tasks via iMessage — with a companion dashboard for observability and control.

**Primary interface**: iMessage (Sendblue)  
**Secondary interface**: Web dashboard (Next.js)

---

## Prerequisites

- Python 3.11+
- Node.js 20+
- API keys:
  - [Anthropic API key](https://console.anthropic.com) (Claude Agent SDK)
  - [Composio API key](https://composio.dev) (tool integrations)
  - [Sendblue account](https://sendblue.com) (iMessage bridge)

---

## Local Setup

```bash
# 1. Clone the repo
git clone https://github.com/yourusername/muffs.git
cd muffs

# 2. Copy and fill in environment variables
cp .env.example .env
# Edit .env with your API keys

# 3. Install Python dependencies
python -m venv .venv
source .venv/bin/activate
pip install -e .

# 4. Install dashboard dependencies
cd dashboard
npm install
cd ..

# 5. Initialize the database
python -c "
import sqlite3, pathlib
conn = sqlite3.connect('muffs.db')
conn.executescript(pathlib.Path('db/schema.sql').read_text())
conn.close()
print('Database ready.')
"

# 6. Start both processes (two terminals)

# Terminal 1 — Python agent
python agent/agent.py

# Terminal 2 — Next.js dashboard
cd dashboard && npm run dev
```

Dashboard: http://localhost:3000  
Agent API: http://localhost:8000

---

## First Run

After starting both processes, send `/setup` to Muffs via:
- iMessage (configure Sendblue webhook first — see Settings page)
- Or the dashboard Chat page

Muffs will guide you through a short onboarding to collect your name, timezone, and preferences.

---

## Environment Variables

| Variable | Description |
|---|---|
| `ANTHROPIC_API_KEY` | Claude API key for the Agent SDK |
| `COMPOSIO_API_KEY` | Composio key for tool integrations |
| `SENDBLUE_API_KEY_ID` | Sendblue API key ID |
| `SENDBLUE_API_SECRET_KEY` | Sendblue API secret |
| `SENDBLUE_FROM_NUMBER` | Your Sendblue number (E.164 format) |
| `SENDBLUE_TO_NUMBER` | Your iPhone number (E.164 format) |
| `DB_PATH` | Path to SQLite database file (default: `./muffs.db`) |
| `PYTHON_AGENT_URL` | Python agent base URL (default: `http://localhost:8000`) |
| `NEXT_PUBLIC_APP_URL` | Dashboard public URL (for webhook auto-population) |

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
  SENDBLUE_API_KEY_ID=your_key \
  SENDBLUE_API_SECRET_KEY=your_secret \
  SENDBLUE_FROM_NUMBER=+15551234567 \
  SENDBLUE_TO_NUMBER=+15559876543

# Deploy
flyctl deploy
```

---

## Slash Commands

| Command | Description |
|---|---|
| `/setup` | First-time onboarding — collects name, timezone, preferences |
| `/new` | Start a fresh session (also auto-triggered near context limit) |

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

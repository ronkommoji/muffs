# Muffs: slash commands and memory (product agent)

This repository builds **Muffs**, a **personal agent** (iMessage + dashboard). The instructions here describe what **Muffs** does when users text commands—**not** what Cursor, Claude Code, or other coding assistants do.

- **Runtime**: Python worker in `agentMuffs/agent.py` (Claude Agent SDK), plus prompts under `agentMuffs/prompts/`.
- **Long-term memory**: default path **`~/.local/share/muffs/workspace/memory/memory.md`** (or `MEMORY_PATH` / `MUFFS_WORKSPACE`). Includes User Facts and Agent Notes. The agent appends Agent Notes via the `append_agent_memory` MCP tool (see `agentMuffs/agent.py`).
- **Optional identity blurb**: **`workspace/memory/soul.md`** (or `SOUL_PATH`) — short markdown injected as “Soul (identity).” The dashboard onboarding wizard can create this when you pick an agent name.

---

## `/setup` (first-time onboarding)

Humans can complete a first-time **dashboard wizard** at `/onboarding` (writes `memory.md`, `soul.md`, and settings). Independently, use the prompt in `agentMuffs/prompts/setup.txt` when implementing or testing chat-based onboarding. The agent should:

1. Guide a short conversation to collect:
  - Name (how they want to be addressed)
  - Timezone
  - Communication style preference
  - Any standing context (recurring commitments, preferences, things to never bring up)
2. After confirming with the user, write results to the **User Facts** section of the memory file. Do not overwrite **Agent Notes**—only update User Facts.

Suggested User Facts format:

```
## User Facts
- Name: [name]
- Timezone: [timezone]
- Communication style: [style]
- [Any other facts]
```

End with something like: “All set. Text me any time.”

---

## `/new` (fresh session)

1. If there is an active session, summarize important ongoing context into **Agent Notes** in the memory file—concise, one to three bullet points max.
2. Close the current session in the DB gracefully.
3. Start a new session so the next turn begins fresh.
4. Reply with something like: “Starting fresh. What do you need?”

If this was triggered automatically because the context window was nearly full, add a short note that a new session was started for that reason.

---

## Coding agents (Cursor / Claude Code)

Files under `.claude/` in the repo root are for **developers editing this codebase**. They do **not** define Muffs’ product behavior. The product is defined by `agentMuffs/`, the database, and deploy config.
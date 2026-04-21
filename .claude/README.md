# `.claude/` in this repo

**This folder is for tools that help you build Muffs** (Cursor, Claude Code, local MCP allowlists, etc.). The **product** agent still lives in `agentMuffs/` at runtime; this tree is for **developers** using Claude Code in this repository.

| What | Where it actually lives |
|------|-------------------------|
| Muffs prompts, memory, SDK agent | `agentMuffs/` |
| Spec for product `/setup` and `/new` | `agentMuffs/docs/muffs-slash-and-memory.md` |
| **Claude Code slash commands** (invoke as `/setup`, `/new` in the IDE) | `.claude/commands/*.md` — [Claude Code custom commands](https://docs.claude.com/en/docs/claude-code/settings) |
| Dashboard (Next.js) | `dashboard/` |

Command files here **mirror** Muffs’ onboarding/session flows so you can run the same workflow while coding; they edit `agentMuffs/memory/memory.md` (or `MEMORY_PATH`), not the deployed SMS loop unless you wire that separately.

---
description: Run first-time onboarding — name, timezone, preferences
---

Use the prompt in `agentMuffs/prompts/setup.txt` to guide the user through a short conversation. Collect:
- Their name (how they want to be addressed)
- Timezone
- Communication style preference
- Any standing context (recurring commitments, preferences, things to never bring up)

After confirming with the user, write results to the User Facts section of `agentMuffs/memory/memory.md` (or the file at `MEMORY_PATH` if set). Do not overwrite existing Agent Notes — only update the User Facts section.

Format:
```
## User Facts
- Name: [name]
- Timezone: [timezone]
- Communication style: [style]
- [Any other facts]
```

End the conversation with: "All set. Text me any time."

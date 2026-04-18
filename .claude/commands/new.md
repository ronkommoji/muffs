Start a new session.

1. If there's an active session, write a brief summary of important ongoing context to the Agent Notes section of `agent/memory/memory.md`. Be concise — one to three bullet points max. Only write things worth remembering across sessions.

2. Close the current session gracefully.

3. Start a new session (clear in-memory session state so the next run starts fresh).

4. Respond to the user: "Starting fresh. What do you need?"

If triggered automatically due to context window limit, add: "(Context window was nearly full — started a new session automatically.)"

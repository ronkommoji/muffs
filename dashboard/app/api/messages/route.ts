import { getDb, maybeSetSessionTitleFromFirstMessage } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get("session_id");
  const db = getDb();

  if (sessionId) {
    const messages = db
      .prepare(
        "SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC"
      )
      .all(sessionId);
    return Response.json(messages);
  }

  const sessions = db
    .prepare(
      `SELECT s.id, s.created_at, s.status, s.title,
              s.token_count, s.context_percentage, s.context_max_tokens,
              m.content as preview, m.role as preview_role,
              fm.content as first_message
       FROM sessions s
       LEFT JOIN messages m ON m.id = (
         SELECT id FROM messages WHERE session_id = s.id ORDER BY created_at DESC LIMIT 1
       )
       LEFT JOIN messages fm ON fm.id = (
         SELECT id FROM messages WHERE session_id = s.id ORDER BY created_at ASC LIMIT 1
       )
       ORDER BY s.updated_at DESC`
    )
    .all();
  return Response.json(sessions);
}

export async function POST(req: Request) {
  const { session_id, content } = await req.json();
  const db = getDb();

  db.prepare(
    "INSERT INTO messages (session_id, role, content, source) VALUES (?, 'user', ?, 'dashboard')"
  ).run(session_id, content);
  maybeSetSessionTitleFromFirstMessage(session_id);

  // Fire-and-forget: agent writes the response back to DB, chat polls pick it up
  const agentUrl = process.env.PYTHON_AGENT_URL ?? "http://localhost:8000";
  fetch(`${agentUrl}/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: content, session_id, send_via_sendblue: false }),
  }).catch((err) => console.error("Agent call failed:", err));

  return Response.json({ ok: true, session_id });
}

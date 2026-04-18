import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const sessions = getDb()
    .prepare("SELECT * FROM sessions ORDER BY updated_at DESC")
    .all();
  return Response.json(sessions);
}

export async function POST() {
  // Close all active sessions and create a new one
  const db = getDb();
  db.prepare("UPDATE sessions SET status='closed' WHERE status='active'").run();

  const id = `sess_${Date.now()}`;
  db.prepare("INSERT INTO sessions (id, status) VALUES (?, 'active')").run(id);

  // Notify agent to clear its in-memory session
  const agentUrl = process.env.PYTHON_AGENT_URL ?? "http://localhost:8000";
  await fetch(`${agentUrl}/new-session`, { method: "POST" }).catch(() => {});

  return Response.json({ id });
}

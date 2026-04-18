import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  // Fetch live status from Python agent (which calls Composio)
  const agentUrl = process.env.PYTHON_AGENT_URL ?? "http://localhost:8000";
  try {
    const res = await fetch(`${agentUrl}/integrations`, { cache: "no-store" });
    const data = await res.json();
    return Response.json(data);
  } catch {
    // Fall back to SQLite cache
    const integrations = getDb()
      .prepare("SELECT * FROM integrations")
      .all();
    return Response.json({ items: integrations });
  }
}

export async function POST(req: Request) {
  const { toolkit } = await req.json();
  const agentUrl = process.env.PYTHON_AGENT_URL ?? "http://localhost:8000";
  const res = await fetch(`${agentUrl}/integrations/connect`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ toolkit, user_id: "default" }),
  });
  const data = await res.json();
  return Response.json(data);
}

export async function DELETE(req: Request) {
  const { id } = await req.json();
  getDb().prepare("DELETE FROM integrations WHERE id=?").run(id);
  return Response.json({ ok: true });
}

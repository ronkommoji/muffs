import { getPythonAgentUrl } from "@/lib/config";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

function sqliteConnectedPayload() {
  const rows = getDb()
    .prepare("SELECT id, name, status FROM integrations")
    .all() as { id: string; name: string; status: string }[];
  const connected = rows.filter((r) => r.status === "connected");
  return {
    items: [] as unknown[],
    next_cursor: null as string | null,
    connected_slugs: connected.map((r) => r.id.toLowerCase()),
    total_items: 0,
    agent_available: false,
  };
}

export async function GET(req: Request) {
  const agentUrl = getPythonAgentUrl();
  const incoming = new URL(req.url).searchParams;
  const params = new URLSearchParams();
  const search = incoming.get("search");
  const cursor = incoming.get("cursor");
  const limit = incoming.get("limit") ?? "48";
  const userId = incoming.get("user_id") ?? "default";
  if (search) params.set("search", search);
  if (cursor) params.set("cursor", cursor);
  params.set("limit", limit);
  params.set("user_id", userId);

  try {
    const res = await fetch(`${agentUrl}/integrations?${params.toString()}`, {
      cache: "no-store",
    });
    const data = await res.json();
    return Response.json({ ...data, agent_available: true });
  } catch {
    return Response.json(sqliteConnectedPayload());
  }
}

export async function POST(req: Request) {
  const { toolkit } = await req.json();
  const agentUrl = getPythonAgentUrl();
  const res = await fetch(`${agentUrl}/integrations/connect`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ toolkit, user_id: "default" }),
  });
  const data = await res.json();
  return Response.json(data);
}

/** Disconnects via Composio (soft-delete connected account) and clears any local SQLite row. */
export async function DELETE(req: Request) {
  const { id: toolkit } = await req.json();
  const agentUrl = getPythonAgentUrl();
  try {
    const res = await fetch(`${agentUrl}/integrations/disconnect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toolkit, user_id: "default" }),
    });
    const data = await res.json();
    if (!res.ok) {
      return Response.json(data, { status: res.status });
    }
  } catch {
    // Agent unreachable — still try to clear local cache
  }
  getDb().prepare("DELETE FROM integrations WHERE id=?").run(toolkit);
  return Response.json({ ok: true });
}

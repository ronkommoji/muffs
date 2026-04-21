import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

const KINDS = new Set(["general", "automation_creator"]);

export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  let body: { kind?: string } = {};
  try {
    body = (await req.json()) as { kind?: string };
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }
  const kind = body.kind;
  if (typeof kind !== "string" || !KINDS.has(kind)) {
    return Response.json({ error: "invalid kind" }, { status: 400 });
  }

  const db = getDb();
  const row = db.prepare("SELECT id FROM sessions WHERE id = ?").get(id) as
    | { id: string }
    | undefined;
  if (!row) {
    return Response.json({ error: "not found" }, { status: 404 });
  }

  db.prepare(
    "UPDATE sessions SET kind = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
  ).run(kind, id);

  return Response.json({ ok: true, kind });
}

export async function DELETE(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const db = getDb();

  const row = db.prepare("SELECT id FROM sessions WHERE id = ?").get(id) as
    | { id: string }
    | undefined;
  if (!row) {
    return Response.json({ error: "not found" }, { status: 404 });
  }

  const tx = db.transaction(() => {
    db.prepare("DELETE FROM agent_events WHERE session_id = ?").run(id);
    db.prepare("DELETE FROM messages WHERE session_id = ?").run(id);
    db.prepare("DELETE FROM sessions WHERE id = ?").run(id);
  });
  tx();

  return Response.json({ ok: true });
}

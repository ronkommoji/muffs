import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const db = getDb();

  const fields = Object.keys(body)
    .filter((k) =>
      ["name", "description", "schedule_cron", "timezone", "system_prompt", "enabled"].includes(k)
    )
    .map((k) => `${k}=?`);
  const values = fields.map((f) => body[f.split("=")[0]]);

  if (fields.length === 0) return Response.json({ ok: false });

  db.prepare(`UPDATE routines SET ${fields.join(",")} WHERE id=?`).run(
    ...values,
    id
  );

  const agentUrl = process.env.PYTHON_AGENT_URL ?? "http://localhost:8000";
  await fetch(`${agentUrl}/routine/reload`, { method: "POST" }).catch(() => {});

  return Response.json({ ok: true });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  getDb().prepare("DELETE FROM routines WHERE id=?").run(id);

  const agentUrl = process.env.PYTHON_AGENT_URL ?? "http://localhost:8000";
  await fetch(`${agentUrl}/routine/reload`, { method: "POST" }).catch(() => {});

  return Response.json({ ok: true });
}

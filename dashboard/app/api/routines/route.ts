import { getPythonAgentUrl } from "@/lib/config";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const routines = getDb()
    .prepare("SELECT * FROM routines ORDER BY created_at DESC")
    .all();
  return Response.json(routines);
}

export async function POST(req: Request) {
  const body = await req.json();
  const { name, description, schedule_cron, timezone, system_prompt } = body;

  const db = getDb();
  const result = db
    .prepare(
      `INSERT INTO routines (name, description, schedule_cron, timezone, system_prompt)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(name, description, schedule_cron, timezone ?? "UTC", system_prompt);

  // Tell Python agent to reload its scheduler
  const agentUrl = getPythonAgentUrl();
  await fetch(`${agentUrl}/routine/reload`, { method: "POST" }).catch(() => {});

  return Response.json({ id: result.lastInsertRowid }, { status: 201 });
}

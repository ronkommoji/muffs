import { getPythonAgentUrl } from "@/lib/config";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

const KINDS = new Set(["general", "automation_creator"]);

export async function GET() {
  const sessions = getDb()
    .prepare("SELECT * FROM sessions ORDER BY updated_at DESC")
    .all();
  return Response.json(sessions);
}

export async function POST(req: Request) {
  let kind = "general";
  try {
    const body = await req.json();
    if (body && typeof body.kind === "string" && KINDS.has(body.kind)) {
      kind = body.kind;
    }
  } catch {
    /* empty body */
  }

  const db = getDb();
  const id = `sess_${Date.now()}`;
  db.prepare("INSERT INTO sessions (id, status, kind) VALUES (?, 'active', ?)").run(
    id,
    kind
  );

  return Response.json({ id, kind });
}

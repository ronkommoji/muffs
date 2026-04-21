import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const n = parseInt(id, 10);
  if (Number.isNaN(n)) {
    return Response.json({ error: "invalid id" }, { status: 400 });
  }
  const db = getDb();
  const rows = db
    .prepare(
      "SELECT * FROM routine_runs WHERE routine_id = ? ORDER BY started_at DESC LIMIT 100"
    )
    .all(n);
  return Response.json(rows);
}

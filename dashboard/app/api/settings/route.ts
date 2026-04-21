import { writePreferencesMirror } from "@/lib/preferences-file";

export const dynamic = "force-dynamic";

/**
 * Legacy route. Profile and personality are edited in workspace/memory/*.md, not SQLite.
 * Optional PUT only updates operational keys in preferences.json (e.g. mirrors from other flows).
 */
export async function GET() {
  return Response.json({});
}

export async function PUT(req: Request) {
  const body = (await req.json()) as Record<string, unknown>;
  const snap: Record<string, string> = {};
  for (const [k, v] of Object.entries(body)) {
    if ((k === "composio_toolkits" || k === "auto_rotate_session") && typeof v === "string") {
      snap[k] = v;
    }
  }
  if (Object.keys(snap).length > 0) {
    writePreferencesMirror(snap);
  }
  return Response.json({ ok: true });
}

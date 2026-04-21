import { getPythonAgentUrl } from "@/lib/config";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const agentUrl = getPythonAgentUrl();
  try {
    const res = await fetch(`${agentUrl}/integrations/connection-state`, {
      cache: "no-store",
    });
    return Response.json(await res.json());
  } catch {
    const rows = getDb()
      .prepare("SELECT id, status FROM integrations")
      .all() as { id: string; status: string }[];
    return Response.json({
      connected_slugs: rows
        .filter((r) => r.status === "connected")
        .map((r) => r.id.toLowerCase()),
    });
  }
}

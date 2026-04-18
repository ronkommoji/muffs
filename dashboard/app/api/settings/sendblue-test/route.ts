import { getSetting } from "@/lib/db";
import { testConnection } from "@/lib/sendblue";

export const dynamic = "force-dynamic";

export async function POST() {
  const toNumber = getSetting("sendblue_to");
  if (!toNumber) {
    return Response.json({ ok: false, error: "To number not configured in settings." });
  }
  const result = await testConnection(toNumber);
  return Response.json(result);
}

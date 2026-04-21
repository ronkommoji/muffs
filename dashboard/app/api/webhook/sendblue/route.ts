import { getDb, getSetting, maybeSetSessionTitleFromFirstMessage } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const payload = await req.json();
  const { from_number, content, group_id } = payload;

  if (!content) return Response.json({ ok: false, error: "no content" });

  const configuredTo = getSetting("sendblue_to");
  if (configuredTo && from_number !== configuredTo) {
    return Response.json({ ok: false, error: "unknown sender" }, { status: 403 });
  }

  const db = getDb();

  // Ensure an active session exists
  let session = db
    .prepare("SELECT id FROM sessions WHERE status='active' ORDER BY updated_at DESC LIMIT 1")
    .get() as { id: string } | undefined;

  if (!session) {
    const id = `sess_${Date.now()}`;
    db.prepare("INSERT INTO sessions (id, status) VALUES (?, 'active')").run(id);
    session = { id };
  }

  // Write inbound message
  db.prepare(
    "INSERT INTO messages (session_id, role, content, source) VALUES (?, 'user', ?, 'sendblue')"
  ).run(session.id, content);
  maybeSetSessionTitleFromFirstMessage(session.id);

  const agentUrl = process.env.PYTHON_AGENT_URL ?? "http://localhost:8000";

  // Send typing indicator immediately so iMessage shows "..." bubble
  const apiKeyId = getSetting("sendblue_api_key") || process.env.SENDBLUE_API_KEY_ID || "";
  const apiSecret = getSetting("sendblue_api_secret") || process.env.SENDBLUE_API_SECRET_KEY || "";
  const fromNumber = getSetting("sendblue_from") || process.env.SENDBLUE_FROM_NUMBER || "";
  if (apiKeyId && apiSecret && fromNumber && from_number) {
    fetch("https://api.sendblue.com/api/send-typing-indicator", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "sb-api-key-id": apiKeyId,
        "sb-api-secret-key": apiSecret,
      },
      body: JSON.stringify({ number: from_number, from_number: fromNumber }),
    }).catch(() => {});
  }

  // Forward to Python agent (fire-and-forget, respond 200 immediately to Sendblue)
  fetch(`${agentUrl}/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: content,
      session_id: session.id,
      send_via_sendblue: true,
    }),
  }).catch((err) => console.error("Agent trigger error:", err));

  return Response.json({ ok: true });
}

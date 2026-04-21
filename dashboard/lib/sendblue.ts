/** Sendblue credentials: environment only (never SQLite). */

export function getSendblueEnv() {
  return {
    apiKeyId: process.env.SENDBLUE_API_KEY_ID ?? "",
    apiSecretKey: process.env.SENDBLUE_API_SECRET_KEY ?? "",
    fromNumber: process.env.SENDBLUE_FROM_NUMBER ?? "",
    toNumber: process.env.SENDBLUE_TO_NUMBER ?? "",
  };
}

export async function sendMessage(content: string, toNumber: string): Promise<void> {
  const { apiKeyId, apiSecretKey, fromNumber } = getSendblueEnv();
  if (!apiKeyId || !apiSecretKey || !fromNumber) {
    console.warn("Sendblue credentials not configured — skipping send");
    return;
  }
  const res = await fetch("https://api.sendblue.com/api/send-message", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "sb-api-key-id": apiKeyId,
      "sb-api-secret-key": apiSecretKey,
    },
    body: JSON.stringify({
      number: toNumber,
      from_number: fromNumber,
      content,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Sendblue send failed (${res.status}): ${text}`);
  }
}

export async function testConnection(toNumber: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await sendMessage("Muffs connection test — all good.", toNumber);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

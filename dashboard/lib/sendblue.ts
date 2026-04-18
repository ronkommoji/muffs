import { getSetting } from "@/lib/db";

interface Creds {
  apiKeyId: string;
  apiSecretKey: string;
  fromNumber: string;
}

function getCreds(): Creds {
  return {
    apiKeyId: getSetting("sendblue_api_key") || process.env.SENDBLUE_API_KEY_ID || "",
    apiSecretKey: getSetting("sendblue_api_secret") || process.env.SENDBLUE_API_SECRET_KEY || "",
    fromNumber: getSetting("sendblue_from") || process.env.SENDBLUE_FROM_NUMBER || "",
  };
}

export async function sendMessage(content: string, toNumber: string): Promise<void> {
  const { apiKeyId, apiSecretKey, fromNumber } = getCreds();
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

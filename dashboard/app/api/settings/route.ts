import { getDb, getSetting, setSetting } from "@/lib/db";

export const dynamic = "force-dynamic";

const SETTING_KEYS = [
  "personality_notes",
  "response_style",
  "tone_adjustments",
  "off_limits_topics",
  "sendblue_api_key",
  "sendblue_api_secret",
  "sendblue_from",
  "sendblue_to",
  "auto_rotate_session",
];

export async function GET() {
  const result: Record<string, string> = {};
  for (const key of SETTING_KEYS) {
    result[key] = getSetting(key);
  }
  return Response.json(result);
}

export async function PUT(req: Request) {
  const body = await req.json();
  for (const [key, value] of Object.entries(body)) {
    if (SETTING_KEYS.includes(key) && typeof value === "string") {
      setSetting(key, value);
    }
  }
  return Response.json({ ok: true });
}

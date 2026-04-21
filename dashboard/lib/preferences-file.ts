import fs from "fs";
import path from "path";
import { preferencesFilePath } from "@/lib/workspace-paths";

/** Keys that used to live in SQLite / old mirrors — do not persist alongside markdown source of truth. */
const DROP_KEYS = new Set([
  "user_display_name",
  "agent_display_name",
  "response_style",
  "personality_notes",
  "tone_adjustments",
  "off_limits_topics",
  "onboarding_completed",
]);

/** Mirror operational keys (e.g. composio_toolkits) to workspace/user/preferences.json */
export function writePreferencesMirror(settings: Record<string, string>): void {
  const p = preferencesFilePath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  let existing: Record<string, string> = {};
  if (fs.existsSync(p)) {
    try {
      const raw = JSON.parse(fs.readFileSync(p, "utf8")) as {
        settings?: Record<string, string>;
      };
      if (raw.settings && typeof raw.settings === "object") {
        existing = { ...raw.settings };
      }
    } catch {
      /* keep empty */
    }
  }
  const merged = { ...existing, ...settings };
  for (const k of DROP_KEYS) {
    delete merged[k];
  }
  const safe: Record<string, string> = {};
  for (const [k, v] of Object.entries(merged)) {
    if (!k.startsWith("sendblue_")) {
      safe[k] = v;
    }
  }
  const payload = {
    version: 1,
    note:
      "Operational keys only (e.g. composio_toolkits, auto_rotate_session). Identity lives in workspace/memory/*.md.",
    settings: safe,
  };
  fs.writeFileSync(p, JSON.stringify(payload, null, 2) + "\n", "utf8");
}

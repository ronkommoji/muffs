import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { defaultDbPath, ensureWorkspaceDirs } from "@/lib/workspace-paths";

ensureWorkspaceDirs();

function resolvedDbPath(): string {
  const resolved = process.env.DB_PATH
    ? path.resolve(process.env.DB_PATH)
    : defaultDbPath();
  if (fs.existsSync(resolved)) return resolved;
  const legacy = path.join(process.cwd(), "..", "muffs.db");
  if (fs.existsSync(legacy)) {
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    fs.copyFileSync(legacy, resolved);
  }
  return resolved;
}

const DB_PATH = resolvedDbPath();

const SCHEMA_PATH = path.join(process.cwd(), "..", "db", "schema.sql");

/** Keys that formerly lived in `settings` — identity from markdown; secrets from env only. */
const LEGACY_SETTINGS_KEYS = [
  "user_display_name",
  "agent_display_name",
  "response_style",
  "personality_notes",
  "tone_adjustments",
  "off_limits_topics",
  "composio_toolkits",
  "onboarding_completed",
  "auto_rotate_session",
  "sendblue_api_key",
  "sendblue_api_secret",
  "sendblue_from",
  "sendblue_to",
] as const;

let _db: Database.Database | null = null;

function pruneLegacySettings(db: Database.Database) {
  const placeholders = LEGACY_SETTINGS_KEYS.map(() => "?").join(",");
  db.prepare(`DELETE FROM settings WHERE key IN (${placeholders})`).run(
    ...LEGACY_SETTINGS_KEYS
  );
}

export function getDb(): Database.Database {
  if (!_db) {
    _db = new Database(DB_PATH);
    _db.pragma("journal_mode = WAL");
    _db.pragma("foreign_keys = ON");

    if (fs.existsSync(SCHEMA_PATH)) {
      const schema = fs.readFileSync(SCHEMA_PATH, "utf8");
      _db.exec(schema);
    }
    migrateSessionsTable(_db);
    migrateRoutineRunsTable(_db);
    pruneLegacySettings(_db);
  }
  return _db;
}

function migrateRoutineRunsTable(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS routine_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      routine_id INTEGER NOT NULL REFERENCES routines(id) ON DELETE CASCADE,
      started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      finished_at DATETIME,
      status TEXT NOT NULL,
      output_excerpt TEXT,
      error TEXT
    )
  `);
}

function migrateSessionsTable(db: Database.Database) {
  const cols = db.prepare("PRAGMA table_info(sessions)").all() as { name: string }[];
  if (!cols.some((c) => c.name === "title")) {
    db.exec("ALTER TABLE sessions ADD COLUMN title TEXT");
  }
  if (!cols.some((c) => c.name === "context_percentage")) {
    db.exec("ALTER TABLE sessions ADD COLUMN context_percentage REAL");
  }
  if (!cols.some((c) => c.name === "context_max_tokens")) {
    db.exec("ALTER TABLE sessions ADD COLUMN context_max_tokens INTEGER");
  }
  if (!cols.some((c) => c.name === "kind")) {
    db.exec("ALTER TABLE sessions ADD COLUMN kind TEXT DEFAULT 'general'");
  }
  db.prepare(
    `UPDATE sessions SET title = (
       SELECT CASE
         WHEN length(trim(replace(replace(m.content, char(10), ' '), char(13), ' '))) > 60
         THEN substr(trim(replace(replace(m.content, char(10), ' '), char(13), ' ')), 1, 57) || '...'
         ELSE trim(replace(replace(m.content, char(10), ' '), char(13), ' '))
       END
       FROM messages m WHERE m.session_id = sessions.id ORDER BY m.created_at ASC LIMIT 1
     )
     WHERE (title IS NULL OR trim(title) = '')
       AND EXISTS (SELECT 1 FROM messages WHERE session_id = sessions.id)`
  ).run();
}

/** One-line title from first message (for sidebar labels). */
export function deriveSessionTitleFromContent(content: string): string {
  const single = content.replace(/\s+/g, " ").trim();
  if (!single) return "New chat";
  return single.length > 60 ? `${single.slice(0, 57)}...` : single;
}

/** Set session title from chronologically first message when title is still empty. */
export function maybeSetSessionTitleFromFirstMessage(sessionId: string): void {
  const db = getDb();
  const row = db.prepare("SELECT title FROM sessions WHERE id = ?").get(sessionId) as
    | { title: string | null }
    | undefined;
  if (!row) return;
  if (row.title && row.title.trim() !== "") return;
  const first = db
    .prepare(
      "SELECT content FROM messages WHERE session_id = ? ORDER BY created_at ASC LIMIT 1"
    )
    .get(sessionId) as { content: string } | undefined;
  if (!first) return;
  const title = deriveSessionTitleFromContent(first.content);
  db.prepare("UPDATE sessions SET title = ? WHERE id = ?").run(title, sessionId);
}

// ---------------------------------------------------------------------------
// Typed helpers
// ---------------------------------------------------------------------------

export interface Session {
  id: string;
  created_at: string;
  updated_at: string;
  token_count: number;
  context_percentage: number | null;
  context_max_tokens: number | null;
  status: string;
  title: string | null;
  kind: string | null;
}

export interface Message {
  id: number;
  session_id: string;
  role: string;
  content: string;
  source: string;
  created_at: string;
}

export interface AgentEvent {
  id: number;
  session_id: string;
  event_type: string;
  tool_name: string | null;
  payload: string | null;
  status: string | null;
  created_at: string;
}

export interface Routine {
  id: number;
  name: string;
  description: string | null;
  schedule_cron: string;
  timezone: string;
  system_prompt: string;
  enabled: number;
  last_run_at: string | null;
  last_run_status: string | null;
  created_at: string;
}

export interface Integration {
  id: string;
  name: string;
  status: string;
  connected_at: string;
  metadata: string | null;
}


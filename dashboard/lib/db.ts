import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const DB_PATH = process.env.DB_PATH
  ? path.resolve(process.env.DB_PATH)
  : path.join(process.cwd(), "..", "muffs.db");

const SCHEMA_PATH = path.join(process.cwd(), "..", "db", "schema.sql");

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!_db) {
    _db = new Database(DB_PATH);
    _db.pragma("journal_mode = WAL");
    _db.pragma("foreign_keys = ON");

    if (fs.existsSync(SCHEMA_PATH)) {
      const schema = fs.readFileSync(SCHEMA_PATH, "utf8");
      _db.exec(schema);
    }
  }
  return _db;
}

// ---------------------------------------------------------------------------
// Typed helpers
// ---------------------------------------------------------------------------

export interface Session {
  id: string;
  created_at: string;
  updated_at: string;
  token_count: number;
  status: string;
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

export function getSetting(key: string, defaultValue = ""): string {
  const db = getDb();
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? defaultValue;
}

export function setSetting(key: string, value: string): void {
  getDb()
    .prepare(
      "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=CURRENT_TIMESTAMP"
    )
    .run(key, value);
}

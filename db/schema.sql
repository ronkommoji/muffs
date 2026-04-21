CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  sdk_session_id TEXT,
  title TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  token_count INTEGER DEFAULT 0,
  context_percentage REAL,
  context_max_tokens INTEGER,
  status TEXT DEFAULT 'active',
  kind TEXT DEFAULT 'general'
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT REFERENCES sessions(id),
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  source TEXT DEFAULT 'dashboard',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS agent_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT REFERENCES sessions(id),
  event_type TEXT NOT NULL,
  tool_name TEXT,
  payload TEXT,
  status TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS routines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  schedule_cron TEXT NOT NULL,
  timezone TEXT DEFAULT 'UTC',
  system_prompt TEXT NOT NULL,
  enabled INTEGER DEFAULT 1,
  last_run_at DATETIME,
  last_run_status TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS routine_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  routine_id INTEGER NOT NULL REFERENCES routines(id) ON DELETE CASCADE,
  started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  finished_at DATETIME,
  status TEXT NOT NULL,
  output_excerpt TEXT,
  error TEXT
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS integrations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT DEFAULT 'connected',
  connected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  metadata TEXT
);

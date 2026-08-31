CREATE TABLE settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  json TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE conversations (
  id TEXT PRIMARY KEY,
  visitor_id TEXT, page_url TEXT, referrer TEXT,
  handoff_id TEXT, started_at INTEGER NOT NULL,
  last_message_at INTEGER, message_count INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_conv_started ON conversations(started_at DESC);
CREATE TABLE messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id TEXT NOT NULL, role TEXT NOT NULL,
  content TEXT NOT NULL, created_at INTEGER NOT NULL,
  retrieval_score REAL, grounded_score REAL,
  grounded_commit INTEGER
);
CREATE INDEX idx_msgs_conv ON messages(conversation_id, created_at);
CREATE TABLE handoffs (
  id TEXT PRIMARY KEY,
  conversation_id TEXT, type TEXT NOT NULL DEFAULT 'lead',
  email TEXT NOT NULL DEFAULT '', name TEXT, company TEXT,
  pillar TEXT, timeline TEXT, scale TEXT, summary TEXT,
  page_url TEXT, status TEXT NOT NULL DEFAULT 'new',
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_handoffs_created ON handoffs(created_at DESC);
CREATE TABLE actions (          -- dormant; no UI/executor in v1
  name TEXT PRIMARY KEY, description TEXT NOT NULL,
  input_schema TEXT NOT NULL, kind TEXT NOT NULL,
  config TEXT NOT NULL, secret_ref TEXT,
  confirm_required INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 0
);

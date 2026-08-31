-- Activate Actions registry: usage stats + secrets (write-only) + MCP servers

ALTER TABLE actions ADD COLUMN use_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE actions ADD COLUMN last_used_at INTEGER;
ALTER TABLE actions ADD COLUMN last_error TEXT;
ALTER TABLE actions ADD COLUMN last_error_at INTEGER;
ALTER TABLE actions ADD COLUMN updated_at INTEGER;

CREATE TABLE IF NOT EXISTS secrets (
  name TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS mcp_servers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  transport TEXT NOT NULL DEFAULT 'http',
  allowed_tools TEXT NOT NULL DEFAULT '[]',
  secret_ref TEXT,
  enabled INTEGER NOT NULL DEFAULT 0,
  use_count INTEGER NOT NULL DEFAULT 0,
  last_used_at INTEGER,
  last_error TEXT,
  last_error_at INTEGER,
  updated_at INTEGER NOT NULL
);

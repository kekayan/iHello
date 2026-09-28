CREATE TABLE IF NOT EXISTS vz_chunks (
  id TEXT PRIMARY KEY,
  source_key TEXT NOT NULL DEFAULT '',
  text TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_vz_chunks_source ON vz_chunks(source_key);

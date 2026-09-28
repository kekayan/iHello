CREATE TABLE IF NOT EXISTS kb_docs (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  text TEXT NOT NULL,
  source_url TEXT,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_kb_docs_updated ON kb_docs(updated_at DESC);

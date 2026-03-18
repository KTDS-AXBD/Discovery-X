CREATE TABLE IF NOT EXISTS chat_widgets (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  conversation_id TEXT NOT NULL
    REFERENCES conversations(id) ON DELETE CASCADE,
  widget_type TEXT NOT NULL,
  title TEXT NOT NULL,
  code TEXT NOT NULL,
  data TEXT NOT NULL DEFAULT '{}',
  description TEXT,
  tenant_id TEXT REFERENCES tenants(id),
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_chat_widgets_conversation
  ON chat_widgets(conversation_id);

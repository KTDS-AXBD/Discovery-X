-- Agent Chat: conversations, messages, agent_config tables
-- System user for automated agent actions
INSERT OR IGNORE INTO users (id, email, name) VALUES ('system-agent', 'agent@system', 'Agent');

-- Add created_by_agent column to discoveries
ALTER TABLE discoveries ADD COLUMN created_by_agent INTEGER NOT NULL DEFAULT 0;

-- conversations: user chat sessions
CREATE TABLE conversations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX idx_conversations_user_id ON conversations(user_id);
CREATE INDEX idx_conversations_updated_at ON conversations(updated_at);

-- messages: chat messages (user/assistant/tool_use/tool_result)
CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  tool_name TEXT,
  tool_input TEXT,
  tool_result TEXT,
  discovery_id TEXT REFERENCES discoveries(id),
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX idx_messages_created_at ON messages(created_at);

-- agent_config: agent settings (singleton-ish, one row per config)
CREATE TABLE agent_config (
  id TEXT PRIMARY KEY,
  system_prompt TEXT,
  autonomy_level INTEGER NOT NULL DEFAULT 3,
  daily_token_budget INTEGER NOT NULL DEFAULT 100000,
  tokens_used_today INTEGER NOT NULL DEFAULT 0,
  token_reset_date TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Insert default agent config
INSERT INTO agent_config (id, autonomy_level, daily_token_budget)
VALUES ('default', 3, 100000);

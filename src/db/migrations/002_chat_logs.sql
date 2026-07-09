-- 002_chat_logs.sql
-- Conversation logs for training export

CREATE TABLE IF NOT EXISTS chat_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       TEXT NOT NULL,
  user_name     TEXT NOT NULL,
  session_id    TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content       TEXT NOT NULL,
  images        JSONB NOT NULL DEFAULT '[]',
  channel       TEXT NOT NULL DEFAULT 'training',
  metadata      JSONB NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_logs_session ON chat_logs(session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_chat_logs_user ON chat_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_logs_created ON chat_logs(created_at DESC);

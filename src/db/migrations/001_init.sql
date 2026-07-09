-- 001_init.sql
-- Lilly OS core schema

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS missions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title         TEXT NOT NULL,
  goal          TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending',
  priority      TEXT NOT NULL DEFAULT 'medium',
  metadata      JSONB NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tasks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id    UUID REFERENCES missions(id) ON DELETE SET NULL,
  agent         TEXT NOT NULL,
  title         TEXT NOT NULL,
  description   TEXT NOT NULL DEFAULT '',
  status        TEXT NOT NULL DEFAULT 'pending',
  priority      TEXT NOT NULL DEFAULT 'medium',
  payload       JSONB NOT NULL DEFAULT '{}',
  result        JSONB,
  scheduled_for TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_agent ON tasks(agent);
CREATE INDEX IF NOT EXISTS idx_tasks_scheduled ON tasks(scheduled_for);

CREATE TABLE IF NOT EXISTS content_items (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title               TEXT NOT NULL,
  body                TEXT NOT NULL DEFAULT '',
  caption             TEXT NOT NULL DEFAULT '',
  content_type        TEXT NOT NULL DEFAULT 'text',
  media_urls          JSONB NOT NULL DEFAULT '[]',
  tags                JSONB NOT NULL DEFAULT '[]',
  platforms           JSONB NOT NULL DEFAULT '[]',
  traffic_url         TEXT,
  status              TEXT NOT NULL DEFAULT 'pending',
  scheduled_for       TIMESTAMPTZ,
  published_at        TIMESTAMPTZ,
  compliance_verdict  TEXT,
  compliance_notes    TEXT,
  metadata            JSONB NOT NULL DEFAULT '{}',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_content_status ON content_items(status);
CREATE INDEX IF NOT EXISTS idx_content_scheduled ON content_items(scheduled_for);

CREATE TABLE IF NOT EXISTS draft_replies (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform          TEXT NOT NULL,
  thread_id         TEXT NOT NULL,
  original_message  TEXT NOT NULL,
  draft             TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'draft',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS metrics (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  value         DOUBLE PRECISION NOT NULL,
  unit          TEXT NOT NULL DEFAULT 'count',
  platform      TEXT NOT NULL DEFAULT 'all',
  dimensions    JSONB NOT NULL DEFAULT '{}',
  recorded_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_metrics_name_time ON metrics(name, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_metrics_platform ON metrics(platform);

CREATE TABLE IF NOT EXISTS memory_entries (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope         TEXT NOT NULL,
  key           TEXT NOT NULL,
  value         JSONB NOT NULL,
  tags          JSONB NOT NULL DEFAULT '[]',
  importance    DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at    TIMESTAMPTZ,
  UNIQUE (scope, key)
);

CREATE INDEX IF NOT EXISTS idx_memory_scope ON memory_entries(scope);
CREATE INDEX IF NOT EXISTS idx_memory_tags ON memory_entries USING GIN (tags);

CREATE TABLE IF NOT EXISTS publish_jobs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id      UUID NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
  platform        TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending',
  external_id     TEXT,
  external_url    TEXT,
  error           TEXT,
  attempts        INT NOT NULL DEFAULT 0,
  scheduled_for   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_publish_status ON publish_jobs(status);
CREATE INDEX IF NOT EXISTS idx_publish_scheduled ON publish_jobs(scheduled_for);

CREATE TABLE IF NOT EXISTS analytics_reports (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period        TEXT NOT NULL,
  start_date    TIMESTAMPTZ NOT NULL,
  end_date      TIMESTAMPTZ NOT NULL,
  summary       TEXT NOT NULL DEFAULT '',
  kpis          JSONB NOT NULL DEFAULT '{}',
  trends        JSONB NOT NULL DEFAULT '[]',
  experiments   JSONB NOT NULL DEFAULT '[]',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS schema_migrations (
  id            TEXT PRIMARY KEY,
  applied_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

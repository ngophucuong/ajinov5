-- Ajino v5 — Database Schema
-- Single source of truth. All code must reference this file.
-- PostgreSQL 16 + pgvector extension

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── users ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_id BIGINT UNIQUE NOT NULL,
  name        TEXT,
  role        TEXT NOT NULL DEFAULT 'ceo', -- 'ceo' | 'admin'
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── chat_sessions ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS chat_sessions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id),
  title      TEXT,
  tags       TEXT[] DEFAULT '{}',
  metadata   JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_telegram ON chat_sessions ((metadata->>'telegram_id')) WHERE metadata->>'surface' = 'telegram';

-- ─── chat_messages ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS chat_messages (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id     UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  role           TEXT NOT NULL CHECK (role IN ('user','assistant')),
  content        TEXT NOT NULL,
  thinking_trace JSONB,            -- [{step,agent,duration_ms,result}]
  model_used     TEXT,             -- 'deepseek-pro' | 'deepseek-flash'
  reasoning_mode TEXT,             -- 'auto' | 'fast' | 'deep'
  tokens_used    INTEGER,
  latency_ms     INTEGER,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── memory ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS memory (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content       TEXT NOT NULL,
  embedding     vector(1024),       -- bge-m3 via CF Workers AI
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','canonical','archived')),
  source        TEXT NOT NULL CHECK (source IN ('chat','capture','studio','manual')),
  source_ref    UUID,               -- chat_messages.id or captures.id
  approved_at   TIMESTAMPTZ,
  approved_by   UUID REFERENCES users(id),
  decay_at      TIMESTAMPTZ,        -- NULL = no decay; set on approval
  metadata      JSONB NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_memory_embedding ON memory USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX IF NOT EXISTS idx_memory_status ON memory (status);

-- ─── captures ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS captures (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id),
  type            TEXT NOT NULL CHECK (type IN ('text','link','image')),
  content         TEXT,
  url             TEXT,
  raw_file_r2_key TEXT,
  extracted_facts JSONB,           -- [{fact: TEXT, confidence: FLOAT}]
  status          TEXT NOT NULL DEFAULT 'processing'
                  CHECK (status IN ('processing','extracted','committed','failed')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── studio_documents ──────────────────────────────────
CREATE TABLE IF NOT EXISTS studio_documents (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id),
  title        TEXT NOT NULL,
  content      TEXT NOT NULL,        -- Markdown source
  r2_key       TEXT,                 -- if uploaded file
  compile_status TEXT NOT NULL DEFAULT 'draft'
               CHECK (compile_status IN ('draft','compiling','compiled','failed')),
  memory_ids   UUID[] DEFAULT '{}',  -- memory rows created from this doc
  deleted_at   TIMESTAMPTZ,            -- soft delete
  metadata     JSONB NOT NULL DEFAULT '{}', -- source_type, research_job_id, word_count, compile_error
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── audit_log ─────────────────────────────────────────
-- APPEND-ONLY: no UPDATE, no DELETE ever
CREATE TABLE IF NOT EXISTS audit_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES users(id),
  action        TEXT NOT NULL,
  resource_type TEXT,
  resource_id   UUID,
  llm_model     TEXT,
  llm_tokens    INTEGER,
  payload       JSONB NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── skills ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS skills (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT UNIQUE NOT NULL,
  description TEXT,
  version     TEXT NOT NULL DEFAULT '1.0.0',
  enabled     BOOLEAN NOT NULL DEFAULT true,
  config      JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed: insert skills
INSERT INTO skills (name, description) VALUES
  ('web_search', 'Serper.dev Google search'),
  ('memory_retrieval', 'pgvector hybrid vector+keyword search'),
  ('report_generator', 'Generate structured reports from facts')
ON CONFLICT (name) DO NOTHING;

-- ─── reminders ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reminders (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES users(id),
  telegram_id BIGINT NOT NULL,
  content     TEXT NOT NULL,
  remind_at   TIMESTAMPTZ NOT NULL,
  notified_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_reminders_pending ON reminders (remind_at) WHERE notified_at IS NULL;

-- ─── user_behavior_patterns ───────────────────────────
CREATE TABLE IF NOT EXISTS user_behavior_patterns (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES users(id) UNIQUE,
  open_log            JSONB NOT NULL DEFAULT '[]',
  dominant_mode       TEXT,
  pattern_confidence  FLOAT DEFAULT 0,
  last_calculated_at  TIMESTAMPTZ,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ajino v6 — Phase 1: Structured Memory Foundation
-- Migration: add structured fields to memory table
-- IDEMPOTENT — safe to run multiple times
-- ADDITIVE — no DROP, no data loss

-- 1. Add structured fields
ALTER TABLE memory ADD COLUMN IF NOT EXISTS inject BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE memory ADD COLUMN IF NOT EXISTS review_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE memory ADD COLUMN IF NOT EXISTS confidence_score REAL NOT NULL DEFAULT 0.7;
ALTER TABLE memory ADD COLUMN IF NOT EXISTS entity_tags TEXT[] DEFAULT '{}';
ALTER TABLE memory ADD COLUMN IF NOT EXISTS fact_type TEXT NOT NULL DEFAULT 'observation';
ALTER TABLE memory ADD COLUMN IF NOT EXISTS freshness_score REAL NOT NULL DEFAULT 1.0;

-- 2. Add constraints (idempotent via DO block)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_review_status') THEN
    ALTER TABLE memory ADD CONSTRAINT chk_review_status
      CHECK (review_status IN ('pending', 'reviewed', 'excluded', 'edited'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_confidence_score') THEN
    ALTER TABLE memory ADD CONSTRAINT chk_confidence_score
      CHECK (confidence_score >= 0.0 AND confidence_score <= 1.0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_freshness_score') THEN
    ALTER TABLE memory ADD CONSTRAINT chk_freshness_score
      CHECK (freshness_score >= 0.0 AND freshness_score <= 1.0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_fact_type') THEN
    ALTER TABLE memory ADD CONSTRAINT chk_fact_type
      CHECK (fact_type IN ('observation', 'decision', 'commitment', 'insight', 'risk', 'question'));
  END IF;
END $$;

-- 3. Index for common queries
CREATE INDEX IF NOT EXISTS idx_memory_review_status ON memory (review_status);
CREATE INDEX IF NOT EXISTS idx_memory_inject ON memory (inject);
CREATE INDEX IF NOT EXISTS idx_memory_fact_type ON memory (fact_type);

-- 4. Update existing canonical rows: set review_status='reviewed'
UPDATE memory SET review_status = 'reviewed' WHERE status = 'canonical' AND review_status = 'pending';

-- 5. Verify
SELECT
  count(*) as total,
  count(*) FILTER (WHERE inject = true) as inject_true,
  count(*) FILTER (WHERE review_status = 'reviewed') as reviewed,
  count(*) FILTER (WHERE review_status = 'pending') as pending_review,
  count(*) FILTER (WHERE confidence_score = 0.7) as default_confidence,
  count(*) FILTER (WHERE fact_type = 'observation') as default_type,
  count(*) FILTER (WHERE freshness_score = 1.0) as default_freshness
FROM memory;

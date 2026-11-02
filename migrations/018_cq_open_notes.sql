-- One row per address for the open-page note. The job also creates this table.
-- Run: node scripts/run-migration.mjs migrations/018_cq_open_notes.sql

CREATE TABLE IF NOT EXISTS cq_open_notes (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL,
  segment TEXT,
  session_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS cq_open_notes_email_idx
  ON cq_open_notes (email);

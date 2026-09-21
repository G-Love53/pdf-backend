-- ConnectQuote funnel events (page load, engagement, intake steps, quote, bind).
-- Run: node scripts/run-migration.mjs migrations/016_cq_events.sql

CREATE TABLE IF NOT EXISTS cq_events (
  id BIGSERIAL PRIMARY KEY,
  session_id UUID NOT NULL,
  cid TEXT,
  src TEXT,
  ch TEXT,
  st SMALLINT,
  segment TEXT NOT NULL,
  state TEXT,
  event TEXT NOT NULL,
  step TEXT,
  meta JSONB,
  user_agent TEXT,
  referrer TEXT,
  is_mobile BOOLEAN,
  suspect_bot BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cq_events_segment_event_created_idx
  ON cq_events (segment, event, created_at);

CREATE INDEX IF NOT EXISTS cq_events_cid_idx ON cq_events (cid);

CREATE INDEX IF NOT EXISTS cq_events_session_id_idx ON cq_events (session_id);

CREATE INDEX IF NOT EXISTS cq_events_created_at_idx ON cq_events (created_at);

-- Lookup for the ConnectQuote ready-to-bind return link.
-- The token lives on the timeline event. This index keeps the page load unique.
-- Run: node scripts/run-migration.mjs migrations/017_ready_to_bind_link.sql
-- The app still works before this index is applied.

CREATE UNIQUE INDEX IF NOT EXISTS idx_ready_to_bind_link_token
  ON timeline_events ((event_payload_json->>'token'))
  WHERE event_type = 'connectquote.ready_to_bind.link'
    AND COALESCE(event_payload_json->>'token', '') <> '';

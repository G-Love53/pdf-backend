-- Example: retry queue for failed outbound webhook_events (send-notification, etc.)
-- Adapt FK / ON DELETE to match Famous; enable RLS for staff/admin SELECT.

CREATE TABLE IF NOT EXISTS public.retry_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_event_id UUID NOT NULL REFERENCES public.webhook_events (id) ON DELETE CASCADE,
  target_function TEXT NOT NULL DEFAULT 'send-notification',
  retry_count INT NOT NULL DEFAULT 0,
  max_retries INT NOT NULL DEFAULT 3,
  next_retry_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  last_error TEXT,
  payload JSONB, -- optional snapshot (Famous includes this)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT retry_queue_status_check CHECK (status IN ('pending', 'processing', 'succeeded', 'failed', 'cancelled'))
);

CREATE INDEX IF NOT EXISTS retry_queue_pending_due_idx
  ON public.retry_queue (next_retry_at ASC)
  WHERE status = 'pending';

CREATE UNIQUE INDEX IF NOT EXISTS retry_queue_one_pending_per_event_idx
  ON public.retry_queue (webhook_event_id)
  WHERE status = 'pending';

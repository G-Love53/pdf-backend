-- Outbound notification / webhook delivery log (public schema)

CREATE TABLE IF NOT EXISTS public.webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  /** e.g. send-notification, request-coi, file-claim */
  channel TEXT,
  /** Edge function name to replay on retry */
  target_function TEXT,
  request_body JSONB,
  status TEXT NOT NULL DEFAULT 'pending',
  response_body TEXT,
  http_status INT,
  error_message TEXT,
  retry_count INT NOT NULL DEFAULT 0,
  max_retries INT NOT NULL DEFAULT 5,
  next_retry_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS webhook_events_created_idx ON public.webhook_events (created_at DESC);
CREATE INDEX IF NOT EXISTS webhook_events_status_idx ON public.webhook_events (status);
CREATE INDEX IF NOT EXISTS webhook_events_type_idx ON public.webhook_events (event_type);

ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS webhook_events_staff ON public.webhook_events;
CREATE POLICY webhook_events_staff
  ON public.webhook_events FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (p.role IN ('admin', 'staff') OR p.is_staff = TRUE)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (p.role IN ('admin', 'staff') OR p.is_staff = TRUE)
    )
  );

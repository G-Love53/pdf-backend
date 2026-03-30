-- Bulk email campaigns

CREATE TABLE IF NOT EXISTS public.campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  template_id UUID REFERENCES public.email_templates (id) ON DELETE SET NULL,
  recipient_filter JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'draft',
  sent_count INT NOT NULL DEFAULT 0,
  failed_count INT NOT NULL DEFAULT 0,
  total_recipients INT NOT NULL DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS campaigns_created_idx ON public.campaigns (created_at DESC);

ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS campaigns_admin ON public.campaigns;
CREATE POLICY campaigns_admin
  ON public.campaigns FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('admin', 'staff')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('admin', 'staff')
    )
  );

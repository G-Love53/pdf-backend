-- Configurable notification templates (run in Supabase SQL)

CREATE TABLE IF NOT EXISTS public.email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL,
  /** Matches send-notification new_status (e.g. approved, denied, completed, settlement_set) */
  status_trigger TEXT NOT NULL,
  subject_template TEXT NOT NULL,
  /** HTML body; allow placeholders e.g. {{reference_number}}, {{extra_context}} */
  body_template TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (entity_type, status_trigger)
);

CREATE INDEX IF NOT EXISTS email_templates_lookup_idx
  ON public.email_templates (entity_type, status_trigger)
  WHERE is_active = TRUE;

ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS email_templates_staff_all ON public.email_templates;
CREATE POLICY email_templates_staff_all
  ON public.email_templates FOR ALL
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

COMMENT ON TABLE public.email_templates IS 'Resend HTML templates for send-notification; edge function resolves by entity_type + status_trigger.';

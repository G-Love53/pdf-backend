-- Claim assignment (webhook auto-assign + admin manual assign UI)

ALTER TABLE public.claims
  ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES public.profiles (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS claims_assigned_to_idx ON public.claims (assigned_to);
CREATE INDEX IF NOT EXISTS claims_unassigned_idx ON public.claims (created_at DESC)
  WHERE assigned_to IS NULL;

-- Optional: seed for round-robin cursor (app_settings schema may differ)
-- INSERT INTO public.app_settings (key, value) VALUES ('claim_assignment_rr_index', '0')
-- ON CONFLICT DO NOTHING;

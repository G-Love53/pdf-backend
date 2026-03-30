-- Run in Supabase SQL Editor (or Famous migration) when ready.

ALTER TABLE public.claims
  ADD COLUMN IF NOT EXISTS settlement_amount NUMERIC(14, 2),
  ADD COLUMN IF NOT EXISTS settlement_date DATE;

COMMENT ON COLUMN public.claims.settlement_amount IS 'Actual payout / settled amount (distinct from estimated_amount).';
COMMENT ON COLUMN public.claims.settlement_date IS 'Date settlement was recorded.';

-- Carriers catalog + link on policies (run in Supabase SQL editor)

CREATE TABLE IF NOT EXISTS public.carriers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  logo_url TEXT,
  segments TEXT[] NOT NULL DEFAULT '{}',
  rating NUMERIC(3, 2),
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS carriers_segments_gin ON public.carriers USING GIN (segments);
CREATE INDEX IF NOT EXISTS carriers_active_idx ON public.carriers (is_active);

ALTER TABLE public.policies
  ADD COLUMN IF NOT EXISTS carrier_id UUID REFERENCES public.carriers (id);

COMMENT ON TABLE public.carriers IS 'Quote/bind carrier options; filter by segment.';

-- RLS (adjust to your auth model)
ALTER TABLE public.carriers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS carriers_read_authenticated ON public.carriers;
CREATE POLICY carriers_read_authenticated
  ON public.carriers FOR SELECT
  TO authenticated
  USING (is_active = TRUE);

-- Optional: service role full access for admin seed scripts

-- Seed (run once; delete rows first if re-seeding)
INSERT INTO public.carriers (name, logo_url, segments, rating, description, is_active)
VALUES
  ('Sample Carrier A', 'https://placehold.co/120x40?text=Carrier+A', ARRAY['bar', 'plumber']::text[], 4.5, 'Commercial package focus', TRUE),
  ('Sample Carrier B', 'https://placehold.co/120x40?text=Carrier+B', ARRAY['bar', 'roofer']::text[], 4.2, 'Construction & trades', TRUE),
  ('Sample Carrier C', 'https://placehold.co/120x40?text=Carrier+C', ARRAY['bar']::text[], 4.8, 'General liability specialist', TRUE),
  ('Sample Carrier D', 'https://placehold.co/120x40?text=Carrier+D', ARRAY['plumber', 'roofer']::text[], 4.0, 'SMB programs', TRUE);

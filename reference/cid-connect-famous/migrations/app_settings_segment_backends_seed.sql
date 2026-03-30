-- Seed per-segment backend base URLs (Famous app_settings).
-- RSS default: same CID-PDF-API host for all segments; change only if you intentionally split backends.
-- Adapt column types: value as JSONB string or text URL.

-- JSONB value storing a JSON string (Supabase often stores scalars this way)
INSERT INTO public.app_settings (key, value)
VALUES
  ('segment_backend_bar', to_jsonb('https://cid-pdf-api.onrender.com'::text)),
  ('segment_backend_plumber', to_jsonb('https://cid-pdf-api.onrender.com'::text)),
  ('segment_backend_roofer', to_jsonb('https://cid-pdf-api.onrender.com'::text)),
  ('segment_backend_hvac', to_jsonb('https://cid-pdf-api.onrender.com'::text))
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- If your table uses TEXT instead of JSONB for `value`, use:
-- INSERT INTO public.app_settings (key, value)
-- VALUES
--   ('segment_backend_bar', 'https://cid-pdf-api.onrender.com'),
--   ...
-- ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

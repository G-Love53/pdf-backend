-- Optional: record how check-renewals was scheduled (adapt to your app_settings column types).
-- If keys already exist, merge manually.

-- Example A — key/value as text (adjust table name and columns)
-- INSERT INTO public.app_settings (key, value)
-- VALUES
--   ('renewal_cron_schedule_method', 'dashboard'),
--   ('renewal_cron_expression', '0 8 * * *'),
--   ('renewal_cron_schedule_note', 'Supabase Dashboard → Edge Functions → check-renewals → Schedules (daily 08:00 UTC)')
-- ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- Example B — pg_cron + pg_net (document only; do not store raw service role keys in rows)
-- renewal_cron_schedule_method = 'pg_cron'
-- renewal_cron_schedule_note = 'cron.schedule daily-renewal-check; net.http_post to .../functions/v1/check-renewals'

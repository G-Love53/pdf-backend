-- KB v0 seed for Connect API (/api/connect/knowledge/*)
-- Run AFTER 007_connect_api.sql on Render cid-postgres.
--
-- carrier_knowledge.carrier_slug MUST exist in carriers.slug (FK).
-- Policy carrier_name is matched to carriers.name via ILIKE in connectApi resolveCarrierSlug;
-- if no match, the API falls back to a slugified carrier_name (alphanumeric only, lowercased).
--
-- Idempotent: removes prior rows tagged source_label = 'KB v0 seed' then re-inserts.

DO $preflight$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'carrier_knowledge'
  ) THEN
    RAISE EXCEPTION
      'Missing table carrier_knowledge. Apply pdf-backend/migrations/007_connect_api.sql on this database first (same External URL), then run 008_kb_v0_seed.sql again.';
  END IF;
END
$preflight$;

BEGIN;

DELETE FROM carrier_knowledge WHERE source_label = 'KB v0 seed';

-- -----------------------------------------------------------------------------
-- Carriers (minimal v0 — extend names to match real policies.carrier_name strings)
-- -----------------------------------------------------------------------------
INSERT INTO carriers (slug, name, active)
VALUES
  ('cidinsurancepartners', 'CID Insurance Partners', true),
  ('samplecarrier', 'Sample Carrier Insurance', true)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  active = EXCLUDED.active,
  updated_at = NOW();

-- -----------------------------------------------------------------------------
-- Knowledge rows (is_published = true; segment NULL = all segments)
-- Search uses to_tsvector on topic || content — include plain English keywords users may ask.
-- category 'coverage_options' is used by GET /api/connect/knowledge/coverages
-- -----------------------------------------------------------------------------
INSERT INTO carrier_knowledge (
  carrier_slug,
  document_id,
  category,
  topic,
  content,
  segment,
  tags,
  source_label,
  is_published
)
VALUES
  (
    'cidinsurancepartners',
    NULL,
    'coverage_options',
    'General liability overview',
    'General liability insurance helps protect your business from claims of bodily injury, property damage, and personal injury arising from your operations. Typical limits include $1,000,000 per occurrence. Ask your agent to confirm your declarations page limits and any endorsements.',
    NULL,
    ARRAY['gl', 'liability', 'limits'],
    'KB v0 seed',
    true
  ),
  (
    'cidinsurancepartners',
    NULL,
    'coverage_options',
    'Property and equipment',
    'Commercial property coverage can apply to your building, contents, tools, and equipment depending on your policy form. Deductibles and covered causes of loss vary; review your policy for named perils vs special form.',
    NULL,
    ARRAY['property', 'equipment', 'deductible'],
    'KB v0 seed',
    true
  ),
  (
    'cidinsurancepartners',
    NULL,
    'faq',
    'How to request a certificate of insurance (COI)',
    'You can request a certificate of insurance (COI) when a third party needs proof of coverage. Provide the certificate holder legal name and address. Your agent or our service team can issue or update COIs subject to policy terms.',
    NULL,
    ARRAY['coi', 'certificate', 'holder'],
    'KB v0 seed',
    true
  ),
  (
    'samplecarrier',
    NULL,
    'coverage_options',
    'Workers compensation basics',
    'Workers compensation provides benefits for work-related injuries and illnesses as required by state law. Class codes and payroll drive premium. This is general information only; refer to your state filing and policy.',
    NULL,
    ARRAY['workers comp', 'payroll', 'class code'],
    'KB v0 seed',
    true
  );

COMMIT;

-- Optional: verify
-- SELECT slug, name FROM carriers ORDER BY slug;
-- SELECT carrier_slug, category, topic, is_published FROM carrier_knowledge ORDER BY carrier_slug, category, topic;

-- Coterie KB — Step 1: carrier row + appetite / instant-quote eligibility
-- Run AFTER 007_connect_api.sql (+ 008 optional) on Render cid-postgres.
--
-- Chat retrieval: carrier_slug = coterie (policies may show Spinnaker — see coterieCarrierKb.js).
-- Idempotent: DELETE rows with source_label = 'Coterie KB step1 appetite' then re-insert.

DO $preflight$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'carrier_knowledge'
  ) THEN
    RAISE EXCEPTION
      'Missing carrier_knowledge. Apply migrations/007_connect_api.sql first.';
  END IF;
END
$preflight$;

BEGIN;

DELETE FROM carrier_knowledge WHERE source_label = 'Coterie KB step1 appetite';

INSERT INTO carriers (slug, name, active)
VALUES
  ('coterie', 'Coterie Insurance', true),
  ('spinnaker', 'Spinnaker', true)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  active = EXCLUDED.active,
  updated_at = NOW();

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
    'coterie',
    NULL,
    'appetite',
    'Electrical contractors — Colorado instant quote availability',
    'For electrical contracting as the primary business in Colorado, Coterie instant quote (ConnectQuote) typically offers General Liability and Business Owners Policy (BOP). Individual businesses can still be declined by digital underwriting. This describes appetite for the instant API path — not a guarantee of bind until quote and payment succeed.',
    'electrical',
    ARRAY['segment:electrical', 'state:CO', 'product:BOP', 'product:GL', 'instant:true', 'layer:reference', 'source:appetite_checker'],
    'Coterie KB step1 appetite',
    true
  ),
  (
    'coterie',
    NULL,
    'appetite',
    'Electrical — ineligible activity: solar panel work',
    'Solar panel installation or repair as a business activity is not eligible for Coterie instant quote for electrical contractors. If the business performs solar work, do not use the instant quote path — use a traditional submission for full underwriting review.',
    'electrical',
    ARRAY['segment:electrical', 'knockout:true', 'instant:false', 'solar', 'ineligible', 'layer:reference', 'source:appetite_checker'],
    'Coterie KB step1 appetite',
    true
  ),
  (
    'coterie',
    NULL,
    'appetite',
    'Electrical — ineligible activity: transmission line work',
    'Electrical transmission line work is not eligible for Coterie instant quote for electrical contractors. Businesses performing this work should not proceed on the instant quote rail.',
    'electrical',
    ARRAY['segment:electrical', 'knockout:true', 'instant:false', 'transmission', 'ineligible', 'layer:reference', 'source:appetite_checker'],
    'Coterie KB step1 appetite',
    true
  ),
  (
    'coterie',
    NULL,
    'appetite',
    'Electrical — ineligible activity: airport runway lighting',
    'Airport runway lighting contracting is not eligible for Coterie instant quote for electrical contractors.',
    'electrical',
    ARRAY['segment:electrical', 'knockout:true', 'instant:false', 'airport', 'ineligible', 'layer:reference', 'source:appetite_checker'],
    'Coterie KB step1 appetite',
    true
  ),
  (
    'coterie',
    NULL,
    'appetite',
    'Electrical — ineligible activity: traffic signal work',
    'Traffic signal installation or maintenance is not eligible for Coterie instant quote for electrical contractors.',
    'electrical',
    ARRAY['segment:electrical', 'knockout:true', 'instant:false', 'traffic', 'signal', 'ineligible', 'layer:reference', 'source:appetite_checker'],
    'Coterie KB step1 appetite',
    true
  ),
  (
    'coterie',
    NULL,
    'appetite',
    'Electrical — ineligible activity: railroad signal work',
    'Railroad signal work is not eligible for Coterie instant quote for electrical contractors.',
    'electrical',
    ARRAY['segment:electrical', 'knockout:true', 'instant:false', 'railroad', 'signal', 'ineligible', 'layer:reference', 'source:appetite_checker'],
    'Coterie KB step1 appetite',
    true
  ),
  (
    'coterie',
    NULL,
    'appetite',
    'Contractor BOP eligibility — employees and revenue limits',
    'Coterie BOP appetite for contractors generally allows up to 15 employees and up to $5 million gross revenue for instant quote eligibility. Other trades may allow higher limits. These are marketing/appetite guidelines — your quote response and declarations page govern what was actually offered and bound.',
    NULL,
    ARRAY['product:BOP', 'contractor', 'employees', 'revenue', 'eligibility', 'layer:reference', 'source:bop_brochure_dec_2025'],
    'Coterie KB step1 appetite',
    true
  ),
  (
    'coterie',
    NULL,
    'appetite',
    'BOP eligibility — general small business limits',
    'Coterie BOP appetite for many non-contractor classes allows up to 50 employees and up to $10 million revenue. Contractor classes use lower caps (often 15 employees and $5 million revenue). Reference only until confirmed on your quote or policy.',
    NULL,
    ARRAY['product:BOP', 'eligibility', 'employees', 'revenue', 'layer:reference', 'source:bop_brochure_dec_2025'],
    'Coterie KB step1 appetite',
    true
  ),
  (
    'coterie',
    NULL,
    'appetite',
    'Fitness — yoga studio instant quote (Colorado)',
    'Yoga studios on the ConnectQuote instant path typically receive General Liability (GL) only through the API — not BOP or professional liability on instant bind. Revenue, payroll, and employee count are still required for rating.',
    'fitness',
    ARRAY['segment:fitness', 'state:CO', 'product:GL', 'yoga', 'instant:true', 'layer:reference'],
    'Coterie KB step1 appetite',
    true
  ),
  (
    'coterie',
    NULL,
    'appetite',
    'Fitness — pilates studio instant quote (Colorado)',
    'Pilates and mind-body studios may qualify for BOP and/or GL on Coterie instant quote when the owner operates the business. Non-owner scenarios may be limited to GL on the instant path.',
    'fitness',
    ARRAY['segment:fitness', 'state:CO', 'product:BOP', 'product:GL', 'pilates', 'instant:true', 'layer:reference'],
    'Coterie KB step1 appetite',
    true
  ),
  (
    'coterie',
    NULL,
    'appetite',
    'Professional liability (PL) — not on ConnectQuote instant bind',
    'Coterie offers professional liability for many industries, but PL is generally not available on the ConnectQuote embedded instant bind API for most pilot segments. PL may require a traditional agent quote workflow. Do not tell customers they have PL in force unless it appears on their bound policy documents.',
    NULL,
    ARRAY['product:PL', 'instant:false', 'upsell:traditional', 'layer:reference', 'source:coterie_faq'],
    'Coterie KB step1 appetite',
    true
  ),
  (
    'coterie',
    NULL,
    'appetite',
    'Employment Practices Liability (EPL) — endorsement only',
    'Coterie Employment Practices Liability (EPL) is offered as an endorsement on General Liability or BOP policies — not as a standalone instant product. EPL covers discrimination, harassment, wrongful termination, and related employment claims. Availability on a specific instant quote may vary; confirm on the policy or ask for an endorsement quote if not shown in coverage details.',
    NULL,
    ARRAY['product:EPL', 'endorsement:true', 'instant:false', 'layer:reference', 'source:coterie_epl_faq'],
    'Coterie KB step1 appetite',
    true
  ),
  (
    'coterie',
    NULL,
    'faq',
    'Reference vs bound coverage — how Connect answers coverage questions',
    'Connect coverage chat uses your bound policy summary and declarations when available. Carrier knowledge articles (like this one) are reference education about what Coterie products can include — they are not proof you purchased a specific limit or endorsement. Always distinguish: "Your policy shows…" versus "Coterie BOP policies can include…".',
    NULL,
    ARRAY['layer:reference', 'chat:policy', 'instant:false'],
    'Coterie KB step1 appetite',
    true
  );

COMMIT;

-- Verify:
-- SELECT slug, name FROM carriers WHERE slug IN ('coterie', 'spinnaker');
-- SELECT topic, segment FROM carrier_knowledge WHERE source_label = 'Coterie KB step1 appetite';

-- Coterie KB — Step 3: BOP base property coverages & sublimits (reference)
-- Run AFTER 007_connect_api.sql on Render cid-postgres.
-- Idempotent: DELETE rows with source_label = 'Coterie KB step3 bop property' then re-insert.
--
-- Apply:
--   cd /Users/newmacminim4/GitHub/pdf-backend
--   export DATABASE_URL='postgresql://...'
--   node scripts/run-migration.mjs migrations/011_coterie_kb_step3_bop_property.sql

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

DELETE FROM carrier_knowledge WHERE source_label = 'Coterie KB step3 bop property';

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
    'coverage_options',
    'BOP property package — overview',
    'A Businessowners Policy (BOP) combines commercial property and general liability. Property coverage typically applies to building (when owned), business personal property (BPP — tools, equipment, inventory, furniture), and business income after a covered loss. Coterie BOP uses Special Causes of Loss form BP 00 03 with replacement cost valuation on building and BPP and business income on an actual loss sustained (ALS) basis. Your declarations and endorsements define what is actually insured.',
    NULL,
    ARRAY['product:BOP', 'property', 'overview', 'layer:reference', 'source:bop_brochure_dec_2025'],
    'Coterie KB step3 bop property',
    true
  ),
  (
    'coterie',
    NULL,
    'coverage_options',
    'Building and BPP maximums on instant quote',
    'On Coterie instant quote, building total insured value can be offered up to about $1,000,000 for owned locations. Business personal property (BPP) limits on intake are typically offered from $5,000 up to $500,000. Leased locations require BPP limits on ConnectQuote (business personal property at the rented premises). Owned buildings also require a building limit. These are quote inputs — your bound policy shows the limits actually purchased.',
    NULL,
    ARRAY['product:BOP', 'property', 'building', 'bpp', 'limits', 'instant:true', 'connectquote', 'layer:reference', 'source:bop_brochure_dec_2025'],
    'Coterie KB step3 bop property',
    true
  ),
  (
    'coterie',
    NULL,
    'coverage_options',
    'Contractor tools and BPP — important exclusion',
    'Contractor tools are generally not included in standard Coterie BPP limits or in many base property enhancement sublimits. Electricians and other contractors should not assume hand tools, power tools, or equipment in transit are fully covered up to the main BPP limit without checking declarations. Increased limits for contractor tools may be available through property enhancement endorsements (Silver, Gold, or Platinum tiers). Ask for your specific policy or quote proposal.',
    'electrical',
    ARRAY['product:BOP', 'property', 'tools', 'contractor', 'bpp', 'exclusion', 'segment:electrical', 'layer:reference', 'source:bop_brochure_dec_2025'],
    'Coterie KB step3 bop property',
    true
  ),
  (
    'coterie',
    NULL,
    'coverage_options',
    'Property deductible (BPP) on ConnectQuote',
    'ConnectQuote lets customers select a BPP property deductible — commonly $500, $1,000, $2,500, or $5,000 (default on intake is often $1,000). This deductible applies to property losses as defined in the policy form, not necessarily to every liability or sublimit. Separate sublimits may have their own deductibles noted in the policy.',
    NULL,
    ARRAY['product:BOP', 'property', 'deductible', 'bpp', 'instant:true', 'connectquote', 'layer:reference'],
    'Coterie KB step3 bop property',
    true
  ),
  (
    'coterie',
    NULL,
    'coverage_options',
    'Coinsurance on building and BPP',
    'Coterie BOP property coverage often applies an 80% coinsurance requirement on building and business personal property. If the limit of insurance is less than 80% of the value at time of loss, the claim payment may be reduced. This is a standard commercial property concept — confirm coinsurance percentages and agreed value options on your declarations.',
    NULL,
    ARRAY['product:BOP', 'property', 'coinsurance', 'building', 'bpp', 'layer:reference', 'source:bop_brochure_dec_2025'],
    'Coterie KB step3 bop property',
    true
  ),
  (
    'coterie',
    NULL,
    'coverage_options',
    'Business income — actual loss sustained (ALS)',
    'Coterie base BOP includes business income and extra expense coverage on an actual loss sustained basis after a covered property loss. Civil authority coverage may extend up to four weeks in the base form. Extended business income and higher sublimits may increase with property enhancement packages (Silver, Gold, Platinum). Policy documents govern waiting periods and covered causes.',
    NULL,
    ARRAY['product:BOP', 'property', 'business_income', 'ALS', 'layer:reference', 'source:bop_brochure_dec_2025'],
    'Coterie KB step3 bop property',
    true
  ),
  (
    'coterie',
    NULL,
    'coverage_options',
    'Base sublimit — newly acquired or constructed property',
    'In the base Coterie BOP property form, newly acquired or constructed property is often covered up to $250,000 (with time limits for reporting new locations or construction). Enhancement tiers may increase building and BPP sublimits and extension periods. This protects short-term gaps when you add a location or property — not a substitute for scheduling all values on the policy.',
    NULL,
    ARRAY['product:BOP', 'property', 'sublimit', 'newly_acquired', '250000', 'tier:base', 'layer:reference', 'source:bop_brochure_dec_2025'],
    'Coterie KB step3 bop property',
    true
  ),
  (
    'coterie',
    NULL,
    'coverage_options',
    'Base sublimit — outdoor property and signs',
    'Base BOP property extensions often include outdoor property around $2,500 and outdoor signs about $1,000 per sign (detached). Higher limits may apply under Silver, Gold, or Platinum property enhancement endorsements. Outdoor property can include items like fences, antennas, and landscaping subject to policy definitions and exclusions.',
    NULL,
    ARRAY['product:BOP', 'property', 'sublimit', 'outdoor', 'signs', 'tier:base', 'layer:reference', 'source:bop_brochure_dec_2025'],
    'Coterie KB step3 bop property',
    true
  ),
  (
    'coterie',
    NULL,
    'coverage_options',
    'Base sublimit — personal property off premises and in transit',
    'Base Coterie BOP often covers personal property off premises or in transit up to about $10,000. BPP temporarily in portable storage units may also be limited around $10,000 in the base form. Contractor tools may be treated differently — do not assume full BPP limits apply to tools off premises without checking endorsements and exclusions.',
    NULL,
    ARRAY['product:BOP', 'property', 'sublimit', 'off_premises', 'transit', 'storage', 'tier:base', 'layer:reference', 'source:bop_brochure_dec_2025'],
    'Coterie KB step3 bop property',
    true
  ),
  (
    'coterie',
    NULL,
    'coverage_options',
    'Base sublimit — accounts receivable and valuable papers',
    'Base BOP property extensions often include accounts receivable on premises up to $10,000 and off premises up to $5,000, and valuable papers and records on premises up to $10,000 / off premises up to $5,000. Property enhancement tiers (Silver, Gold, Platinum) may raise these to blanket limits ($150k / $350k / $500k in Coterie comparison materials). Reference only until confirmed on your policy.',
    NULL,
    ARRAY['product:BOP', 'property', 'sublimit', 'accounts_receivable', 'valuable_papers', 'tier:base', 'layer:reference', 'source:bop_brochure_dec_2025'],
    'Coterie KB step3 bop property',
    true
  ),
  (
    'coterie',
    NULL,
    'coverage_options',
    'Base sublimit — electronic data and computer interruption',
    'Base Coterie BOP often includes electronic data up to $10,000 and interruption of computer operations up to $10,000 as property-related extensions. Cyber liability and broad cyber events are generally excluded or limited — Coterie offers separate cyber products. Do not treat these sublimits as full cyber insurance.',
    NULL,
    ARRAY['product:BOP', 'property', 'sublimit', 'electronic_data', 'computer', 'cyber', 'tier:base', 'layer:reference', 'source:bop_brochure_dec_2025'],
    'Coterie KB step3 bop property',
    true
  ),
  (
    'coterie',
    NULL,
    'coverage_options',
    'Base sublimit — fire department charge and extinguisher recharge',
    'Base BOP property coverage often includes fire department service charge up to $2,500 and fire extinguisher systems recharge expense up to $5,000 after a covered loss. These are common small commercial property extensions that pay municipal charges or system recharge costs — not a substitute for maintaining fire protection systems.',
    NULL,
    ARRAY['product:BOP', 'property', 'sublimit', 'fire', 'tier:base', 'layer:reference', 'source:bop_brochure_dec_2025'],
    'Coterie KB step3 bop property',
    true
  ),
  (
    'coterie',
    NULL,
    'coverage_options',
    'Base sublimit — forgery, money and securities, dependent properties',
    'Base Coterie BOP extensions may include forgery or alteration around $2,500, money and securities on/off premises around $5,000 combined, and business income from dependent properties around $5,000. Higher limits may be available through enhancement endorsements. Crime-related losses may also have exclusions — read policy conditions for employee dishonesty (often requires an add-on).',
    NULL,
    ARRAY['product:BOP', 'property', 'sublimit', 'forgery', 'money', 'dependent_properties', 'tier:base', 'layer:reference', 'source:bop_brochure_dec_2025'],
    'Coterie KB step3 bop property',
    true
  ),
  (
    'coterie',
    NULL,
    'coverage_options',
    'Leased vs owned location on ConnectQuote',
    'ConnectQuote asks whether the business leases or owns its location. Leased commercial space requires a BPP limit (tools, equipment, tenant improvements, inventory at the premises) but not a building limit. Owned building requires both building limit (up to about $1M) and BPP. Home-based businesses use a home occupancy option. Location type drives which Coterie API fields are sent on quote.',
    NULL,
    ARRAY['product:BOP', 'property', 'leased', 'owned', 'occupancy', 'instant:true', 'connectquote', 'layer:reference'],
    'Coterie KB step3 bop property',
    true
  ),
  (
    'coterie',
    NULL,
    'coverage_options',
    'Property enhancement tiers — Base vs Silver Gold Platinum',
    'Coterie offers property enhancement endorsement packages above the base BOP form: Base (standard sublimits), Silver, Gold, and Platinum with higher blanket limits on many extensions (accounts receivable, computer equipment, debris removal, outdoor property, etc.). Instant quotes may default to a mid tier such as Gold — confirm with Coterie or your quote proposal. Step 4 KB will detail tier comparisons; this row covers base form only.',
    NULL,
    ARRAY['product:BOP', 'property', 'tier:base', 'tier:gold', 'enhancement', 'layer:reference', 'source:bop_brochure_dec_2025', 'source:coverage_comparison'],
    'Coterie KB step3 bop property',
    true
  );

COMMIT;

-- Verify:
-- SELECT COUNT(*) FROM carrier_knowledge WHERE source_label = 'Coterie KB step3 bop property';
-- Expected: 15

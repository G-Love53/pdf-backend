-- Coterie KB — Step 2: General Liability limits & liability structure (reference)
-- Run AFTER 007_connect_api.sql on Render cid-postgres.
-- Idempotent: DELETE rows with source_label = 'Coterie KB step2 gl limits' then re-insert.
--
-- Apply (same as step 1):
--   cd /Users/newmacminim4/GitHub/pdf-backend
--   export DATABASE_URL='postgresql://...'
--   node scripts/run-migration.mjs migrations/010_coterie_kb_step2_gl_limits.sql

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

DELETE FROM carrier_knowledge WHERE source_label = 'Coterie KB step2 gl limits';

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
    'General liability — what it covers (overview)',
    'General liability (GL) helps protect a business when others claim bodily injury, property damage, or personal and advertising injury from your operations, products, or completed work. It typically includes legal defense costs. GL does not automatically include workers compensation, commercial auto, cyber, professional liability, employment practices liability, or liquor liability — each needs its own coverage on the policy. Reference education only; your declarations page shows what you actually purchased.',
    NULL,
    ARRAY['product:GL', 'liability', 'overview', 'layer:reference', 'source:bop_brochure_dec_2025', 'source:coterie_faq'],
    'Coterie KB step2 gl limits',
    true
  ),
  (
    'coterie',
    NULL,
    'coverage_options',
    'GL each occurrence limit — available options',
    'Coterie GL each occurrence limit options on instant quote are typically $300,000, $500,000, $1,000,000, or $2,000,000. This is the most the carrier pays for covered bodily injury, property damage, and personal/advertising injury in any one occurrence. ConnectQuote defaults to $1,000,000 unless the customer selects another option. Your bound policy or quote summary shows the limit actually in force.',
    NULL,
    ARRAY['product:GL', 'limits', 'occurrence', 'gl_limit', 'layer:reference', 'source:bop_brochure_dec_2025'],
    'Coterie KB step2 gl limits',
    true
  ),
  (
    'coterie',
    NULL,
    'coverage_options',
    'GL aggregate limits — general and products-completed operations',
    'Coterie typically sets GL general aggregate and products/completed operations aggregate at two times the each-occurrence limit (industry-standard structure). Example: $1,000,000 occurrence often pairs with $2,000,000 aggregates; at $2,000,000 occurrence, aggregates may reach $4,000,000. The general aggregate is the most paid in the policy period for most covered claims; the products/completed operations aggregate applies to products and completed-operations hazards. Confirm exact numbers on your quote or declarations.',
    NULL,
    ARRAY['product:GL', 'limits', 'aggregate', 'products_completed_ops', 'layer:reference', 'source:bop_brochure_dec_2025'],
    'Coterie KB step2 gl limits',
    true
  ),
  (
    'coterie',
    NULL,
    'coverage_options',
    'Contractor GL cap — Colorado and other restricted states',
    'For contractor classes (including electrical, plumbing, and HVAC), Coterie does not offer $2,000,000 each occurrence or $4,000,000 aggregate GL limits in California, Colorado, Florida, New York, or Texas. Maximum instant-quote GL occurrence in those states is typically $1,000,000 with $2,000,000 aggregate. The same cap applies when liquor liability is selected. ConnectQuote intake enforces this cap automatically for contractor segments.',
    NULL,
    ARRAY['product:GL', 'limits', 'contractor', 'state:CO', 'state:CA', 'state:FL', 'state:NY', 'state:TX', 'layer:reference', 'source:bop_brochure_dec_2025'],
    'Coterie KB step2 gl limits',
    true
  ),
  (
    'coterie',
    NULL,
    'coverage_options',
    'ConnectQuote default GL limits (Colorado pilot)',
    'On ConnectQuote intake, GL defaults are pre-selected to $1,000,000 each occurrence and $2,000,000 general aggregate where allowed. Customers can change limits on the form before quoting. For Colorado contractor segments, $2,000,000 occurrence is not offered. These defaults are convenience on intake — the bindable quote and policy documents are the source of truth for what was priced and bound.',
    NULL,
    ARRAY['product:GL', 'limits', 'instant:true', 'state:CO', 'connectquote', 'layer:reference'],
    'Coterie KB step2 gl limits',
    true
  ),
  (
    'coterie',
    NULL,
    'coverage_options',
    'Medical expenses — per person sublimit',
    'Coterie BOP and GL policies include a medical expenses sublimit, typically $5,000 per person. This is the most the carrier pays regardless of fault for medical costs from accidental bodily injury caused by business activities. It is separate from the each-occurrence GL limit. Check your policy declarations for the exact amount on your policy.',
    NULL,
    ARRAY['product:GL', 'product:BOP', 'medical', 'sublimit', '5000', 'layer:reference', 'source:bop_brochure_dec_2025'],
    'Coterie KB step2 gl limits',
    true
  ),
  (
    'coterie',
    NULL,
    'coverage_options',
    'Damage to premises rented to you',
    'Coterie includes coverage for fire damage to premises rented to or temporarily occupied by the insured, often up to $1,000,000 any one premises (sometimes labeled "damage to premises rented by you"). This is a common GL/BOP liability extension for leased commercial space. Your declarations page shows whether this limit applies and the dollar amount on your policy.',
    NULL,
    ARRAY['product:GL', 'product:BOP', 'leased', 'premises', 'fire', 'layer:reference', 'source:bop_brochure_dec_2025'],
    'Coterie KB step2 gl limits',
    true
  ),
  (
    'coterie',
    NULL,
    'coverage_options',
    'GL property damage liability deductible',
    'Coterie BOP/GL programs often include a $500 property damage liability deductible that can sometimes be increased if desired. This deductible applies to property damage liability claims as defined in the policy — not to every coverage line. Do not assume the same deductible applies to BPP, building, or other property coverages without checking declarations.',
    NULL,
    ARRAY['product:GL', 'deductible', 'property_damage', '500', 'layer:reference', 'source:coterie_faq'],
    'Coterie KB step2 gl limits',
    true
  ),
  (
    'coterie',
    NULL,
    'coverage_options',
    'What GL does not cover — common gaps',
    'General liability does not cover employee injuries (workers compensation), damage to your own business property (commercial property/BOP property section), professional mistakes (professional liability), employment-related claims (EPL endorsement), intentional acts, or auto liability (commercial auto). Flood and earthquake are generally excluded unless specifically endorsed. Use carrier knowledge for education; only policy documents prove a line is in force.',
    NULL,
    ARRAY['product:GL', 'exclusions', 'gaps', 'workers_comp', 'cyber', 'professional', 'layer:reference', 'source:coterie_faq'],
    'Coterie KB step2 gl limits',
    true
  ),
  (
    'coterie',
    NULL,
    'coverage_options',
    'BOP vs GL-only — liability limits on instant quote',
    'On ConnectQuote, a Businessowners Policy (BOP) bundles property and liability; GL-only quotes include liability without the BOP property package. GL limit options ($300k–$2M occurrence, subject to contractor state caps) apply to both paths. BOP adds business personal property, building (when owned), and property enhancements. Compare premium and coverage needs on intake before binding.',
    NULL,
    ARRAY['product:BOP', 'product:GL', 'instant:true', 'connectquote', 'layer:reference'],
    'Coterie KB step2 gl limits',
    true
  ),
  (
    'coterie',
    NULL,
    'faq',
    'How to read your GL limits on a new policy before dec page',
    'Right after bind, Connect may show quote summary fields such as glLimit and glAggregateLimit from the Coterie bindable quote. Until the declarations page is indexed, treat those as the best available summary — not a replacement for the full policy PDF. If chat cannot find a limit in your policy JSON or PDF excerpts, say it is not shown in current documents yet rather than guessing.',
    NULL,
    ARRAY['product:GL', 'chat:policy', 'declarations', 'layer:reference'],
    'Coterie KB step2 gl limits',
    true
  );

COMMIT;

-- Verify:
-- SELECT COUNT(*) FROM carrier_knowledge WHERE source_label = 'Coterie KB step2 gl limits';
-- Expected: 11

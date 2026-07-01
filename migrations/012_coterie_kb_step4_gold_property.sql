-- Coterie KB — Step 4: Gold property enhancement package (assumed instant-quote default)
-- Run AFTER 007_connect_api.sql on Render cid-postgres.
-- Idempotent: DELETE rows with source_label = 'Coterie KB step4 gold property' then re-insert.
--
-- ASSUMPTION: ConnectQuote instant BOP quotes use Coterie Gold property enhancements unless
-- Coterie confirms otherwise. Chat must still prefer bound policy JSON/PDF over this reference.
--
-- Apply:
--   node scripts/run-migration.mjs migrations/012_coterie_kb_step4_gold_property.sql

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

DELETE FROM carrier_knowledge WHERE source_label = 'Coterie KB step4 gold property';

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
    'Instant BOP quote — assumed Gold property enhancement tier',
    'ConnectQuote instant Coterie BOP quotes are treated as including the Gold property enhancement package unless Coterie or your declarations show a different tier. Gold sits above base form sublimits and below Platinum on many extensions. This is an operational assumption for reference Q&A until confirmed with Coterie or your quote proposal — not proof of coverage until policy documents agree.',
    NULL,
    ARRAY['product:BOP', 'tier:gold', 'instant:true', 'connectquote', 'layer:reference', 'assumed_default', 'source:coverage_comparison'],
    'Coterie KB step4 gold property',
    true
  ),
  (
    'coterie',
    NULL,
    'coverage_options',
    'Gold — blanket property enhancement limits ($350,000)',
    'Under Coterie Gold property enhancements, many extensions share a blanket limit of about $350,000, including accounts receivable (on and off premises), computer equipment, debris removal, and personal property of others (replacement cost). Valuable papers and records on and off premises also rise to about $350,000 blanket under Gold. These amounts are reference limits for the Gold tier — your policy or quote proposal confirms what applied to your account.',
    NULL,
    ARRAY['product:BOP', 'tier:gold', 'blanket', '350000', 'property', 'layer:reference', 'source:coverage_comparison'],
    'Coterie KB step4 gold property',
    true
  ),
  (
    'coterie',
    NULL,
    'coverage_options',
    'Gold — extended business income (12 months)',
    'Gold property enhancements typically extend extended business income to 12 months (base form is often 60 days; Silver about 90 days). Business income from dependent properties, utility services business income, and business income for websites are commonly $50,000 under Gold. Waiting periods and covered causes still follow the policy form.',
    NULL,
    ARRAY['product:BOP', 'tier:gold', 'business_income', 'property', 'layer:reference', 'source:coverage_comparison'],
    'Coterie KB step4 gold property',
    true
  ),
  (
    'coterie',
    NULL,
    'coverage_options',
    'Gold — newly acquired or constructed property',
    'Gold tier typically increases newly acquired or constructed property to about $1,000,000 for building and $500,000 for business personal property, with about 120 days to report (Platinum may allow longer). This helps when you add a location or property mid-term — it does not replace scheduling all locations and values on the policy.',
    NULL,
    ARRAY['product:BOP', 'tier:gold', 'newly_acquired', 'property', 'layer:reference', 'source:coverage_comparison'],
    'Coterie KB step4 gold property',
    true
  ),
  (
    'coterie',
    NULL,
    'coverage_options',
    'Gold — ordinance and law coverage',
    'Gold property enhancements often add ordinance or law coverage not included in the base form: demolition cost about $25,000, increased cost of construction about $50,000, and loss to the undamaged portion of the building up to the building limit. These apply when code requires demolition or upgrade after a covered loss. Confirm on your declarations — base BOP alone may not include these.',
    NULL,
    ARRAY['product:BOP', 'tier:gold', 'ordinance', 'law', 'property', 'layer:reference', 'source:coverage_comparison'],
    'Coterie KB step4 gold property',
    true
  ),
  (
    'coterie',
    NULL,
    'coverage_options',
    'Gold — tenant glass (interior and exterior)',
    'Gold property enhancements typically include tenant glass coverage for interior and exterior glass when you lease space (not included in base or Silver in Coterie comparison materials). Useful for leased commercial tenants with storefront or interior glass exposure. Platinum also includes this tier of coverage.',
    NULL,
    ARRAY['product:BOP', 'tier:gold', 'leased', 'glass', 'tenant', 'property', 'layer:reference', 'source:coverage_comparison'],
    'Coterie KB step4 gold property',
    true
  ),
  (
    'coterie',
    NULL,
    'coverage_options',
    'Gold — sewer backup and sump overflow',
    'Gold includes backup of sewers and drains and sump overflow or sump pump failure coverage (often around $50,000 under Gold/Silver comparison charts). Base BOP may exclude or not include these — a common customer question after water damage. Verify limit and deductible on your policy.',
    NULL,
    ARRAY['product:BOP', 'tier:gold', 'sewer', 'sump', 'water', 'property', 'layer:reference', 'source:coverage_comparison'],
    'Coterie KB step4 gold property',
    true
  ),
  (
    'coterie',
    NULL,
    'coverage_options',
    'Gold — outdoor property, personal effects, and transit',
    'Gold typically raises outdoor property to about $25,000, personal effects to about $60,000, and personal property in transit to about $25,000 (base form sublimits are much lower). Outdoor signs may track building limit under Gold. These are common “small property” questions for contractors and retail tenants.',
    NULL,
    ARRAY['product:BOP', 'tier:gold', 'outdoor', 'transit', 'personal_effects', 'property', 'layer:reference', 'source:coverage_comparison'],
    'Coterie KB step4 gold property',
    true
  ),
  (
    'coterie',
    NULL,
    'coverage_options',
    'Gold — employee dishonesty and forgery',
    'Gold property enhancements often include employee dishonesty (including ERISA compliance language in Coterie materials) around $25,000 and forgery or alteration around $25,000. Base form forgery may be only $2,500. This is not a substitute for a full commercial crime policy for all businesses — check limits and exclusions on your policy.',
    NULL,
    ARRAY['product:BOP', 'tier:gold', 'employee_dishonesty', 'forgery', 'crime', 'property', 'layer:reference', 'source:coverage_comparison'],
    'Coterie KB step4 gold property',
    true
  ),
  (
    'coterie',
    NULL,
    'coverage_options',
    'Gold — included endorsements (pairs and sets, brands and labels)',
    'Gold typically includes coverage extensions that base form may exclude, such as pairs and sets, brands and labels, backup of sewers and drains, and contract penalties (often around $1,000 under Gold). These are property form enhancements — they do not add general liability lines like auto or cyber.',
    NULL,
    ARRAY['product:BOP', 'tier:gold', 'endorsement', 'property', 'layer:reference', 'source:coverage_comparison'],
    'Coterie KB step4 gold property',
    true
  ),
  (
    'coterie',
    NULL,
    'coverage_options',
    'Gold — contractor tools (still limited)',
    'Even with Gold property enhancements, contractor tools may not be fully covered up to the main BPP limit — Coterie brochure notes tools are not included in standard BPP limits or in all enhancement blanket limits; increased limits for contractor tools may require specific endorsements. Gold improves many property sublimits but electricians should still verify tool and equipment coverage on the quote proposal and declarations.',
    'electrical',
    ARRAY['product:BOP', 'tier:gold', 'tools', 'contractor', 'segment:electrical', 'property', 'layer:reference', 'source:bop_brochure_dec_2025', 'source:coverage_comparison'],
    'Coterie KB step4 gold property',
    true
  ),
  (
    'coterie',
    NULL,
    'faq',
    'How to talk about Gold limits in Connect chat before dec page',
    'When a customer asks about property sublimits and the policy JSON does not yet list enhancement tier details, Connect may explain likely Gold-tier reference limits from Coterie materials and note the assumption that instant BOP quotes include Gold enhancements. Always add that actual coverage is governed by the bound policy and quote proposal, and offer to reconcile when documents are available. Never state a specific dollar limit as “your limit” without policy or PDF support.',
    NULL,
    ARRAY['product:BOP', 'tier:gold', 'chat:policy', 'layer:reference', 'assumed_default'],
    'Coterie KB step4 gold property',
    true
  );

COMMIT;

-- Verify:
-- SELECT COUNT(*) FROM carrier_knowledge WHERE source_label = 'Coterie KB step4 gold property';
-- Expected: 12

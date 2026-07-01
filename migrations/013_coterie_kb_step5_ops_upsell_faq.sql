-- Coterie KB — Step 5: claims, COI, support, upsell education (EPL/cyber/PL), plain-English FAQ
-- Run AFTER 007_connect_api.sql on Render cid-postgres.
-- Idempotent: DELETE rows with source_label = 'Coterie KB step5 ops upsell' then re-insert.
--
-- Apply:
--   node scripts/run-migration.mjs migrations/013_coterie_kb_step5_ops_upsell_faq.sql

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

DELETE FROM carrier_knowledge WHERE source_label = 'Coterie KB step5 ops upsell';

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
    'claims',
    'How to report a claim — Coterie FNOL',
    'To report a new loss on a Coterie-backed policy, use the Coterie first notice of loss portal at claims.coterieinsurance.com or email claims@coterieinsurance.com. You can also call Coterie claims at (855) 680-2440. For general policy service questions, Coterie customer experience is (855) 566-1011. Connect can help you start the process — bring your policy number, date of loss, and a short description of what happened.',
    NULL,
    ARRAY['claims', 'fnol', 'report', 'loss', 'layer:reference', 'source:coterie_claims'],
    'Coterie KB step5 ops upsell',
    true
  ),
  (
    'coterie',
    NULL,
    'claims',
    'What information to have when reporting a claim',
    'When reporting a claim, gather: policy number, date and time of loss, location, description of damage or injury, names and contact information for anyone involved, photos if available, and whether emergency services responded. For liability claims, note whether anyone was injured and whether a third party is making a demand. Prompt notice helps the carrier investigate — delays can affect coverage depending on policy conditions.',
    NULL,
    ARRAY['claims', 'fnol', 'checklist', 'layer:reference'],
    'Coterie KB step5 ops upsell',
    true
  ),
  (
    'coterie',
    NULL,
    'faq',
    'Certificate of insurance (COI) — how Connect customers request one',
    'A certificate of insurance (COI) proves coverage to a landlord, general contractor, or client. In Connect you can request a COI with the certificate holder legal name and address. COIs reflect your active policy limits and dates — allow time for issuance. If your policy was just bound, the COI may show summary limits from bind until full declarations are on file.',
    NULL,
    ARRAY['coi', 'certificate', 'holder', 'connect', 'layer:reference'],
    'Coterie KB step5 ops upsell',
    true
  ),
  (
    'coterie',
    NULL,
    'faq',
    'What is a Businessowners Policy (BOP) — plain English',
    'A Businessowners Policy (BOP) bundles general liability and commercial property for many small businesses in one package. Liability covers claims that your business hurt someone or damaged their property; property covers your stuff, and often the building if you own it, after covered events like fire or theft. A BOP is convenient but does not include everything — workers comp, commercial auto, and professional liability are usually separate.',
    NULL,
    ARRAY['product:BOP', 'faq', 'marketing', 'overview', 'layer:reference', 'source:coterie_web'],
    'Coterie KB step5 ops upsell',
    true
  ),
  (
    'coterie',
    NULL,
    'faq',
    'What is general liability (GL) — plain English',
    'General liability helps when someone claims your business caused bodily injury, property damage, or personal and advertising injury — for example a customer slips, or your work damages a client property. It typically pays legal defense and covered settlements up to your policy limits. GL-only quotes cover liability without the BOP property package; you may still need property coverage elsewhere if you have tools, inventory, or a leased build-out to protect.',
    NULL,
    ARRAY['product:GL', 'faq', 'marketing', 'overview', 'layer:reference', 'source:coterie_web'],
    'Coterie KB step5 ops upsell',
    true
  ),
  (
    'coterie',
    NULL,
    'coverage_options',
    'Employment Practices Liability (EPL) — what it covers and how to get it',
    'Employment Practices Liability (EPL) helps with employment-related claims such as discrimination, harassment, wrongful termination, retaliation, and some third-party claims. Coterie offers EPL as an endorsement on BOP or GL — not as a standalone instant product on ConnectQuote. If EPL is not shown in your coverage details, you likely do not have it in force — ask about adding the endorsement through a quote review.',
    NULL,
    ARRAY['product:EPL', 'endorsement', 'upsell', 'instant:false', 'layer:reference', 'source:coterie_epl_faq'],
    'Coterie KB step5 ops upsell',
    true
  ),
  (
    'coterie',
    NULL,
    'coverage_options',
    'Cyber insurance — not included in standard BOP property sublimits',
    'Standard Coterie BOP property extensions for electronic data and computer interruption are small sublimits — not full cyber liability. Base BOP forms exclude broad cyber events. Coterie offers separate cyber products for data breach, ransomware, and related risks. If a customer asks “am I covered for a hack?”, check policy cyber exclusions and cyber limits — do not assume BOP GL or property covers cyber.',
    NULL,
    ARRAY['product:cyber', 'exclusion', 'upsell', 'instant:false', 'layer:reference', 'source:coterie_faq'],
    'Coterie KB step5 ops upsell',
    true
  ),
  (
    'coterie',
    NULL,
    'coverage_options',
    'Professional liability (PL) — traditional quote path',
    'Professional liability (errors and omissions) covers claims that your professional advice or services caused a client financial harm. Coterie offers PL for many industries, but PL is generally not available on the ConnectQuote embedded instant bind API for pilot segments. Customers who need PL should use a full application or agent-assisted quote. Never confirm PL is in force unless it appears on bound policy documents.',
    NULL,
    ARRAY['product:PL', 'upsell', 'instant:false', 'traditional', 'layer:reference', 'source:coterie_web'],
    'Coterie KB step5 ops upsell',
    true
  ),
  (
    'coterie',
    NULL,
    'coverage_options',
    'Workers compensation — not on ConnectQuote instant rail',
    'Workers compensation covers employee work-related injuries and is required by law in most states for employers. Coterie instant ConnectQuote (BOP/GL) does not replace workers comp. If the customer has employees, discuss WC compliance separately — Connect may offer traditional or partner referral paths in the future. GL and BOP do not cover employee injury claims.',
    NULL,
    ARRAY['workers_comp', 'wc', 'upsell', 'instant:false', 'compliance', 'layer:reference'],
    'Coterie KB step5 ops upsell',
    true
  ),
  (
    'coterie',
    NULL,
    'coverage_options',
    'Liquor liability — not default on contractor BOP',
    'Liquor liability is not included in standard contractor BOP/GL instant quotes. Businesses that serve, sell, or furnish alcohol may need a liquor liability endorsement or separate coverage. Selecting liquor coverage can also affect available GL limit options on Coterie. If alcohol is part of the operation, do not rely on default instant quote — ask for a coverage review.',
    NULL,
    ARRAY['liquor', 'endorsement', 'upsell', 'instant:false', 'layer:reference', 'source:bop_brochure_dec_2025'],
    'Coterie KB step5 ops upsell',
    true
  ),
  (
    'coterie',
    NULL,
    'faq',
    'Policy documents and dec page — when they arrive after instant bind',
    'After instant bind, Coterie generates policy documents and typically emails the policyholder. Connect may show quote summary limits before the full declarations page and policy PDF are indexed. During that window, use bound summary fields when present and carrier knowledge for general education — always reconcile when the dec page appears in your document vault.',
    NULL,
    ARRAY['policy', 'declarations', 'documents', 'connect', 'instant:true', 'layer:reference'],
    'Coterie KB step5 ops upsell',
    true
  ),
  (
    'coterie',
    NULL,
    'faq',
    'Connect upsell tone — helpful without overselling',
    'When coverage is absent from policy data, explain the gap honestly, then mention optional products (EPL endorsement, cyber, PL, WC) as education or “want me to look into quoting that?” — not as if they already purchased it. This matches Connect advisor voice: verify first, then helpfully expand. Upsell rows in carrier knowledge are reference only, not proof of in-force coverage.',
    NULL,
    ARRAY['chat:policy', 'upsell', 'connect', 'layer:reference'],
    'Coterie KB step5 ops upsell',
    true
  );

COMMIT;

-- Verify:
-- SELECT COUNT(*) FROM carrier_knowledge WHERE source_label = 'Coterie KB step5 ops upsell';
-- Expected: 12

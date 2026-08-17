/**
 * Instantly email creative config — one row per segment Netlify repo.
 * Used by scripts/generate-instantly-email.mjs and docs/outreach-creatives.md.
 */

export const SEGMENT_EMAIL_CONFIG = {
  bar: {
    repo: 'bar-pdf-backend',
    domain: 'barinsurancedirect.com',
    brandName: 'Bar Insurance Direct',
    audienceLabel: 'bar and restaurant',
    creativeFile: 'CID_Bar_Creative.jpg',
    frictionLine: 'No sales reports. Just square footage — quote in under a minute.',
  },
  roofer: {
    repo: 'roofing-pdf-backend',
    domain: 'roofingcontractorinsurancedirect.com',
    brandName: 'Roofing Contractor Insurance Direct',
    audienceLabel: 'roofing contractor',
    creativeFile: 'CID_Roofer_Creative.jpg',
    frictionLine: 'Skip the long supplement — tell us what you do most, get a bindable quote fast.',
  },
  plumber: {
    repo: 'plumber-pdf-backend',
    domain: 'plumberinsurancedirect.com',
    brandName: 'Plumber Insurance Direct',
    audienceLabel: 'plumbing contractor',
    creativeFile: 'CID_Plumber_Creative.jpg',
    frictionLine: 'No payroll worksheets upfront — six questions and you are looking at real premium.',
  },
  hvac: {
    repo: 'hvac-pdf-backend',
    domain: 'hvacinsurancedirect.com',
    brandName: 'HVAC Insurance Direct',
    audienceLabel: 'HVAC contractor',
    creativeFile: 'CID_HVAC_Creative.jpg',
    frictionLine: 'Less paperwork than a traditional supplement — built for busy contractors.',
  },
  fitness: {
    repo: 'fitness-pdf-backend',
    domain: 'fitnessinsurancedirect.com',
    brandName: 'Fitness Insurance Direct',
    audienceLabel: 'fitness business',
    creativeFile: 'CID_Fitness_Creative.jpg',
    frictionLine: 'Skip the waiver binders and class rosters — confirm your studio type and see premium in seconds.',
  },
  electrical: {
    repo: 'electrical-pdf-backend',
    domain: 'electricalinsurancedirect.com',
    brandName: 'Electrical Insurance Direct',
    audienceLabel: 'electrical contracting',
    creativeFile: 'CID_Electrical_Creative.jpg',
    frictionLine: 'No payroll schedules or job binders — six questions, then a bindable quote for Colorado electrical work.',
  },
  beauty: {
    repo: 'beauty-pdf-backend',
    domain: 'beautyinsurancedirect.com',
    brandName: 'Beauty Insurance Direct',
    audienceLabel: 'beauty and salon',
    creativeFile: 'CID_Beauty_Creative.jpg',
    frictionLine: 'Built for salon owners — less back-and-forth than a traditional commercial application.',
  },
  cleaning: {
    repo: 'cleaning-pdf-backend',
    domain: 'cleaninginsurancedirect.com',
    brandName: 'Cleaning Insurance Direct',
    audienceLabel: 'cleaning business',
    creativeFile: 'CID_Cleaning_Creative.jpg',
    frictionLine: 'No payroll worksheets or client contract uploads — quote first, details later.',
  },
  pet: {
    repo: 'pet-pdf-backend',
    domain: 'petserviceinsurancedirect.com',
    brandName: 'Pet Service Insurance Direct',
    audienceLabel: 'pet service',
    creativeFile: 'CID_Pet_Creative.jpg',
    frictionLine: 'Skip the bite-history binders for now — see if we can quote your pet service business in under a minute.',
  },
};

/** Instantly HTML step filename (text Step 1 → HTML Step 2 pattern). */
export const INSTANTLY_HTML_FILENAME = 'instantly_html_step.html';

export const DEFAULT_CREATIVE_VERSION = '2026-08-connect-v1';

/** All Access Insurance LLC — footer on every Instantly HTML step. */
export const ALL_ACCESS_LICENSE_NUMBER = '6784587';

export function getSegmentEmailConfig(segment) {
  const key = String(segment || '').toLowerCase();
  const cfg = SEGMENT_EMAIL_CONFIG[key];
  if (!cfg) throw new Error(`Unknown segment for email config: ${segment}`);
  return { key, ...cfg };
}

export function creativePublicUrl(segment, version = DEFAULT_CREATIVE_VERSION) {
  const { domain, creativeFile } = getSegmentEmailConfig(segment);
  return `https://${domain}/email/archive/${version}/${creativeFile}`;
}

export function introLine(segment) {
  const { audienceLabel } = getSegmentEmailConfig(segment);
  return `A faster, easier way to buy and manage ${audienceLabel} insurance.`;
}

export function altText(segment) {
  const { brandName } = getSegmentEmailConfig(segment);
  return `${brandName} - Quote in 30 seconds. Covered in under a minute.`;
}

export function frictionLine(segment) {
  const { frictionLine: line } = getSegmentEmailConfig(segment);
  return line || introLine(segment);
}

export function segmentRepoPath(segment, githubRoot = process.env.CID_GITHUB_ROOT || `${process.env.HOME}/GitHub`) {
  const { repo } = getSegmentEmailConfig(segment);
  return `${githubRoot}/${repo}`;
}

export function segmentEmailRoot(segment, githubRoot) {
  return `${segmentRepoPath(segment, githubRoot)}/Netlify/email`;
}

/**
 * Step 1 copy — typed into Instantly subject + body editor (text only).
 * Not hosted, not in HTML fragment, not in CSV.
 *
 * Only segments in CONNECTQUOTE_MARKETING_READY (connectQuoteLinks.js):
 * electrical, fitness, beauty, cleaning, pet — NOT hvac, plumber, bar, roofer.
 *
 * Assembly order in Instantly body:
 *   hook → friction → offer → cta (hyperlink to {{connectquote_url}}) → proof → — Gerry, CID
 *
 * Rules:
 *   - Never depend on {{firstName}} (~37% blank on Electrical CO)
 *   - {{displayName}} in body only, never subject
 *   - Don't say "what we know about you" — reads like surveillance
 */
export const step1Copy = {
  electrical: {
    subject: 'Your electrical quote, already started',
    subjectVariant: 'A quote for {{displayName}}, already started',
    hook: 'Click to coverage in less than a minute.',
    friction:
      'Most electrical contractors spend 20 minutes on forms just to find out a price. ' +
      'No payroll reports. No job schedules. No callback.',
    offer:
      "We've started a quote for {{displayName}} — confirm a few details and you're covered.",
    cta: 'Click to coverage →',
    proof: 'A-rated carrier. Bind and get certificates the same day.',
  },

  fitness: {
    subject: 'Your studio quote, already started',
    subjectVariant: 'A quote for {{displayName}}, already started',
    hook: 'Click to coverage in less than a minute.',
    friction:
      'Most studio owners spend 20 minutes on forms just to find out a price. ' +
      'No class schedules. No instructor certifications. No participant waivers to dig up.',
    offer:
      "We've started a quote for {{displayName}} — confirm a few details and you're covered.",
    cta: 'Click to coverage →',
    proof:
      'A-rated carrier. Bind and send your landlord a certificate the same day.',
  },

  beauty: {
    subject: 'Your salon quote, already started',
    subjectVariant: 'A quote for {{displayName}}, already started',
    hook: 'Click to coverage in less than a minute.',
    friction:
      'Most salon and spa owners spend 20 minutes on forms just to find out a price. ' +
      'No service menu. No booth renter roster. No treatment logs.',
    offer:
      "We've started a quote for {{displayName}} — confirm a few details and you're covered.",
    cta: 'Click to coverage →',
    proof: 'A-rated carrier. Bind and get certificates the same day.',
  },

  cleaning: {
    subject: 'Your cleaning quote, already started',
    subjectVariant: 'A quote for {{displayName}}, already started',
    hook: 'Click to coverage in less than a minute.',
    friction:
      'Most cleaning companies spend 20 minutes on forms just to find out a price. ' +
      'No payroll reports. No client contract schedules. No job site lists.',
    offer:
      "We've started a quote for {{displayName}} — confirm a few details and you're covered.",
    cta: 'Click to coverage →',
    proof:
      'A-rated carrier. Bind and send a client their certificate the same day.',
  },

  pet: {
    subject: 'Your grooming quote, already started',
    subjectVariant: 'A quote for {{displayName}}, already started',
    hook: 'Click to coverage in less than a minute.',
    friction:
      'Most groomers and pet care owners spend 20 minutes on forms just to find out a price. ' +
      'No incident history to write up. No vaccination policy to attach. No callback.',
    offer:
      "We've started a quote for {{displayName}} — confirm a few details and you're covered.",
    cta: 'Click to coverage →',
    proof: 'A-rated carrier. Bind and get certificates the same day.',
  },
};

export function getStep1Copy(segment) {
  const key = String(segment || '').toLowerCase();
  const copy = step1Copy[key];
  if (!copy) throw new Error(`No Step 1 copy for segment: ${segment}`);
  return copy;
}

/** Plain-text body for Instantly Step 1 (CTA line is not hyperlinked here). */
export function formatStep1Body(segment) {
  const { hook, friction, offer, cta, proof } = getStep1Copy(segment);
  return [hook, '', friction, '', offer, '', cta, '', proof, '', '— Gerry, CID'].join('\n');
}

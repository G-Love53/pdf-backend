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

import { URLSearchParams } from 'node:url';

// Segment landing page domains
export const SEGMENT_DOMAINS = {
  bar: 'https://barinsurancedirect.com',
  roofer: 'https://roofingcontractorinsurancedirect.com',
  plumber: 'https://plumberinsurancedirect.com',
  hvac: 'https://hvacinsurancedirect.com',
  fitness: 'https://fitnessinsurancedirect.com',
  electrician: 'https://electricianinsurancedirect.com',
  general_contractor: 'https://generalcontractorinsurancedirect.com',
  landscaper: 'https://landscaperinsurancedirect.com',
  auto_repair: 'https://autorepairinsurancedirect.com',
  restaurant: 'https://restaurantinsurancedirect.com',
  janitorial: 'https://janitorialinsurancedirect.com',
};

// URL parameter mapping (short keys to save URL length)
export const URL_PARAM_MAP = {
  business_name: 'bn',
  first_name: 'fn',
  last_name: 'ln',
  email: 'em',
  phone: 'ph',
  address: 'ad',
  city: 'ct',
  state: 'st',
  zip: 'zp',
};

export function buildPrefilledUrl(contact, segment, campaignTag) {
  const domain = SEGMENT_DOMAINS[segment];
  if (!domain) {
    throw new Error(`No domain configured for segment: ${segment}`);
  }

  const params = new URLSearchParams();

  // Add all available fields as URL params
  for (const [field, param] of Object.entries(URL_PARAM_MAP)) {
    if (contact[field]) {
      params.set(param, String(contact[field]));
    }
  }

  // Always add tracking params
  params.set('src', 'instantly');
  params.set('cid', campaignTag);

  return `${domain}/quote?${params.toString()}`;
}


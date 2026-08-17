#!/usr/bin/env node
/**
 * Clean Apollo people export → Instantly CSV with connectquote_url prefill.
 *
 * Filters: verified email, decision-maker title, fitness class allowlist,
 * hard company-in-state, one contact per company, optional email/website domain match.
 *
 * Usage:
 *   node scripts/clean-apollo-instantly.mjs \
 *     --file "/path/to/apollo-export.csv" \
 *     --output "/path/to/out.csv" \
 *     --state CO --segment fitness \
 *     [--campaign fitness-co-2026-08] \
 *     [--skip-domain-check]
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseCsv } from 'csv-parse/sync';
import { stringify as stringifyCsv } from 'csv-stringify/sync';
import { normalizeDisplayName } from '../marketing/normalizeDisplayName.js';
import { isConnectQuoteMarketingReady } from '../src/config/connectQuoteLinks.js';
import { buildPrefilledUrl } from '../src/outreach/urlBuilder.js';

export { normalizeDisplayName } from '../marketing/normalizeDisplayName.js';

const STATE_ABBR = {
  alabama: 'AL',
  alaska: 'AK',
  arizona: 'AZ',
  arkansas: 'AR',
  california: 'CA',
  colorado: 'CO',
  connecticut: 'CT',
  delaware: 'DE',
  florida: 'FL',
  georgia: 'GA',
  hawaii: 'HI',
  idaho: 'ID',
  illinois: 'IL',
  indiana: 'IN',
  iowa: 'IA',
  kansas: 'KS',
  kentucky: 'KY',
  louisiana: 'LA',
  maine: 'ME',
  maryland: 'MD',
  massachusetts: 'MA',
  michigan: 'MI',
  minnesota: 'MN',
  mississippi: 'MS',
  missouri: 'MO',
  montana: 'MT',
  nebraska: 'NE',
  nevada: 'NV',
  'new hampshire': 'NH',
  'new jersey': 'NJ',
  'new mexico': 'NM',
  'new york': 'NY',
  'north carolina': 'NC',
  'north dakota': 'ND',
  ohio: 'OH',
  oklahoma: 'OK',
  oregon: 'OR',
  pennsylvania: 'PA',
  'rhode island': 'RI',
  'south carolina': 'SC',
  'south dakota': 'SD',
  tennessee: 'TN',
  texas: 'TX',
  utah: 'UT',
  vermont: 'VT',
  virginia: 'VA',
  washington: 'WA',
  'west virginia': 'WV',
  wisconsin: 'WI',
  wyoming: 'WY',
};

const STATE_NAMES = Object.fromEntries(
  Object.entries(STATE_ABBR).map(([name, abbr]) => [abbr, name.replace(/\b\w/g, (c) => c.toUpperCase())]),
);

/** Coterie fitness appetite — keyword allowlist (not broad "wellness"/"health"). */
const FITNESS_ALLOWLIST = [
  /\byoga\b/i,
  /\bpilates\b/i,
  /\bcrossfit\b/i,
  /\bcross fit\b/i,
  /\bgym\b/i,
  /\bfitness\b/i,
  /\bhealth club\b/i,
  /\bathletic club\b/i,
  /\bpersonal train/i,
  /\bstrength train/i,
  /\bfitness coach\b/i,
  /\bfitness studio\b/i,
  /\btraining studio\b/i,
  /\b martial arts\b/i,
  /\bboxing\b/i,
  /\bkickboxing\b/i,
  /\bjujitsu\b/i,
  /\bjui jitsu\b/i,
  /\bkarate\b/i,
  /\btaekwondo\b/i,
  /\bmma\b/i,
  /\bdance studio\b/i,
  /\bbarre\b/i,
  /\bspin studio\b/i,
  /\bcycling studio\b/i,
  /\bbootcamp\b/i,
  /\bhiit\b/i,
  /\bbarbell\b/i,
  /\bpowerlifting\b/i,
  /\bweightlifting\b/i,
  /\brock climbing\b/i,
  /\bclimbing gym\b/i,
  /\bboulder gym\b/i,
  /\b gymnastics\b/i,
  /\bcheerleading\b/i,
  /\brow studio\b/i,
  /\browing\b/i,
];

/** Classes outside Coterie fitness appetite — always exclude. */
const OFF_APPETITE = [
  /\bchiropract/i,
  /\bphysical therap/i,
  /\bphysiotherapy\b/i,
  /\bphysio\b/i,
  /\bdental\b/i,
  /\bdentist\b/i,
  /\borthodont/i,
  /\bmassage therap/i,
  /\bmassage studio\b/i,
  /\bsalon\b/i,
  /\bbarber\b/i,
  /\bnail salon\b/i,
  /\besthetician\b/i,
  /\bcbd\b/i,
  /\bcannabis\b/i,
  /\bacupuncture\b/i,
  /\bbehavioral health\b/i,
  /\bpsychother/i,
  /\bmental health\b/i,
  /\bcounseling\b/i,
  /\bpool and spa\b/i,
  /\bpool & spa\b/i,
  /\binsurance agency\b/i,
  /\binsurance group\b/i,
  /\binsurance broker\b/i,
  /\bhospital\b/i,
  /\bmedical office\b/i,
  /\bphysician\b/i,
  /\boptomet/i,
  /\beye center\b/i,
  /\beye consult/i,
  /\baddiction\b/i,
  /\brehab center\b/i,
  /\bsober\b/i,
  /\blymphedema\b/i,
  /\bmed spa\b/i,
  /\bmedspa\b/i,
  /\bdermatolog/i,
  /\bveterinar/i,
  /\bnaturopath/i,
  /\bfunctional medicine\b/i,
];

const DECISION_MAKER =
  /\b(owner|founder|co-founder|cofounder|ceo|president|co-owner|business owner|executive director|general manager|managing partner|principal|proprietor)\b/i;

const ROLE_LOCAL = /^(info|hello|contact|admin|support|office|sales|team|help|billing|noreply|no-reply)$/i;

const TITLE_PRIORITY = [
  /\bowner\b/i,
  /\bfounder\b/i,
  /\bceo\b/i,
  /\bpresident\b/i,
  /\bco-owner\b/i,
  /\bgeneral manager\b/i,
  /\bmanaging partner\b/i,
  /\bexecutive director\b/i,
  /\bprincipal\b/i,
  /\bproprietor\b/i,
];

function parseArgs(argv) {
  const args = { skipDomainCheck: false, maxPerCompany: 2 };
  for (let i = 2; i < argv.length; i += 1) {
    const key = argv[i];
    if (key === '--skip-domain-check') {
      args.skipDomainCheck = true;
      continue;
    }
    if (key === '--one-per-company') {
      args.maxPerCompany = 1;
      continue;
    }
    if (!key?.startsWith('--')) continue;
    args[key.slice(2)] = argv[i + 1];
    i += 1;
  }
  if (args['max-per-company']) {
    args.maxPerCompany = Number.parseInt(args['max-per-company'], 10) || 2;
  }
  return args;
}

function cleanPhone(raw) {
  if (!raw) return '';
  const digits = String(raw).replace(/\D+/g, '');
  if (digits.length === 11 && digits.startsWith('1')) return digits.slice(1);
  return digits;
}

function normalizeState(raw) {
  if (!raw) return '';
  const trimmed = String(raw).trim();
  if (/^[A-Za-z]{2}$/.test(trimmed)) return trimmed.toUpperCase();
  return STATE_ABBR[trimmed.toLowerCase()] || trimmed;
}

function registrableDomain(input) {
  if (!input) return '';
  try {
    const host = input.includes('://') ? new URL(input).hostname : input.split('/')[0];
    const parts = host.toLowerCase().replace(/^www\./, '').split('.');
    if (parts.length >= 2) return parts.slice(-2).join('.');
    return host.toLowerCase();
  } catch {
    return String(input).toLowerCase().replace(/^www\./, '');
  }
}

function emailDomain(email) {
  const at = String(email || '').split('@')[1];
  return registrableDomain(at || '');
}

function normalizeCompanyKey(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/\b(llc|inc|corp|co|ltd|pllc|dba)\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function parseCompanyAddress(companyAddress, targetStateAbbr) {
  const text = String(companyAddress || '').trim();
  const stateName = STATE_NAMES[targetStateAbbr] || '';
  const statePattern = new RegExp(
    `,\\s*(${targetStateAbbr}|${stateName})\\s*,\\s*United States(?:,\\s*(\\d{5})(?:-\\d{4})?)?`,
    'i',
  );
  const match = text.match(statePattern);
  if (!match) return null;

  const parts = text.split(',').map((p) => p.trim());
  const street = parts[0] || '';
  const city = parts.length >= 3 ? parts[parts.length - 3] : '';
  const zip = match[2] || (text.match(/\b(\d{5})(?:-\d{4})?\b/) || [])[1] || '';

  return {
    street,
    city,
    state: targetStateAbbr,
    zip,
    inTargetState: true,
  };
}

function primaryBlob(row) {
  return `${row.companyName} ${row.title} ${row.website}`.toLowerCase();
}

function fullBlob(row) {
  return `${row.keywords} ${primaryBlob(row)}`.toLowerCase();
}

function isFitnessAppetite(row) {
  const primary = primaryBlob(row);
  if (OFF_APPETITE.some((re) => re.test(primary))) return false;
  const keywords = String(row.keywords || '').toLowerCase();
  return (
    FITNESS_ALLOWLIST.some((re) => re.test(primary)) ||
    FITNESS_ALLOWLIST.some((re) => re.test(keywords))
  );
}

function inferBusinessClass(row) {
  const blob = fullBlob(row);
  if (/\byoga\b/.test(blob)) return 'yoga_studio';
  if (/\bpilates\b/.test(blob)) return 'pilates_studio';
  return 'personal_trainer';
}

function titleScore(title) {
  const idx = TITLE_PRIORITY.findIndex((re) => re.test(title || ''));
  return idx === -1 ? 99 : idx;
}

function channelSrc(stateAbbr, segment) {
  return `instantly-${stateAbbr.toLowerCase()}-${segment.toLowerCase()}`;
}

function mapApolloRow(record) {
  return {
    firstName: (record['First Name'] || '').trim(),
    lastName: (record['Last Name'] || '').trim(),
    title: (record['Title'] || '').trim(),
    companyName: (record['Company Name'] || '').trim(),
    email: (record['Email'] || '').trim().toLowerCase(),
    emailStatus: (record['Email Status'] || '').trim(),
    workDirectPhone: record['Work Direct Phone'] || '',
    mobilePhone: record['Mobile Phone'] || '',
    corporatePhone: record['Corporate Phone'] || '',
    companyPhone: record['Company Phone'] || '',
    website: (record['Website'] || '').trim(),
    companyAddress: (record['Company Address'] || record['Address'] || '').trim(),
    keywords: (record['Keywords'] || '').trim(),
    employees: (record['# Employees'] || '').trim(),
  };
}

function pickPhone(row) {
  return cleanPhone(row.workDirectPhone || row.mobilePhone || row.corporatePhone || row.companyPhone);
}

const OPS_SECOND =
  /\b(office manager|director of operations|operations manager|general manager|manager)\b/i;

function pickCompanyContacts(candidates, maxPerCompany) {
  const sorted = [...candidates].sort((a, b) => titleScore(a.title) - titleScore(b.title));
  if (!sorted.length) return [];
  const picked = [sorted[0]];
  if (maxPerCompany < 2) return picked;

  const rest = sorted.filter((r) => r.email !== picked[0].email);
  if (!rest.length) return picked;

  const ops = rest.find((r) => OPS_SECOND.test(r.title));
  picked.push(ops || rest[0]);
  return picked.slice(0, maxPerCompany);
}

function domainsAlign(row) {
  const webDomain = registrableDomain(row.website);
  const mailDomain = emailDomain(row.email);
  if (!webDomain || !mailDomain) return true;
  if (webDomain === mailDomain) return true;
  return mailDomain.endsWith(`.${webDomain}`) || webDomain.endsWith(`.${mailDomain}`);
}

export function cleanApolloRows(records, options = {}) {
  const {
    targetState = 'CO',
    requireDecisionMaker = true,
    requireDomainMatch = true,
    maxPerCompany = 2,
  } = options;

  const skipped = {
    no_email: 0,
    role_email: 0,
    not_verified: 0,
    not_in_target_state: 0,
    not_decision_maker: 0,
    off_appetite: 0,
    not_fitness_class: 0,
    domain_mismatch: 0,
    duplicate_email: 0,
    extra_company_contacts: 0,
  };

  const seenEmails = new Set();
  const byCompany = new Map();

  for (const record of records) {
    const row = mapApolloRow(record);

    if (!row.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) {
      skipped.no_email += 1;
      continue;
    }
    const localPart = row.email.split('@')[0];
    if (ROLE_LOCAL.test(localPart)) {
      skipped.role_email += 1;
      continue;
    }
    if (row.emailStatus !== 'Verified') {
      skipped.not_verified += 1;
      continue;
    }

    const parsedAddress = parseCompanyAddress(row.companyAddress, targetState);
    if (!parsedAddress?.inTargetState) {
      skipped.not_in_target_state += 1;
      continue;
    }

    if (requireDecisionMaker && !DECISION_MAKER.test(row.title)) {
      skipped.not_decision_maker += 1;
      continue;
    }

    const blob = primaryBlob(row);
    if (OFF_APPETITE.some((re) => re.test(blob))) {
      skipped.off_appetite += 1;
      continue;
    }
    if (!isFitnessAppetite(row)) {
      skipped.not_fitness_class += 1;
      continue;
    }

    const businessClass = inferBusinessClass(row);

    if (requireDomainMatch && !domainsAlign(row)) {
      skipped.domain_mismatch += 1;
      continue;
    }

    if (seenEmails.has(row.email)) {
      skipped.duplicate_email += 1;
      continue;
    }

    row.parsedAddress = parsedAddress;
    row.businessClass = businessClass;

    const companyKey = normalizeCompanyKey(row.companyName);
    const bucket = byCompany.get(companyKey) || [];
    bucket.push(row);
    byCompany.set(companyKey, bucket);
  }

  const rows = [];
  for (const candidates of byCompany.values()) {
    const picked = pickCompanyContacts(candidates, maxPerCompany);
    skipped.extra_company_contacts += Math.max(0, candidates.length - picked.length);
    for (const row of picked) {
      seenEmails.add(row.email);
      rows.push(row);
    }
  }

  return { rows, skipped };
}

function toContact(row, targetState) {
  const addr = row.parsedAddress;
  return {
    email: row.email,
    first_name: row.firstName,
    last_name: row.lastName,
    business_name: row.companyName,
    phone: pickPhone(row),
    address: addr?.street || '',
    city: addr?.city || '',
    state: targetState,
    zip: addr?.zip || '',
    data_source: 'apollo',
  };
}

export function toInstantlyCsv(rows, { segment, campaignTag, targetState, channelSource }) {
  const contacts = rows.map((row) => {
    const contact = toContact(row, targetState);
    const prefilledUrl = buildPrefilledUrl(contact, segment, campaignTag, {
      src: channelSource,
      businessClass: row.businessClass,
    });
    const displayName = normalizeDisplayName(contact.business_name);
    return {
      Email: contact.email,
      'First Name': contact.first_name,
      'Last Name': contact.last_name,
      Title: row.title,
      'Company Name': contact.business_name,
      displayName,
      Phone: contact.phone,
      Website: row.website,
      City: contact.city,
      State: contact.state,
      Zip: contact.zip,
      Personalization: displayName,
      connectquote_url: prefilledUrl,
      business_class: row.businessClass,
      segment,
      campaign_tag: campaignTag,
      src: channelSource,
    };
  });

  return stringifyCsv(contacts, { header: true });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv);
  const inputFile = args.file;
  const outputFile = args.output;
  const segment = (args.segment || 'fitness').toLowerCase();
  const targetState = normalizeState(args.state || 'CO');
  const campaignTag = args.campaign || `${segment}-${targetState.toLowerCase()}-2026-08`;
  const channelSource = channelSrc(targetState, segment);

  if (!inputFile || !outputFile) {
    console.error(
      'Usage: node scripts/clean-apollo-instantly.mjs --file <apollo.csv> --output <instantly.csv> [--state CO] [--segment fitness] [--campaign tag] [--skip-domain-check]',
    );
    process.exit(1);
  }

  if (!isConnectQuoteMarketingReady(segment)) {
    console.error(
      `Segment "${segment}" is not ConnectQuote-ready for Instantly (no live connectquote.html + bind rail).`,
    );
    console.error(
      'Marketing-ready: electrical, fitness, beauty, cleaning, pet. Traditional only: bar, roofer, plumber, hvac.',
    );
    process.exit(1);
  }

  const raw = fs.readFileSync(inputFile, 'utf-8');
  const records = parseCsv(raw, { columns: true, skip_empty_lines: true, relax_column_count: true });
  const { rows, skipped } = cleanApolloRows(records, {
    targetState,
    requireDomainMatch: !args.skipDomainCheck,
    maxPerCompany: args.maxPerCompany,
  });
  const csv = toInstantlyCsv(rows, { segment, campaignTag, targetState, channelSource });

  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, csv, 'utf-8');

  console.log(`Input rows: ${records.length}`);
  console.log(`Output rows: ${rows.length}`);
  console.log(`Channel src: ${channelSource}`);
  console.log('Skipped:', skipped);
  console.log(`Written: ${outputFile}`);
}

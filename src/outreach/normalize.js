import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseCsv } from 'csv-parse/sync';
import { stringify as stringifyCsv } from 'csv-stringify/sync';
import { buildPrefilledUrl } from './urlBuilder.js';
import { CONNECTQUOTE_SEGMENT_DEFAULTS } from '../config/connectQuoteLinks.js';
import * as apolloAdapter from './adapters/apolloAdapter.js';
import * as localProspectsAdapter from './adapters/localProspectsAdapter.js';
import * as licenseBoardAdapter from './adapters/licenseBoardAdapter.js';
import * as yelpGoogleAdapter from './adapters/yelpGoogleAdapter.js';
import * as manualAdapter from './adapters/manualAdapter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ADAPTERS = {
  apollo: apolloAdapter,
  localprospects: localProspectsAdapter,
  license_board: licenseBoardAdapter,
  yelp_google: yelpGoogleAdapter,
  manual: manualAdapter,
};

function segmentBusinessClass(segment) {
  return CONNECTQUOTE_SEGMENT_DEFAULTS[String(segment || '').toLowerCase()]?.bc || null;
}

function finalizeContact(normalized, segment, campaignTag, sourceType) {
  normalized.segment = segment;
  normalized.campaign_tag = campaignTag;
  normalized.prefilled_url = buildPrefilledUrl(normalized, segment, campaignTag, {
    src: normalized.data_source || sourceType || 'instantly',
    businessClass: segmentBusinessClass(segment),
  });
  normalized.display_name = normalized.first_name
    ? `${normalized.first_name}`
    : normalized.business_name
      ? `${normalized.business_name} team`
      : 'there';
  return normalized;
}

function normalizeContacts({ sourceFile, sourceType, segment, campaignTag }) {
  const raw = fs.readFileSync(sourceFile, 'utf-8');
  const records = parseCsv(raw, { columns: true, skip_empty_lines: true });

  const adapter = ADAPTERS[sourceType];
  if (!adapter || typeof adapter.normalize !== 'function') {
    throw new Error(`No adapter.normalize() for source: ${sourceType}`);
  }

  const contacts = [];
  const skipped = { no_email: 0, duplicate: 0 };
  const seenEmails = new Set();

  for (const record of records) {
    const normalized = adapter.normalize(record);

    if (!normalized.email) {
      skipped.no_email += 1;
      continue;
    }

    normalized.email = String(normalized.email).toLowerCase().trim();
    if (!normalized.email) {
      skipped.no_email += 1;
      continue;
    }

    if (seenEmails.has(normalized.email)) {
      skipped.duplicate += 1;
      continue;
    }
    seenEmails.add(normalized.email);

    finalizeContact(normalized, segment, campaignTag, sourceType);
    contacts.push(normalized);
  }

  return { contacts, skipped, inputRows: records.length };
}

function toInstantlyCsv(contacts) {
  return stringifyCsv(
    contacts.map((c) => ({
      email: c.email,
      firstName: c.first_name || '',
      lastName: c.last_name || '',
      companyName: c.business_name || '',
      phone: c.phone || '',
      city: c.city || '',
      state: c.state || '',
      displayName: c.display_name,
      prefilledUrl: c.prefilled_url,
      segment: c.segment,
      dataSource: c.data_source,
      campaignTag: c.campaign_tag,
      licenseExpiry: c.license_expiry || '',
    })),
    { header: true },
  );
}

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 2) {
    const key = argv[i];
    const value = argv[i + 1];
    if (!key || !key.startsWith('--')) continue;
    args[key.slice(2)] = value;
  }
  return args;
}

if (process.argv[1] === __filename) {
  const args = parseArgs(process.argv);
  const { source: sourceType, segment, campaign: campaignTag, file: sourceFile, output } = args;

  if (!sourceType || !segment || !campaignTag || !sourceFile || !output) {
    // eslint-disable-next-line no-console
    console.error(
      'Usage: node src/outreach/normalize.js --source <apollo|license_board|yelp_google|manual> --segment <segment> --campaign <tag> --file <input.csv> --output <output.csv>',
    );
    process.exit(1);
  }

  const absInput = path.resolve(__dirname, '..', '..', sourceFile);
  const absOutput = path.resolve(__dirname, '..', '..', output);

  const { contacts, skipped, inputRows } = normalizeContacts({
    sourceFile: absInput,
    sourceType,
    segment,
    campaignTag,
  });

  const csvOut = toInstantlyCsv(contacts);
  fs.mkdirSync(path.dirname(absOutput), { recursive: true });
  fs.writeFileSync(absOutput, csvOut, 'utf-8');

  // eslint-disable-next-line no-console
  console.log(
    `Input rows: ${inputRows ?? contacts.length}\n  Sendable: ${
      contacts.length
    }\n  Skipped — no email: ${skipped.no_email}\n  Skipped — duplicate email: ${
      skipped.duplicate
    }\n  Output: ${output}`,
  );
}

export { normalizeContacts, toInstantlyCsv };

#!/usr/bin/env node
/**
 * Extract JPEG from CID embedded HTML (data:image/jpeg;base64,...).
 * Output must be hosted at https:// — never use data: URIs in Instantly email.
 * Target: 1200px wide, JPEG q~82, 250–400 KB (see docs/outreach-creatives.md).
 *
 * Usage:
 *   node scripts/extract-creative-jpg.mjs \
 *     --input ~/Downloads/CID_Creative_Electrical_Embedded.html \
 *     --output ../electrical-pdf-backend/Netlify/email/archive/2026-08-connect-v1/CID_Electrical_Creative.jpg
 */

import fs from 'node:fs';
import path from 'node:path';

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const key = argv[i];
    if (!key?.startsWith('--')) continue;
    args[key.slice(2)] = argv[i + 1];
    i += 1;
  }
  return args;
}

const args = parseArgs(process.argv);
const input = args.input;
const output = args.output;

if (!input || !output) {
  console.error('Usage: node scripts/extract-creative-jpg.mjs --input <embedded.html> --output <out.jpg>');
  process.exit(1);
}

const html = fs.readFileSync(input, 'utf-8');
const match = html.match(/data:image\/jpeg;base64,([A-Za-z0-9+/=\s]+)/);
if (!match) {
  console.error('No data:image/jpeg;base64 payload found in', input);
  process.exit(1);
}

const b64 = match[1].replace(/\s+/g, '');
const buf = Buffer.from(b64, 'base64');
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, buf);
console.log(`Wrote ${buf.length} bytes → ${output}`);

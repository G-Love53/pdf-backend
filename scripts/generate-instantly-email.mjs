#!/usr/bin/env node
/**
 * Generate Instantly Step 3 HTML for a segment creative version.
 *
 * Usage:
 *   node scripts/generate-instantly-email.mjs --segment electrical --version 2026-08-connect-v1
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  altText,
  creativePublicUrl,
  DEFAULT_CREATIVE_VERSION,
  getSegmentEmailConfig,
  introLine,
  segmentEmailRoot,
} from '../marketing/segmentEmailConfig.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function parseArgs(argv) {
  const args = { githubRoot: process.env.CID_GITHUB_ROOT || `${process.env.HOME}/GitHub` };
  for (let i = 2; i < argv.length; i += 1) {
    const key = argv[i];
    if (!key?.startsWith('--')) continue;
    const name = key.slice(2);
    args[name] = argv[i + 1];
    if (name === 'github-root') args.githubRoot = argv[i + 1];
    i += 1;
  }
  return args;
}

const args = parseArgs(process.argv);
const segment = args.segment;
const version = args.version || DEFAULT_CREATIVE_VERSION;
const githubRoot = args.githubRoot;

if (!segment) {
  console.error('Usage: node scripts/generate-instantly-email.mjs --segment <key> [--version 2026-08-connect-v1]');
  process.exit(1);
}

const { key, creativeFile } = getSegmentEmailConfig(segment);
const template = fs.readFileSync(
  path.join(ROOT, 'marketing/templates/instantly_step3.base.html'),
  'utf-8',
);

const html = template
  .replace(/\{\{INTRO_LINE\}\}/g, introLine(key))
  .replace(/\{\{CREATIVE_URL\}\}/g, creativePublicUrl(key, version))
  .replace(/\{\{ALT_TEXT\}\}/g, altText(key));

const outDir = path.join(segmentEmailRoot(key, githubRoot), 'archive', version);
const outFile = path.join(outDir, 'instantly_step3.html');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outFile, html, 'utf-8');

console.log(`Generated ${outFile}`);
console.log(`Creative URL: ${creativePublicUrl(key, version)}`);
console.log(`Expected JPG: ${path.join(outDir, creativeFile)}`);

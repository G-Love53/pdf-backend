#!/usr/bin/env node
/**
 * Bootstrap Netlify/email/ layout in a segment repo and optionally ingest embedded creative.
 *
 * Usage:
 *   node scripts/bootstrap-segment-email.mjs --segment electrical --all
 *   node scripts/bootstrap-segment-email.mjs --segment electrical \
 *     --embedded ~/Downloads/CID_Creative_Electrical_Embedded.html \
 *     --version 2026-08-connect-v1
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import {
  creativePublicUrl,
  DEFAULT_CREATIVE_VERSION,
  getSegmentEmailConfig,
  SEGMENT_EMAIL_CONFIG,
  segmentEmailRoot,
} from '../marketing/segmentEmailConfig.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const ALL_SEGMENTS = Object.keys(SEGMENT_EMAIL_CONFIG);

function parseArgs(argv) {
  const args = { all: false, githubRoot: process.env.CID_GITHUB_ROOT || `${process.env.HOME}/GitHub` };
  for (let i = 2; i < argv.length; i += 1) {
    const key = argv[i];
    if (key === '--all') {
      args.all = true;
      continue;
    }
    if (!key?.startsWith('--')) continue;
    args[key.slice(2)] = argv[i + 1];
    i += 1;
  }
  return args;
}

function readmeContent(key, version, hasCreative) {
  const { brandName, domain, creativeFile, repo } = getSegmentEmailConfig(key);
  const creativeUrl = creativePublicUrl(key, version);
  return `# ${brandName} — Instantly email creatives

Hosted on **${domain}** via \`${repo}/Netlify/email/\`.

## Active creative (new campaigns)

| Field | Value |
|-------|--------|
| **Version folder** | \`archive/${version}/\` |
| **JPEG** | \`${creativeFile}\` |
| **Instantly HTML** | \`instantly_html_step.html\` |
| **Public JPEG URL** | ${creativeUrl} |
| **Prefill variable** | \`{{connectquote_url}}\` on image + CTA |

${hasCreative ? '' : '**Status:** Structure only — add JPEG to `archive/' + version + '/` before sending.\n'}

## Do not delete old versions

Instantly steps keep pointing at old URLs. Add new folders under \`archive/YYYY-MM-slug/\`; update this README when switching active creative.

## Legacy root files

If \`../CID_*_Creative.jpg\` or \`../instantly_*_step3.html\` exist at \`email/\` root, they are **legacy mirrors** for campaigns already live. Prefer versioned paths for new work.

## Regenerate from pdf-backend

\`\`\`bash
cd ~/GitHub/pdf-backend
node scripts/generate-instantly-email.mjs --segment ${key} --version ${version}
node scripts/extract-creative-jpg.mjs \\
  --input ~/Downloads/CID_Creative_${key.charAt(0).toUpperCase() + key.slice(1)}_Embedded.html \\
  --output ~/GitHub/${repo}/Netlify/email/archive/${version}/${creativeFile}
\`\`\`

See \`pdf-backend/docs/outreach-claude-playbook.md\`.
`;
}

function bootstrapOne(segmentKey, opts) {
  const version = opts.version || DEFAULT_CREATIVE_VERSION;
  const { creativeFile } = getSegmentEmailConfig(segmentKey);
  const emailRoot = segmentEmailRoot(segmentKey, opts.githubRoot);
  const archiveDir = path.join(emailRoot, 'archive', version);

  fs.mkdirSync(archiveDir, { recursive: true });

  let hasCreative = false;
  if (opts.embedded && fs.existsSync(opts.embedded)) {
    const jpgOut = path.join(archiveDir, creativeFile);
    execFileSync(process.execPath, [
      path.join(ROOT, 'scripts/extract-creative-jpg.mjs'),
      '--input',
      opts.embedded,
      '--output',
      jpgOut,
    ], { stdio: 'inherit' });
    const srcCopy = path.join(archiveDir, 'source_embedded.html');
    fs.copyFileSync(opts.embedded, srcCopy);
    hasCreative = true;
  } else if (fs.existsSync(path.join(archiveDir, creativeFile))) {
    hasCreative = true;
  }

  execFileSync(process.execPath, [
    path.join(ROOT, 'scripts/generate-instantly-email.mjs'),
    '--segment',
    segmentKey,
    '--version',
    version,
    '--github-root',
    opts.githubRoot,
  ], { stdio: 'inherit' });

  fs.writeFileSync(path.join(emailRoot, 'README.md'), readmeContent(segmentKey, version, hasCreative));

  console.log(`Bootstrapped ${emailRoot}`);
}

const args = parseArgs(process.argv);
const embeddedBySegment = {
  fitness: `${process.env.HOME}/Downloads/CID_Creative_Fitness_Embedded.html`,
  electrical: `${process.env.HOME}/Downloads/CID_Creative_Electrical_Embedded.html`,
  hvac: `${process.env.HOME}/Downloads/CID_Creative_HVAC_Embedded.html`,
  plumber: `${process.env.HOME}/Downloads/CID_Creative_Plumber_Embedded.html`,
};

if (args.all) {
  for (const key of ALL_SEGMENTS) {
    bootstrapOne(key, {
      version: args.version || DEFAULT_CREATIVE_VERSION,
      githubRoot: args['github-root'] || args.githubRoot,
      embedded: embeddedBySegment[key],
    });
  }
} else if (args.segment) {
  bootstrapOne(args.segment, {
    version: args.version || DEFAULT_CREATIVE_VERSION,
    githubRoot: args['github-root'] || args.githubRoot,
    embedded: args.embedded || embeddedBySegment[args.segment],
  });
} else {
  console.error('Usage: bootstrap-segment-email.mjs --segment <key> | --all [--embedded path] [--version slug]');
  process.exit(1);
}

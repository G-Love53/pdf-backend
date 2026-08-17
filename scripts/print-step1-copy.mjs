#!/usr/bin/env node
/**
 * Print Step 1 subject + body for pasting into Instantly (text step).
 *
 * Usage:
 *   node scripts/print-step1-copy.mjs --segment electrical
 *   node scripts/print-step1-copy.mjs --segment fitness --variant
 */

import { formatStep1Body, getStep1Copy } from '../marketing/segmentEmailConfig.js';

const args = process.argv.slice(2);
const segmentIdx = args.indexOf('--segment');
const segment = segmentIdx >= 0 ? args[segmentIdx + 1] : null;
const useVariant = args.includes('--variant');

if (!segment) {
  console.error('Usage: node scripts/print-step1-copy.mjs --segment <electrical|fitness|...> [--variant]');
  process.exit(1);
}

const copy = getStep1Copy(segment);
const subject = useVariant ? copy.subjectVariant : copy.subject;

console.log('--- SUBJECT ---');
console.log(subject);
console.log('');
console.log('--- BODY (hyperlink CTA to {{connectquote_url}}) ---');
console.log(formatStep1Body(segment));

#!/usr/bin/env node
/**
 * Clean LocalProspects **Advanced** CSV (dashboard: format=Advanced, filter=With emails)
 * → Instantly upload CSV (connectquote_url prefill).
 *
 * Usage:
 *   node scripts/clean-localprospects-instantly.mjs \
 *     --file data/lp-beauty-co-advanced.csv \
 *     --output ~/Downloads/CID_Beauty_CO_Instantly_READY.csv \
 *     --segment beauty --state CO
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseCsv } from "csv-parse/sync";
import {
  assertMarketingReady,
  channelSrc,
  cleanLocalProspectsRows,
  normalizeState,
  toInstantlyCsv,
} from "../src/outreach/cleanLocalProspectsRows.js";

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) args[key] = true;
      else {
        args[key] = next;
        i += 1;
      }
    }
  }
  return args;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv);
  const inputFile = args.file;
  const outputFile = args.output;
  const segment = (args.segment || "").toLowerCase();
  const targetState = normalizeState(args.state || "CO");
  const campaignTag = args.campaign || `${segment}-${targetState.toLowerCase()}-2026-08`;
  const channelSource = channelSrc(targetState, segment);

  if (!inputFile || !outputFile || !segment) {
    console.error(
      "Usage: node scripts/clean-localprospects-instantly.mjs --file <lp-advanced.csv> --output <instantly.csv> --segment beauty|cleaning|... [--state CO] [--campaign tag]",
    );
    process.exit(1);
  }

  assertMarketingReady(segment);

  const raw = fs.readFileSync(inputFile, "utf-8");
  const records = parseCsv(raw, { columns: true, skip_empty_lines: true, relax_column_count: true });
  const { rows, skipped, phoneStats } = cleanLocalProspectsRows(records, {
    segment,
    targetState,
    keyword: args.keyword,
  });
  const csv = toInstantlyCsv(rows, { segment, campaignTag, targetState, channelSource });

  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, csv, "utf-8");

  console.log(`Input rows: ${records.length}`);
  console.log(`Output rows: ${rows.length}`);
  console.log(`Phones: ${phoneStats.with_valid_phone} in URL, ${phoneStats.no_valid_phone} omitted`);
  console.log(`Channel src: ${channelSource}`);
  console.log(`Campaign tag: ${campaignTag}`);
  console.log("Skipped:", skipped);
  console.log(`Written: ${outputFile}`);
}

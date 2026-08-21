#!/usr/bin/env node
/**
 * Pull statewide LocalProspects lists for a ConnectQuote segment → Instantly CSV.
 *
 * Requires LOCALPROSPECTS_API_KEY in pdf-backend/.env
 *
 * Usage:
 *   node scripts/pull-localprospects-instantly.mjs \
 *     --segment beauty \
 *     --state CO \
 *     --output ~/Downloads/CID_Beauty_CO_Instantly_READY.csv
 *
 * Options:
 *   --preview-only     Run campaigns/preview only (no credits for search)
 *   --region-code N    Skip lookup; use state region location_code from LP dashboard
 *   --max-leads N      Campaign-wide cap per keyword (default 3000)
 *   --default-depth N  LP default_depth per city (default 100)
 *   --campaign tag     cid tag (default {segment}-co-2026-08)
 *   --keyword "x"      Run single keyword only (optional)
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";
import { parse as parseCsv } from "csv-parse/sync";
import {
  assertMarketingReady,
  channelSrc,
  cleanLocalProspectsRows,
  normalizeState,
  toInstantlyCsv,
} from "../src/outreach/cleanLocalProspectsRows.js";
import { LocalProspectsClient, LP_CAMPAIGN_EXPORT } from "../src/outreach/localProspects/client.js";
import { listSegmentKeywords } from "../src/outreach/segmentSearchProfiles.js";

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

function stamp() {
  return new Date().toISOString().slice(0, 10);
}

async function runKeywordCampaign(lp, {
  segment,
  stateAbbr,
  regionCode,
  keyword,
  bc,
  maxLeads,
  defaultDepth,
  previewOnly,
}) {
  const name = `CID ${segment} ${stateAbbr} ${keyword} ${stamp()}`;
  const body = {
    name,
    keyword,
    max_leads: maxLeads,
    scope: {
      include: [regionCode],
      default_depth: defaultDepth,
    },
  };

  console.log(`\n--- Keyword: "${keyword}" → bc=${bc} ---`);

  if (previewOnly) {
    const preview = await lp.previewCampaign(body);
    console.log(JSON.stringify(preview, null, 2));
    return { keyword, bc, preview, records: [] };
  }

  const created = await lp.createCampaign(body);
  const campaignId = created.id || created.campaign_id || created.campaign?.id;
  if (!campaignId) {
    throw new Error(`Create campaign response missing id: ${JSON.stringify(created)}`);
  }

  console.log(`Campaign created: ${campaignId}`);
  await lp.startCampaign(campaignId);

  await lp.waitForCampaign(campaignId, {
    pollMs: 10000,
    onTick: (camp, meta) => {
      const st = meta?.status || camp.status || camp.state || "?";
      const stats = camp.stats || {};
      const leads = stats.leads_found ?? camp.lead_count ?? camp.stats?.total_leads ?? "?";
      const done = stats.locations_completed ?? camp.completed_location_count ?? "?";
      const total =
        camp.planned_location_count ??
        (stats.locations_remaining != null && done !== "?"
          ? stats.locations_remaining + Number(done)
          : "?");
      const pct = stats.progress_percent != null ? `${stats.progress_percent}%` : "";
      if (meta?.paused) {
        console.log(`  [paused] ${st} — add LP credits and resume in dashboard`);
      } else {
        console.log(`  [${st}] leads≈${leads} cities ${done}/${total} ${pct}`.trim());
      }
    },
  });

  console.log(
    `Exporting campaign ${campaignId} (format=${LP_CAMPAIGN_EXPORT.format}, has_email=true)…`,
  );
  const csvText = await lp.exportCampaignCsv(campaignId);
  const records = parseCsv(csvText, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
  });

  for (const r of records) {
    r.search_keyword = keyword;
    r.default_bc = bc;
  }

  console.log(`  Raw export rows: ${records.length}`);
  return { keyword, bc, campaignId, records };
}

async function main() {
  const args = parseArgs(process.argv);
  const segment = (args.segment || "").toLowerCase();
  const targetState = normalizeState(args.state || "CO");
  const outputFile = args.output;
  const previewOnly = Boolean(args["preview-only"]);
  const maxLeads = Number(args["max-leads"] || 3000);
  const defaultDepth = Number(args["default-depth"] || 100);
  const campaignTag = args.campaign || `${segment}-${targetState.toLowerCase()}-2026-08`;
  const channelSource = channelSrc(targetState, segment);

  if (!segment || !outputFile) {
    console.error(`Usage: node scripts/pull-localprospects-instantly.mjs \\
  --segment beauty|cleaning|... \\
  --state CO \\
  --output ~/Downloads/CID_Beauty_CO_Instantly_READY.csv \\
  [--preview-only] [--region-code N] [--max-leads 3000] [--keyword "hair salon"]`);
    process.exit(1);
  }

  assertMarketingReady(segment);

  let keywords = listSegmentKeywords(segment);
  if (args.keyword) {
    keywords = [{ keyword: args.keyword, bc: keywords[0]?.bc }];
  }
  if (!keywords.length) {
    throw new Error(`No search profile for segment "${segment}". See segmentSearchProfiles.js`);
  }

  const lp = new LocalProspectsClient();

  let regionCode = args["region-code"] ? Number(args["region-code"]) : null;
  let regionLabel = `region ${regionCode}`;

  if (!regionCode) {
    console.log(`Resolving ${targetState} region code…`);
    const region = await lp.resolveStateRegionCode(targetState);
    regionCode = region.location_code;
    regionLabel = region.full_name || regionLabel;
  }

  console.log(`Segment: ${segment}`);
  console.log(`State: ${targetState} (${regionLabel}, code ${regionCode})`);
  console.log(`Keywords: ${keywords.map((k) => k.keyword).join(", ")}`);
  console.log(`max_leads/keyword: ${maxLeads}, default_depth: ${defaultDepth}`);

  const allRecords = [];

  for (const { keyword, bc } of keywords) {
    const result = await runKeywordCampaign(lp, {
      segment,
      stateAbbr: targetState,
      regionCode,
      keyword,
      bc,
      maxLeads,
      defaultDepth,
      previewOnly,
    });
    allRecords.push(...result.records);
  }

  if (previewOnly) {
    console.log("\nPreview-only — no Instantly CSV written.");
    return;
  }

  const { rows, skipped, phoneStats } = cleanLocalProspectsRows(allRecords, { segment, targetState });
  const csv = toInstantlyCsv(rows, { segment, campaignTag, targetState, channelSource });

  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, csv, "utf-8");

  console.log("\n=== Summary ===");
  console.log(`Raw merged rows: ${allRecords.length}`);
  console.log(`Instantly-ready rows: ${rows.length}`);
  console.log(`Phones in URL: ${phoneStats.with_valid_phone}, omitted: ${phoneStats.no_valid_phone}`);
  console.log(`Channel src: ${channelSource}`);
  console.log(`Campaign tag: ${campaignTag}`);
  console.log("Skipped:", skipped);
  console.log(`Written: ${outputFile}`);
}

main().catch((err) => {
  console.error(err.message || err);
  if (err.detail) console.error(JSON.stringify(err.detail, null, 2));
  process.exit(1);
});

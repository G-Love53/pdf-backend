/**
 * Partner Layer — mint ConnectQuote URLs and attribute funnel by partner.
 */

import { buildConnectQuoteUrl } from "../config/connectQuoteLinks.js";
import {
  classifyChannel,
  getPartner,
  listPartners,
  normalizePartnerId,
  partnerCampaignId,
  partnerChannel,
  publicPartnerCard,
} from "../config/cidPartners.js";
import { parseOperatorWindow, sqlWindowFilter } from "./operatorWindow.js";
import { sqlIsConnectQuoteSubmission } from "./connectQuoteLearningService.js";
import { sqlSegmentFilter } from "../utils/operatorSegment.js";

/**
 * @param {string} partnerId
 * @param {{ state?: string, contact?: Record<string, string>, campaign?: string }} [opts]
 */
export function mintPartnerConnectQuoteUrl(partnerId, opts = {}) {
  const partner = getPartner(partnerId);
  if (!partner) {
    const err = new Error("unknown_partner");
    err.code = "unknown_partner";
    throw err;
  }
  const id = partner.id;
  const channel = partnerChannel(id);
  const campaign = opts.campaign || partnerCampaignId(id);
  const state = String(opts.state || partner.states?.[0] || "CO")
    .trim()
    .toUpperCase();
  const contact = opts.contact || {};
  const query = { partner: id, st: state };
  if (contact.em || contact.email) query.em = contact.em || contact.email;
  if (contact.fn || contact.first_name) query.fn = contact.fn || contact.first_name;
  if (contact.ln || contact.last_name) query.ln = contact.ln || contact.last_name;
  if (contact.bn || contact.business_name) query.bn = contact.bn || contact.business_name;
  if (contact.zp || contact.zip) query.zp = contact.zp || contact.zip;
  if (contact.ph || contact.phone) query.ph = contact.ph || contact.phone;

  const url = buildConnectQuoteUrl(partner.segment, {
    src: channel,
    cid: campaign,
    query,
  });
  return {
    ok: true,
    partner_id: id,
    name: partner.name,
    segment: partner.segment,
    channel,
    campaign,
    state,
    active: partner.active !== false,
    url,
  };
}

export function operatorPartnerRows() {
  return listPartners({ includeInactive: true }).map((p) => ({
    id: p.id,
    name: p.name,
    segment: p.segment,
    states: p.states || [],
    active: p.active !== false,
    channel: partnerChannel(p.id),
    logoUrl: p.logoUrl || "",
    tagline: p.tagline || "",
    notes: p.notes || "",
    sample_url: mintPartnerConnectQuoteUrl(p.id).url,
  }));
}

/**
 * Click / fill / bind by traffic_source, joined to the partner registry.
 * @param {import('pg').Pool} pool
 */
export async function getAttributionByChannel(pool, opts = {}) {
  const segment = String(opts.segment || "all").toLowerCase();
  const window = parseOperatorWindow(opts.window ?? opts.days ?? "7");
  const daysParamIndex = 1;
  const segParamIndex = window.isToday ? 1 : 2;
  const params = window.isToday ? [segment] : [window.days, segment];
  const subTime = sqlWindowFilter("s.submitted_at", window, daysParamIndex);
  const evTime = sqlWindowFilter("e.created_at", window, daysParamIndex);

  const clicksSql = `
    SELECT
      COALESCE(NULLIF(TRIM(e.ch), ''), NULLIF(TRIM(e.src), ''), 'direct') AS src,
      COUNT(DISTINCT e.session_id)::int AS clicks
    FROM cq_events e
    WHERE ${evTime}
      AND e.event = 'page_view'
      AND NOT e.suspect_bot
      AND ($${segParamIndex}::text = 'all' OR e.segment = $${segParamIndex})
    GROUP BY 1
  `;

  const fillsSql = `
    SELECT
      COALESCE(NULLIF(TRIM(s.raw_submission_json->>'traffic_source'), ''), 'direct') AS src,
      COUNT(DISTINCT s.submission_id)::int AS fills,
      COUNT(DISTINCT s.submission_id) FILTER (
        WHERE EXISTS (
          SELECT 1 FROM timeline_events te
          WHERE te.submission_id = s.submission_id
            AND te.event_type IN ('coterie.bindable_quote', 'coterie.session')
        )
      )::int AS quoted,
      COUNT(DISTINCT p.submission_id)::int AS binds,
      COALESCE(SUM(p.annual_premium) FILTER (WHERE p.id IS NOT NULL), 0)::numeric AS bound_premium,
      COUNT(DISTINCT s.submission_id) FILTER (
        WHERE EXISTS (
          SELECT 1 FROM policies pg
          WHERE pg.submission_id = s.submission_id
            AND pg.coverage_data->>'bind_source' = 'guard'
        )
      )::int AS wc_binds
    FROM submissions s
    LEFT JOIN policies p ON p.submission_id = s.submission_id
      AND (
        p.coverage_data->>'bind_source' = 'coterie'
        OR EXISTS (
          SELECT 1 FROM timeline_events te
          WHERE te.submission_id = s.submission_id
            AND te.event_type = 'coterie.policy.bound'
        )
      )
    WHERE ${sqlIsConnectQuoteSubmission("s")}
      AND ${subTime}
      ${sqlSegmentFilter("s", segParamIndex)}
    GROUP BY 1
  `;

  const [clickRes, fillRes] = await Promise.all([
    pool.query(clicksSql, params).catch((err) => {
      console.warn("[partner attribution] cq_events:", err.message || err);
      return { rows: [] };
    }),
    pool.query(fillsSql, params),
  ]);

  const bySrc = new Map();
  function row(src) {
    const key = String(src || "direct").trim() || "direct";
    if (!bySrc.has(key)) {
      const partnerId = normalizePartnerId(
        key.startsWith("partner-") ? key : "",
      );
      const partner = partnerId ? getPartner(partnerId) : null;
      bySrc.set(key, {
        src: key,
        family: classifyChannel(key),
        partner_id: partner?.id || null,
        partner_name: partner?.name || null,
        clicks: 0,
        fills: 0,
        quoted: 0,
        binds: 0,
        wc_binds: 0,
        bound_premium: 0,
      });
    }
    return bySrc.get(key);
  }

  for (const r of clickRes.rows) {
    row(r.src).clicks = r.clicks ?? 0;
  }
  for (const r of fillRes.rows) {
    const rec = row(r.src);
    rec.fills = r.fills ?? 0;
    rec.quoted = r.quoted ?? 0;
    rec.binds = r.binds ?? 0;
    rec.wc_binds = r.wc_binds ?? 0;
    rec.bound_premium = Number(r.bound_premium ?? 0);
  }

  const channels = [...bySrc.values()]
    .filter((r) => r.family !== "demo")
    .map((r) => ({
      ...r,
      fill_rate: r.clicks ? Math.round((r.fills / r.clicks) * 1000) / 10 : null,
      quote_rate: r.fills ? Math.round((r.quoted / r.fills) * 1000) / 10 : null,
      bind_rate: r.quoted ? Math.round((r.binds / r.quoted) * 1000) / 10 : null,
    }))
    .sort((a, b) => b.clicks + b.fills * 2 + b.binds * 5 - (a.clicks + a.fills * 2 + a.binds * 5));

  const partnerRows = channels.filter((r) => r.family === "partner");
  const totals = channels.reduce(
    (acc, r) => {
      acc.clicks += r.clicks;
      acc.fills += r.fills;
      acc.quoted += r.quoted;
      acc.binds += r.binds;
      acc.wc_binds += r.wc_binds;
      acc.bound_premium += r.bound_premium;
      return acc;
    },
    { clicks: 0, fills: 0, quoted: 0, binds: 0, wc_binds: 0, bound_premium: 0 },
  );

  return {
    window: {
      key: window.key,
      label: window.label,
      days: window.days,
      isToday: window.isToday,
    },
    segment,
    totals,
    channels,
    partners: partnerRows,
    registry: operatorPartnerRows(),
  };
}

export { publicPartnerCard, mintPartnerConnectQuoteUrl as mintPartnerUrl };

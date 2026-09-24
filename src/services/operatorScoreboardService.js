/**
 * Operator Click → Fill → Quote → Bind scoreboard.
 * Combines cq_events (click) + submissions/timeline/policies (fill/quote/bind).
 */

import { getCqFunnelBehavior } from "./cqFunnelService.js";
import { getConnectQuoteLearning } from "./connectQuoteLearningService.js";
import { getAttributionByChannel } from "./partnerLayerService.js";
import { parseOperatorWindow, sqlWindowFilter } from "./operatorWindow.js";
import { sqlIsConnectQuoteSubmission } from "./connectQuoteLearningService.js";
import { sqlSegmentFilter } from "../utils/operatorSegment.js";

function pct(num, den) {
  if (!den) return null;
  return Math.round((num / den) * 1000) / 10;
}

/**
 * @param {import('pg').Pool} pool
 */
export async function getOperatorScoreboard(pool, opts = {}) {
  const segment = String(opts.segment || "all").toLowerCase();
  const window = parseOperatorWindow(opts.window ?? opts.days ?? "7");

  const [behavior, learning, attribution, daily, wc] = await Promise.all([
    getCqFunnelBehavior(pool, { segment, window: opts.window ?? opts.days }).catch(
      (err) => {
        console.warn("[scoreboard] cq funnel:", err.message || err);
        return null;
      },
    ),
    getConnectQuoteLearning(pool, { segment, window: opts.window ?? opts.days }),
    getAttributionByChannel(pool, { segment, window: opts.window ?? opts.days }),
    getDailyFunnel(pool, { segment, window }),
    getWcAttachment(pool, { segment, window }),
  ]);

  const clicks = behavior?.summary?.landings ?? 0;
  const fills = learning?.funnel?.submits ?? 0;
  const quoted = learning?.funnel?.quoted ?? 0;
  const binds = learning?.funnel?.bound ?? 0;

  const steps = [
    { key: "click", label: "Click", hint: "Human landings (cq_events)", value: clicks },
    { key: "fill", label: "Fill", hint: "ConnectQuote submits", value: fills },
    { key: "quote", label: "Quote", hint: "Bindable premium returned", value: quoted },
    { key: "bind", label: "Bind", hint: "Policy row (Coterie)", value: binds },
  ];

  return {
    window: {
      key: window.key,
      label: window.label,
      days: window.days,
      isToday: window.isToday,
    },
    segment,
    funnel: {
      clicks,
      fills,
      quoted,
      binds,
      click_to_fill: pct(fills, clicks),
      fill_to_quote: pct(quoted, fills),
      quote_to_bind: pct(binds, quoted),
      click_to_bind: pct(binds, clicks),
      steps,
    },
    page: behavior?.summary || null,
    drop_off: behavior?.drop_off || [],
    learning: learning?.funnel || null,
    revenue: learning?.revenue || null,
    wc,
    daily,
    attribution,
  };
}

function utcDayKeys(window) {
  const days = window.isToday ? 1 : window.days;
  const keys = [];
  const now = new Date();
  const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  for (let i = days - 1; i >= 0; i--) {
    keys.push(new Date(end - i * 86400000).toISOString().slice(0, 10));
  }
  return keys;
}

async function getDailyFunnel(pool, { segment, window }) {
  const daysParamIndex = 1;
  const segParamIndex = window.isToday ? 1 : 2;
  const params = window.isToday ? [segment] : [window.days, segment];
  const evTime = sqlWindowFilter("e.created_at", window, daysParamIndex);
  const subTime = sqlWindowFilter("s.submitted_at", window, daysParamIndex);

  const clicksSql = `
    SELECT (e.created_at AT TIME ZONE 'utc')::date AS day,
           COUNT(DISTINCT e.session_id)::int AS clicks
    FROM cq_events e
    WHERE ${evTime}
      AND e.event = 'page_view'
      AND NOT e.suspect_bot
      AND ($${segParamIndex}::text = 'all' OR e.segment = $${segParamIndex})
    GROUP BY 1
  `;

  const fillsSql = `
    SELECT (s.submitted_at AT TIME ZONE 'utc')::date AS day,
           COUNT(DISTINCT s.submission_id)::int AS fills,
           COUNT(DISTINCT s.submission_id) FILTER (
             WHERE EXISTS (
               SELECT 1 FROM timeline_events te
               WHERE te.submission_id = s.submission_id
                 AND te.event_type IN ('coterie.bindable_quote', 'coterie.session')
             )
           )::int AS quoted,
           COUNT(DISTINCT p.submission_id)::int AS binds
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

  try {
    const [clickRes, fillRes] = await Promise.all([
      pool.query(clicksSql, params).catch(() => ({ rows: [] })),
      pool.query(fillsSql, params),
    ]);
    const byDay = new Map();
    for (const k of utcDayKeys(window)) {
      byDay.set(k, { day: k, clicks: 0, fills: 0, quoted: 0, binds: 0 });
    }
    const dayKey = (raw) =>
      raw instanceof Date ? raw.toISOString().slice(0, 10) : String(raw).slice(0, 10);
    for (const r of clickRes.rows) {
      const rec = byDay.get(dayKey(r.day));
      if (rec) rec.clicks = r.clicks ?? 0;
    }
    for (const r of fillRes.rows) {
      const rec = byDay.get(dayKey(r.day));
      if (!rec) continue;
      rec.fills = r.fills ?? 0;
      rec.quoted = r.quoted ?? 0;
      rec.binds = r.binds ?? 0;
    }
    return [...byDay.values()];
  } catch (err) {
    console.warn("[scoreboard] daily funnel:", err.message || err);
    return [];
  }
}

async function getWcAttachment(pool, { segment, window }) {
  const daysParamIndex = 1;
  const segParamIndex = window.isToday ? 1 : 2;
  const params = window.isToday ? [segment] : [window.days, segment];
  const subTime = sqlWindowFilter("s.submitted_at", window, daysParamIndex);

  const sql = `
    SELECT
      COUNT(DISTINCT s.submission_id) FILTER (
        WHERE EXISTS (
          SELECT 1 FROM policies p
          WHERE p.submission_id = s.submission_id
            AND (
              p.coverage_data->>'bind_source' = 'coterie'
              OR EXISTS (
                SELECT 1 FROM timeline_events te
                WHERE te.submission_id = s.submission_id
                  AND te.event_type = 'coterie.policy.bound'
              )
            )
        )
      )::int AS commercial_bound,
      COUNT(DISTINCT s.submission_id) FILTER (
        WHERE EXISTS (
          SELECT 1 FROM policies pg
          WHERE pg.submission_id = s.submission_id
            AND pg.coverage_data->>'bind_source' = 'guard'
        )
      )::int AS wc_bound
    FROM submissions s
    WHERE ${sqlIsConnectQuoteSubmission("s")}
      AND ${subTime}
      ${sqlSegmentFilter("s", segParamIndex)}
  `;

  try {
    const res = await pool.query(sql, params);
    const row = res.rows[0] || {};
    const commercial = row.commercial_bound ?? 0;
    const wc = row.wc_bound ?? 0;
    return {
      commercial_bound: commercial,
      wc_bound: wc,
      attachment_rate: commercial ? Math.round((wc / commercial) * 1000) / 10 : null,
    };
  } catch (err) {
    console.warn("[scoreboard] wc attachment:", err.message || err);
    return { commercial_bound: 0, wc_bound: 0, attachment_rate: null };
  }
}

/**
 * ConnectQuote funnel + revenue learning for Operator Home.
 * Data: submissions, timeline_events (coterie.*), policies.
 */

import { parseOperatorWindow, sqlWindowFilter } from "./operatorWindow.js";

const DEMO_SRC_BLOCK = new Set(["demo", "coterie-demo"]);

function isDemoSubmission(row) {
  const src = String(
    row?.traffic_source ?? row?.raw_submission_json?.traffic_source ?? "",
  )
    .trim()
    .toLowerCase();
  const cid = String(
    row?.campaign_id ?? row?.raw_submission_json?.campaign_id ?? "",
  )
    .trim()
    .toLowerCase();
  if (DEMO_SRC_BLOCK.has(src)) return true;
  if (cid.includes("partner-demo") || cid.includes("coterie-demo")) return true;
  return false;
}

/** ConnectQuote intake rows (quote_rail, source_form, or segment landing domain). */
function sqlIsConnectQuoteSubmission(alias = "s") {
  return `
    (
      ${alias}.raw_submission_json->>'quote_rail' = 'coterie'
      OR ${alias}.source_form = 'connectquote'
      OR COALESCE(${alias}.source_domain, '') ILIKE '%insurancedirect.com%'
    )
    AND COALESCE(${alias}.raw_submission_json->>'traffic_source', '') NOT IN ('demo', 'coterie-demo')
    AND COALESCE(${alias}.raw_submission_json->>'campaign_id', '') NOT ILIKE '%partner-demo%'
  `;
}

function sqlCqBaseFilter(alias = "s", window, daysParamIndex = 2) {
  const timeFilter = sqlWindowFilter(`${alias}.submitted_at`, window, daysParamIndex);
  return `
    ${sqlIsConnectQuoteSubmission(alias)}
    AND ${timeFilter}
  `;
}

function sqlSegmentFilter(alias, paramIndex) {
  return `AND ($${paramIndex}::text = 'all' OR ${alias}.segment = $${paramIndex}::segment_type)`;
}

function sqlQuotedExists(subAlias = "s") {
  return `
    EXISTS (
      SELECT 1 FROM timeline_events te
      WHERE te.submission_id = ${subAlias}.submission_id
        AND te.event_type IN ('coterie.bindable_quote', 'coterie.session')
    )
  `;
}

/** Latest quoted premium from timeline (numeric or null). */
function sqlLastQuotedPremium(subAlias = "s") {
  return `
    (
      SELECT NULLIF(
        COALESCE(
          te.event_payload_json->>'premium',
          te.event_payload_json->'quoteSummary'->>'premium'
        ),
        ''
      )::numeric
      FROM timeline_events te
      WHERE te.submission_id = ${subAlias}.submission_id
        AND te.event_type IN ('coterie.bindable_quote', 'coterie.session')
      ORDER BY te.created_at DESC
      LIMIT 1
    )
  `;
}

/** Count of bindable quote events (requotes = count - 1 when > 1). */
function sqlRequoteCount(subAlias = "s") {
  return `
    (
      SELECT COUNT(*)::int
      FROM timeline_events te
      WHERE te.submission_id = ${subAlias}.submission_id
        AND te.event_type = 'coterie.bindable_quote'
    )
  `;
}

function sqlCoterieApplicationId(subAlias = "s") {
  return `
    (
      SELECT NULLIF(te.event_payload_json->>'applicationId', '')
      FROM timeline_events te
      WHERE te.submission_id = ${subAlias}.submission_id
        AND te.event_type IN (
          'coterie.application_created',
          'coterie.bindable_quote',
          'coterie.session'
        )
        AND NULLIF(te.event_payload_json->>'applicationId', '') IS NOT NULL
      ORDER BY te.created_at DESC
      LIMIT 1
    )
  `;
}

function sqlConnectQuoteStatus(subAlias = "s") {
  return `
    CASE
      WHEN EXISTS (
        SELECT 1 FROM policies p WHERE p.submission_id = ${subAlias}.submission_id
      ) THEN 'bound'
      WHEN ${sqlQuotedExists(subAlias)} THEN 'quoted'
      WHEN EXISTS (
        SELECT 1 FROM timeline_events te
        WHERE te.submission_id = ${subAlias}.submission_id
          AND te.event_type IN ('coterie.rail_traditional', 'coterie.appetite_excluded')
      ) THEN 'traditional'
      WHEN EXISTS (
        SELECT 1 FROM timeline_events te
        WHERE te.submission_id = ${subAlias}.submission_id
          AND te.event_type = 'coterie.bindable_blocked'
      ) THEN 'blocked'
      WHEN EXISTS (
        SELECT 1 FROM timeline_events te
        WHERE te.submission_id = ${subAlias}.submission_id
          AND te.event_type = 'coterie.application_created'
      ) THEN 'in_coterie'
      ELSE 'submitted'
    END
  `;
}

/**
 * @param {import('pg').Pool} pool
 * @param {{ segment?: string, window?: unknown, days?: number|string }} opts
 */
export async function getConnectQuoteLearning(pool, opts = {}) {
  const segment = String(opts.segment || "all").toLowerCase();
  const window = parseOperatorWindow(opts.window ?? opts.days ?? "7");
  const segParam = segment === "all" ? "all" : segment;
  const daysParamIndex = 1;
  const segParamIndex = window.isToday ? 1 : 2;
  const params = window.isToday ? [segParam] : [window.days, segParam];
  const cqFilter = (alias = "s") =>
    `${sqlCqBaseFilter(alias, window, daysParamIndex)} ${sqlSegmentFilter(alias, segParamIndex)}`;

  const funnelSql = `
    SELECT
      COUNT(DISTINCT s.submission_id)::int AS submits,
      COUNT(DISTINCT s.submission_id) FILTER (WHERE ${sqlQuotedExists("s")})::int AS quoted,
      COUNT(DISTINCT p.submission_id)::int AS bound,
      COUNT(DISTINCT s.submission_id) FILTER (
        WHERE EXISTS (
          SELECT 1 FROM timeline_events te
          WHERE te.submission_id = s.submission_id
            AND te.event_type IN ('coterie.rail_traditional', 'coterie.appetite_excluded')
        )
      )::int AS traditional_exits,
      COUNT(DISTINCT s.submission_id) FILTER (
        WHERE ${sqlQuotedExists("s")}
          AND ${sqlRequoteCount("s")} > 1
      )::int AS with_requotes
    FROM submissions s
    LEFT JOIN policies p ON p.submission_id = s.submission_id
    WHERE ${cqFilter("s")}
  `;

  const revenueSql = `
    SELECT
      COALESCE(SUM(${sqlLastQuotedPremium("s")}) FILTER (
        WHERE ${sqlQuotedExists("s")}
          AND NOT EXISTS (SELECT 1 FROM policies p2 WHERE p2.submission_id = s.submission_id)
      ), 0)::numeric AS open_quoted_premium_sum,
      COALESCE(AVG(${sqlLastQuotedPremium("s")}) FILTER (
        WHERE ${sqlQuotedExists("s")}
          AND NOT EXISTS (SELECT 1 FROM policies p2 WHERE p2.submission_id = s.submission_id)
      ), 0)::numeric AS open_quoted_premium_avg,
      COALESCE(SUM(p.annual_premium) FILTER (WHERE p.id IS NOT NULL), 0)::numeric AS bound_premium_sum,
      COALESCE(AVG(p.annual_premium) FILTER (WHERE p.id IS NOT NULL), 0)::numeric AS bound_premium_avg,
      COUNT(DISTINCT s.submission_id) FILTER (
        WHERE ${sqlQuotedExists("s")}
          AND NOT EXISTS (SELECT 1 FROM policies p2 WHERE p2.submission_id = s.submission_id)
      )::int AS open_quoted_count,
      COUNT(DISTINCT p.submission_id)::int AS bound_count
    FROM submissions s
    LEFT JOIN policies p ON p.submission_id = s.submission_id
    WHERE ${cqFilter("s")}
  `;

  const quotedNotBoundSql = `
    SELECT
      s.submission_public_id,
      s.segment::text AS segment,
      s.submitted_at,
      c.primary_email AS client_email,
      COALESCE(
        NULLIF(TRIM(s.raw_submission_json->>'business_name'), ''),
        NULLIF(TRIM(CONCAT_WS(' ', c.first_name, c.last_name)), ''),
        c.primary_email
      ) AS client_name,
      s.raw_submission_json->>'traffic_source' AS src,
      s.raw_submission_json->>'campaign_id' AS cid,
      ${sqlLastQuotedPremium("s")} AS last_quoted_premium,
      ${sqlRequoteCount("s")} AS requote_events,
      GREATEST(${sqlRequoteCount("s")} - 1, 0)::int AS requote_changes,
      (
        SELECT NULLIF(
          COALESCE(te.event_payload_json->>'premium', te.event_payload_json->'quoteSummary'->>'premium'),
          ''
        )::numeric
        FROM timeline_events te
        WHERE te.submission_id = s.submission_id
          AND te.event_type = 'coterie.bindable_quote'
        ORDER BY te.created_at ASC
        LIMIT 1
      ) AS first_quoted_premium
    FROM submissions s
    JOIN clients c ON c.client_id = s.client_id
    WHERE ${cqFilter("s")}
      AND ${sqlQuotedExists("s")}
      AND NOT EXISTS (SELECT 1 FROM policies p WHERE p.submission_id = s.submission_id)
    ORDER BY s.submitted_at DESC
    LIMIT 40
  `;

  const recentSubmissionsSql = `
    SELECT
      s.submission_public_id,
      s.submission_public_id AS coterie_external_id,
      s.segment::text AS segment,
      s.submitted_at,
      c.primary_email AS client_email,
      COALESCE(
        NULLIF(TRIM(s.raw_submission_json->>'business_name'), ''),
        NULLIF(TRIM(CONCAT_WS(' ', c.first_name, c.last_name)), ''),
        c.primary_email
      ) AS client_name,
      s.raw_submission_json->>'traffic_source' AS src,
      s.raw_submission_json->>'campaign_id' AS cid,
      ${sqlConnectQuoteStatus("s")} AS cq_status,
      ${sqlCoterieApplicationId("s")} AS coterie_application_id,
      ${sqlLastQuotedPremium("s")} AS last_quoted_premium,
      ${sqlRequoteCount("s")} AS requote_events,
      GREATEST(${sqlRequoteCount("s")} - 1, 0)::int AS requote_changes,
      EXISTS (
        SELECT 1 FROM quotes q WHERE q.submission_id = s.submission_id
      ) AS has_traditional_quote_row
    FROM submissions s
    JOIN clients c ON c.client_id = s.client_id
    WHERE ${cqFilter("s")}
    ORDER BY s.submitted_at DESC
    LIMIT 50
  `;

  const recentBindsSql = `
    SELECT
      s.submission_public_id,
      s.segment::text AS segment,
      p.bound_at,
      p.policy_number,
      p.annual_premium AS bound_premium,
      c.primary_email AS client_email,
      COALESCE(
        NULLIF(TRIM(s.raw_submission_json->>'business_name'), ''),
        NULLIF(TRIM(CONCAT_WS(' ', c.first_name, c.last_name)), ''),
        c.primary_email
      ) AS client_name,
      ${sqlLastQuotedPremium("s")} AS last_quoted_premium,
      ${sqlRequoteCount("s")} AS requote_events,
      GREATEST(${sqlRequoteCount("s")} - 1, 0)::int AS requote_changes,
      ROUND(
        EXTRACT(EPOCH FROM (p.bound_at - s.submitted_at)) / 60.0,
        1
      ) AS minutes_to_bind
    FROM policies p
    JOIN submissions s ON s.submission_id = p.submission_id
    JOIN clients c ON c.client_id = s.client_id
    WHERE ${cqFilter("s")}
      AND (
        p.coverage_data->>'bind_source' = 'coterie'
        OR EXISTS (
          SELECT 1 FROM timeline_events te
          WHERE te.submission_id = s.submission_id
            AND te.event_type = 'coterie.policy.bound'
        )
      )
    ORDER BY p.bound_at DESC
    LIMIT 25
  `;

  const [funnelRes, revenueRes, openRes, recentRes, bindsRes] = await Promise.all([
    pool.query(funnelSql, params),
    pool.query(revenueSql, params),
    pool.query(quotedNotBoundSql, params),
    pool.query(recentSubmissionsSql, params),
    pool.query(recentBindsSql, params),
  ]);

  const funnelRow = funnelRes.rows[0] || {};
  const submits = funnelRow.submits ?? 0;
  const quoted = funnelRow.quoted ?? 0;
  const bound = funnelRow.bound ?? 0;

  const revenueRow = revenueRes.rows[0] || {};

  return {
    window: {
      key: window.key,
      label: window.label,
      isToday: window.isToday,
      days: window.days,
    },
    days: window.days,
    segment: segParam,
    funnel: {
      submits,
      quoted,
      bound,
      quote_rate: submits ? Math.round((quoted / submits) * 1000) / 10 : null,
      bind_rate: quoted ? Math.round((bound / quoted) * 1000) / 10 : null,
      traditional_exits: funnelRow.traditional_exits ?? 0,
      with_requotes: funnelRow.with_requotes ?? 0,
    },
    revenue: {
      open_quoted_count: revenueRow.open_quoted_count ?? 0,
      open_quoted_premium_sum: Number(revenueRow.open_quoted_premium_sum ?? 0),
      open_quoted_premium_avg: Number(revenueRow.open_quoted_premium_avg ?? 0),
      bound_count: revenueRow.bound_count ?? 0,
      bound_premium_sum: Number(revenueRow.bound_premium_sum ?? 0),
      bound_premium_avg: Number(revenueRow.bound_premium_avg ?? 0),
    },
    recent_submissions: recentRes.rows.map((row) => ({
      ...row,
      last_quoted_premium:
        row.last_quoted_premium != null ? Number(row.last_quoted_premium) : null,
      has_traditional_quote_row: Boolean(row.has_traditional_quote_row),
    })),
    quoted_not_bound: openRes.rows.map((row) => ({
      ...row,
      last_quoted_premium: row.last_quoted_premium != null ? Number(row.last_quoted_premium) : null,
      first_quoted_premium: row.first_quoted_premium != null ? Number(row.first_quoted_premium) : null,
      premium_delta:
        row.first_quoted_premium != null && row.last_quoted_premium != null
          ? Math.round((Number(row.last_quoted_premium) - Number(row.first_quoted_premium)) * 100) / 100
          : null,
    })),
    recent_binds: bindsRes.rows.map((row) => ({
      ...row,
      bound_premium: row.bound_premium != null ? Number(row.bound_premium) : null,
      last_quoted_premium: row.last_quoted_premium != null ? Number(row.last_quoted_premium) : null,
      minutes_to_bind: row.minutes_to_bind != null ? Number(row.minutes_to_bind) : null,
    })),
  };
}

export { isDemoSubmission, sqlIsConnectQuoteSubmission };

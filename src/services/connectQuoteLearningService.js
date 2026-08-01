/**
 * ConnectQuote funnel + revenue learning for Operator Home.
 * Data: submissions, timeline_events (coterie.*), policies.
 */

const DEMO_SRC_BLOCK = new Set(["demo", "coterie-demo"]);

function parseDays(value) {
  const n = Number.parseInt(String(value ?? "7"), 10);
  if (!Number.isFinite(n) || n < 1) return 7;
  return Math.min(n, 90);
}

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

function sqlCqBaseFilter(alias = "s", daysParamIndex = 2) {
  return `
    ${alias}.raw_submission_json->>'quote_rail' = 'coterie'
    AND ${alias}.submitted_at >= NOW() - ($${daysParamIndex}::int * INTERVAL '1 day')
    AND COALESCE(${alias}.raw_submission_json->>'traffic_source', '') NOT IN ('demo', 'coterie-demo')
    AND COALESCE(${alias}.raw_submission_json->>'campaign_id', '') NOT ILIKE '%partner-demo%'
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

/**
 * @param {import('pg').Pool} pool
 * @param {{ segment?: string, days?: number|string }} opts
 */
export async function getConnectQuoteLearning(pool, opts = {}) {
  const segment = String(opts.segment || "all").toLowerCase();
  const days = parseDays(opts.days);
  const segParam = segment === "all" ? "all" : segment;

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
    WHERE ${sqlCqBaseFilter("s", 1)}
      ${sqlSegmentFilter("s", 2)}
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
    WHERE ${sqlCqBaseFilter("s", 1)}
      ${sqlSegmentFilter("s", 2)}
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
    WHERE ${sqlCqBaseFilter("s", 1)}
      ${sqlSegmentFilter("s", 2)}
      AND ${sqlQuotedExists("s")}
      AND NOT EXISTS (SELECT 1 FROM policies p WHERE p.submission_id = s.submission_id)
    ORDER BY s.submitted_at DESC
    LIMIT 40
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
    WHERE ${sqlCqBaseFilter("s", 1)}
      ${sqlSegmentFilter("s", 2)}
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

  const params = [days, segParam];

  const [funnelRes, revenueRes, openRes, bindsRes] = await Promise.all([
    pool.query(funnelSql, params),
    pool.query(revenueSql, params),
    pool.query(quotedNotBoundSql, params),
    pool.query(recentBindsSql, params),
  ]);

  const funnelRow = funnelRes.rows[0] || {};
  const submits = funnelRow.submits ?? 0;
  const quoted = funnelRow.quoted ?? 0;
  const bound = funnelRow.bound ?? 0;

  const revenueRow = revenueRes.rows[0] || {};

  return {
    days,
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

export { parseDays, isDemoSubmission };

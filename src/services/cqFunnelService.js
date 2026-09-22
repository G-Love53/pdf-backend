/**
 * ConnectQuote pre-submit funnel from cq_events (page → engage → steps → quote → bind click).
 */

import { parseOperatorWindow, sqlWindowFilter } from "./operatorWindow.js";

const STALE_MINUTES = 30;

function sqlCqEventsSegmentFilter(paramIndex = 2) {
  return `AND ($${paramIndex}::text = 'all' OR e.segment = $${paramIndex})`;
}

/**
 * @param {import('pg').Pool} pool
 * @param {{ segment?: string, window?: unknown, days?: number|string, includeBots?: boolean }} opts
 */
export async function getCqFunnelBehavior(pool, opts = {}) {
  const segment = String(opts.segment || "all").toLowerCase();
  const window = parseOperatorWindow(opts.window ?? opts.days ?? "7");
  const includeBots = opts.includeBots === true;
  const daysParamIndex = 1;
  const segParamIndex = window.isToday ? 1 : 2;
  const params = window.isToday ? [segment] : [window.days, segment];
  const timeFilter = sqlWindowFilter("e.created_at", window, daysParamIndex);
  const botFilter = includeBots ? "" : "AND NOT e.suspect_bot";

  const summarySql = `
    WITH ev AS (
      SELECT
        e.session_id,
        e.event,
        e.step,
        e.meta,
        e.segment,
        e.st,
        e.state,
        e.created_at
      FROM cq_events e
      WHERE ${timeFilter}
        ${botFilter}
        ${sqlCqEventsSegmentFilter(segParamIndex)}
    ),
    agg AS (
      SELECT
        session_id,
        MAX(segment) AS segment,
        MAX(st) AS email_step,
        MAX(state) AS state,
        bool_or(event = 'page_view') AS has_page_view,
        bool_or(event = 'engaged') AS has_engaged,
        COUNT(*) FILTER (WHERE event = 'step_complete') AS step_count,
        bool_or(event = 'disqualified') AS has_disqualified,
        bool_or(event = 'quote_requested') AS has_quote_requested,
        bool_or(event = 'quote_returned') AS has_quote_returned,
        bool_or(event = 'quote_error') AS has_quote_error,
        bool_or(event = 'bind_clicked') AS has_bind_clicked,
        MAX(NULLIF(meta->>'submission_public_id', '')) AS submission_public_id,
        MAX(
          NULLIF(COALESCE(meta->>'premium_annual', meta->>'premium'), '')::numeric
        ) FILTER (WHERE event = 'quote_returned') AS quoted_premium,
        MAX(step) FILTER (WHERE event = 'exit') AS exit_step,
        MAX(meta->>'funnel_stage') FILTER (WHERE event = 'exit') AS exit_funnel_stage,
        MIN(created_at) AS first_at,
        MAX(created_at) AS last_at
      FROM ev
      GROUP BY session_id
    ),
    classified AS (
      SELECT
        a.*,
        EXISTS (
          SELECT 1 FROM policies p
          JOIN submissions s ON s.submission_id = p.submission_id
          WHERE s.submission_public_id = a.submission_public_id
        ) AS is_bound,
        CASE
          WHEN a.has_disqualified THEN 'disqualified'
          WHEN a.has_bind_clicked THEN 'bind_clicked'
          WHEN a.has_quote_returned AND NOT a.has_bind_clicked THEN 'quoted_unbound'
          WHEN a.has_quote_requested AND NOT a.has_quote_returned THEN 'quote_pending'
          WHEN a.step_count >= 1 AND NOT a.has_quote_returned THEN 'semi_filled'
          WHEN a.has_engaged AND a.step_count = 0 THEN 'open_engaged'
          WHEN a.has_page_view THEN 'open'
          ELSE 'unknown'
        END AS funnel_stage,
        (
          a.last_at < now() - interval '${STALE_MINUTES} minutes'
          AND NOT a.has_quote_returned
          AND NOT a.has_bind_clicked
        ) AS is_stale
      FROM agg a
    )
    SELECT
      COUNT(*)::int AS sessions,
      COUNT(*) FILTER (WHERE has_page_view)::int AS landings,
      COUNT(*) FILTER (WHERE has_engaged)::int AS engaged_sessions,
      COUNT(*) FILTER (WHERE funnel_stage IN ('open', 'open_engaged'))::int AS open_sessions,
      COUNT(*) FILTER (WHERE funnel_stage = 'semi_filled')::int AS semi_filled,
      COUNT(*) FILTER (WHERE is_stale AND funnel_stage IN ('open', 'open_engaged', 'semi_filled'))::int AS stale,
      COUNT(*) FILTER (WHERE has_quote_returned)::int AS quote_returned,
      COUNT(*) FILTER (WHERE funnel_stage = 'quoted_unbound')::int AS quoted_unbound_page,
      COUNT(*) FILTER (
        WHERE funnel_stage = 'quoted_unbound'
          AND submission_public_id IS NOT NULL
          AND NOT is_bound
      )::int AS quoted_unbound_confirmed,
      COUNT(*) FILTER (WHERE has_bind_clicked)::int AS bind_clicked,
      COUNT(*) FILTER (WHERE funnel_stage = 'disqualified')::int AS disqualified,
      COUNT(*) FILTER (WHERE has_quote_error)::int AS quote_errors,
      COALESCE(SUM(quoted_premium) FILTER (WHERE funnel_stage = 'quoted_unbound'), 0)::numeric AS quoted_unbound_premium_sum
    FROM classified
  `;

  const dropOffSql = `
    WITH ev AS (
      SELECT e.session_id, e.event, e.step, e.meta, e.created_at
      FROM cq_events e
      WHERE ${timeFilter}
        ${botFilter}
        ${sqlCqEventsSegmentFilter(segParamIndex)}
    ),
    agg AS (
      SELECT
        session_id,
        COUNT(*) FILTER (WHERE event = 'step_complete') AS step_count,
        bool_or(event = 'quote_returned') AS has_quote_returned,
        bool_or(event = 'bind_clicked') AS has_bind_clicked,
        bool_or(event = 'disqualified') AS has_disqualified,
        MAX(step) FILTER (WHERE event = 'exit') AS exit_step,
        MAX(meta->>'funnel_stage') FILTER (WHERE event = 'exit') AS exit_funnel_stage
      FROM ev
      GROUP BY session_id
    )
    SELECT
      COALESCE(NULLIF(exit_funnel_stage, ''), NULLIF(exit_step, ''), 'unknown') AS label,
      COUNT(*)::int AS sessions
    FROM agg
    WHERE step_count >= 1
      AND NOT has_quote_returned
      AND NOT has_bind_clicked
      AND NOT has_disqualified
    GROUP BY 1
    ORDER BY sessions DESC
    LIMIT 12
  `;

  const bySegmentSql = `
    WITH ev AS (
      SELECT e.session_id, e.event, e.segment, e.meta, e.created_at
      FROM cq_events e
      WHERE ${timeFilter}
        ${botFilter}
        AND ($${segParamIndex}::text = 'all')
    ),
    agg AS (
      SELECT
        session_id,
        MAX(segment) AS segment,
        COUNT(*) FILTER (WHERE event = 'step_complete') AS step_count,
        bool_or(event = 'engaged') AS has_engaged,
        bool_or(event = 'quote_returned') AS has_quote_returned,
        bool_or(event = 'bind_clicked') AS has_bind_clicked,
        bool_or(event = 'disqualified') AS has_disqualified,
        MAX(created_at) AS last_at
      FROM ev
      GROUP BY session_id
    ),
    classified AS (
      SELECT
        segment,
        CASE
          WHEN has_disqualified THEN 'disqualified'
          WHEN has_bind_clicked THEN 'bind_clicked'
          WHEN has_quote_returned AND NOT has_bind_clicked THEN 'quoted_unbound'
          WHEN step_count >= 1 AND NOT has_quote_returned THEN 'semi_filled'
          WHEN has_engaged THEN 'open_engaged'
          ELSE 'open'
        END AS funnel_stage,
        (
          last_at < now() - interval '${STALE_MINUTES} minutes'
          AND NOT has_quote_returned
        ) AS is_stale
      FROM agg
    )
    SELECT
      segment,
      COUNT(*)::int AS sessions,
      COUNT(*) FILTER (WHERE funnel_stage = 'semi_filled')::int AS semi_filled,
      COUNT(*) FILTER (WHERE funnel_stage = 'quoted_unbound')::int AS quoted_unbound,
      COUNT(*) FILTER (WHERE is_stale)::int AS stale
    FROM classified
    GROUP BY segment
    ORDER BY sessions DESC
  `;

  const [summaryRes, dropOffRes, bySegmentRes] = await Promise.all([
    pool.query(summarySql, params),
    pool.query(dropOffSql, params),
    segment === "all" ? pool.query(bySegmentSql, params) : Promise.resolve({ rows: [] }),
  ]);

  const row = summaryRes.rows[0] || {};

  return {
    window: {
      key: window.key,
      label: window.label,
      isToday: window.isToday,
      days: window.days,
    },
    segment,
    stale_after_minutes: STALE_MINUTES,
    include_bots: includeBots,
    summary: {
      sessions: row.sessions ?? 0,
      landings: row.landings ?? 0,
      open: row.open_sessions ?? 0,
      semi_filled: row.semi_filled ?? 0,
      stale: row.stale ?? 0,
      quote_returned: row.quote_returned ?? 0,
      quoted_unbound_page: row.quoted_unbound_page ?? 0,
      quoted_unbound_confirmed: row.quoted_unbound_confirmed ?? 0,
      quoted_unbound_premium_sum: Number(row.quoted_unbound_premium_sum ?? 0),
      bind_clicked: row.bind_clicked ?? 0,
      disqualified: row.disqualified ?? 0,
      quote_errors: row.quote_errors ?? 0,
      engaged: row.engaged_sessions ?? 0,
      engage_rate:
        row.landings > 0
          ? Math.round(((row.engaged_sessions ?? 0) / row.landings) * 1000) / 10
          : null,
    },
    drop_off: dropOffRes.rows.map((r) => ({
      label: r.label,
      sessions: r.sessions,
    })),
    by_segment: bySegmentRes.rows.map((r) => ({
      segment: r.segment,
      sessions: r.sessions,
      semi_filled: r.semi_filled,
      quoted_unbound: r.quoted_unbound,
      stale: r.stale,
    })),
  };
}

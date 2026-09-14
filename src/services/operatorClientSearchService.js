/**
 * Operator client lookup — email, submission public ID (CID-…), or business name.
 */

const CID_PREFIX = /^CID-/i;
const MIN_BUSINESS_NAME_LEN = 2;
const BUSINESS_MATCH_LIMIT = 25;

/** @param {string} term */
function ilikePattern(term) {
  const cleaned = String(term || "")
    .trim()
    .replace(/[%_]/g, " ");
  return `%${cleaned}%`;
}

/**
 * @param {string} raw
 * @returns {{ mode: 'submission_id' | 'email' | 'business_name'; value: string } | { mode: 'invalid'; message: string }}
 */
export function parseOperatorSearchQuery(raw) {
  const q = String(raw || "").trim();
  if (!q) {
    return {
      mode: "invalid",
      message: "Enter an email, business name, or CID submission ID.",
    };
  }
  if (CID_PREFIX.test(q)) {
    return { mode: "submission_id", value: q.toUpperCase() };
  }
  if (q.includes("@")) {
    return { mode: "email", value: q.toLowerCase() };
  }
  if (q.length < MIN_BUSINESS_NAME_LEN) {
    return {
      mode: "invalid",
      message: `Business name must be at least ${MIN_BUSINESS_NAME_LEN} characters.`,
    };
  }
  return { mode: "business_name", value: q };
}

function sqlSubmissionStatus(alias = "s") {
  return `
    CASE
      WHEN EXISTS (
        SELECT 1 FROM policies p WHERE p.submission_id = ${alias}.submission_id
      ) THEN 'bound'
      WHEN EXISTS (
        SELECT 1 FROM timeline_events te
        WHERE te.submission_id = ${alias}.submission_id
          AND te.event_type IN ('coterie.bindable_quote', 'coterie.session')
      ) THEN 'quoted'
      WHEN EXISTS (
        SELECT 1 FROM timeline_events te
        WHERE te.submission_id = ${alias}.submission_id
          AND te.event_type IN ('coterie.rail_traditional', 'coterie.appetite_excluded')
      ) THEN 'traditional'
      WHEN EXISTS (
        SELECT 1 FROM timeline_events te
        WHERE te.submission_id = ${alias}.submission_id
          AND te.event_type = 'guard.indicated'
      ) THEN 'wc_indicated'
      WHEN EXISTS (
        SELECT 1 FROM timeline_events te
        WHERE te.submission_id = ${alias}.submission_id
          AND te.event_type = 'coterie.application_created'
      ) THEN 'in_coterie'
      ELSE 'submitted'
    END
  `;
}

/**
 * @param {import('pg').Pool} pool
 * @param {string} clientId
 * @param {{ matchKind: string; highlightSubmissionId?: string | null; query?: string }} meta
 */
async function loadOperatorClientProfile(pool, clientId, meta) {
  const clientRes = await pool.query(
    `
      SELECT
        client_id,
        primary_email,
        primary_phone,
        first_name,
        last_name,
        created_at
      FROM clients
      WHERE client_id = $1
      LIMIT 1
    `,
    [clientId],
  );
  if (!clientRes.rows.length) {
    return { found: false, message: "Client record not found." };
  }
  const client = clientRes.rows[0];

  const businessesRes = await pool.query(
    `
      SELECT
        business_id,
        business_name,
        dba_name,
        segment::text AS segment,
        state,
        created_at
      FROM businesses
      WHERE client_id = $1
      ORDER BY created_at DESC
    `,
    [clientId],
  );

  const submissionsRes = await pool.query(
    `
      SELECT
        s.submission_id,
        s.submission_public_id,
        s.segment::text AS segment,
        s.source_domain,
        s.source_form,
        s.status::text AS status,
        s.submitted_at,
        s.raw_submission_json->>'traffic_source' AS traffic_source,
        s.raw_submission_json->>'campaign_id' AS campaign_id,
        s.raw_submission_json->>'quote_rail' AS quote_rail,
        COALESCE(
          NULLIF(TRIM(s.raw_submission_json->>'business_name'), ''),
          NULLIF(TRIM(s.raw_submission_json->>'legal_business_name'), ''),
          NULLIF(TRIM(b.business_name), '')
        ) AS business_name,
        ${sqlSubmissionStatus("s")} AS pipeline_status,
        (
          SELECT q.quote_id
          FROM quotes q
          WHERE q.submission_id = s.submission_id
          ORDER BY q.created_at DESC NULLS LAST
          LIMIT 1
        ) AS latest_quote_id,
        (
          SELECT wqi.work_queue_item_id
          FROM quotes q
          JOIN work_queue_items wqi
            ON wqi.related_entity_id = q.quote_id
           AND wqi.queue_type = 'extraction_review'
          WHERE q.submission_id = s.submission_id
          ORDER BY wqi.created_at DESC
          LIMIT 1
        ) AS extraction_work_queue_item_id,
        (
          SELECT NULLIF(te.event_payload_json->>'applicationId', '')
          FROM timeline_events te
          WHERE te.submission_id = s.submission_id
            AND te.event_type IN ('coterie.application_created', 'coterie.bindable_quote', 'coterie.session')
            AND NULLIF(te.event_payload_json->>'applicationId', '') IS NOT NULL
          ORDER BY te.created_at DESC
          LIMIT 1
        ) AS coterie_application_id
      FROM submissions s
      LEFT JOIN businesses b ON b.business_id = s.business_id
      WHERE s.client_id = $1
      ORDER BY s.submitted_at DESC
      LIMIT 100
    `,
    [clientId],
  );

  const policiesRes = await pool.query(
    `
      SELECT
        p.id AS policy_id,
        p.policy_number,
        p.segment,
        p.carrier_name,
        p.policy_type,
        p.annual_premium,
        p.status,
        p.bound_at,
        p.coverage_data->>'bind_source' AS bind_source,
        s.submission_public_id
      FROM policies p
      JOIN submissions s ON s.submission_id = p.submission_id
      WHERE p.client_id = $1
      ORDER BY p.bound_at DESC NULLS LAST, p.created_at DESC
      LIMIT 50
    `,
    [clientId],
  );

  return {
    found: true,
    matchKind: meta.matchKind,
    highlightSubmissionId: meta.highlightSubmissionId ?? null,
    query: meta.query ?? "",
    client,
    businesses: businessesRes.rows,
    submissions: submissionsRes.rows,
    policies: policiesRes.rows,
  };
}

/**
 * @param {import('pg').Pool} pool
 * @param {string} pattern
 */
async function findClientsByBusinessName(pool, pattern) {
  const res = await pool.query(
    `
      SELECT DISTINCT ON (c.client_id)
        c.client_id,
        c.primary_email,
        COALESCE(
          NULLIF(TRIM(b.business_name), ''),
          NULLIF(TRIM(s.raw_submission_json->>'business_name'), ''),
          NULLIF(TRIM(s.raw_submission_json->>'legal_business_name'), '')
        ) AS matched_business_name,
        s.submission_public_id,
        s.segment::text AS segment,
        s.submitted_at
      FROM submissions s
      JOIN clients c ON c.client_id = s.client_id
      LEFT JOIN businesses b ON b.business_id = s.business_id
      WHERE b.business_name ILIKE $1
         OR b.dba_name ILIKE $1
         OR NULLIF(TRIM(s.raw_submission_json->>'business_name'), '') ILIKE $1
         OR NULLIF(TRIM(s.raw_submission_json->>'legal_business_name'), '') ILIKE $1
         OR EXISTS (
           SELECT 1 FROM businesses bx
           WHERE bx.client_id = c.client_id
             AND (bx.business_name ILIKE $1 OR bx.dba_name ILIKE $1)
         )
      ORDER BY c.client_id, s.submitted_at DESC
    `,
    [pattern],
  );

  const byClient = new Map();
  for (const row of res.rows) {
    if (!byClient.has(row.client_id)) {
      byClient.set(row.client_id, row);
    }
  }
  return [...byClient.values()].slice(0, BUSINESS_MATCH_LIMIT);
}

/**
 * @param {import('pg').Pool} pool
 * @param {string} [rawQuery]
 * @param {{ clientId?: string }} [opts] — direct load after disambiguation
 */
export async function searchOperatorClient(pool, rawQuery, opts = {}) {
  const directClientId = String(opts.clientId || "").trim();
  if (directClientId) {
    return loadOperatorClientProfile(pool, directClientId, {
      matchKind: "client_id",
      query: rawQuery?.trim() || "",
    });
  }

  const parsed = parseOperatorSearchQuery(rawQuery);
  if (parsed.mode === "invalid") {
    return { found: false, message: parsed.message };
  }

  let clientId = null;
  let matchKind = parsed.mode;
  let highlightSubmissionId = null;

  if (parsed.mode === "submission_id") {
    const subRes = await pool.query(
      `SELECT client_id, submission_public_id FROM submissions WHERE submission_public_id = $1 LIMIT 1`,
      [parsed.value],
    );
    if (!subRes.rows.length) {
      return {
        found: false,
        message: `No submission found for ${parsed.value}.`,
      };
    }
    clientId = subRes.rows[0].client_id;
    highlightSubmissionId = subRes.rows[0].submission_public_id;
  } else if (parsed.mode === "email") {
    const clientRes = await pool.query(
      `SELECT client_id FROM clients WHERE primary_email = $1 LIMIT 1`,
      [parsed.value],
    );
    if (!clientRes.rows.length) {
      return {
        found: false,
        message: `No client found for ${parsed.value}.`,
      };
    }
    clientId = clientRes.rows[0].client_id;
  } else if (parsed.mode === "business_name") {
    const pattern = ilikePattern(parsed.value);
    const matches = await findClientsByBusinessName(pool, pattern);
    if (!matches.length) {
      return {
        found: false,
        message: `No business name match for “${parsed.value}”.`,
      };
    }
    if (matches.length === 1) {
      clientId = matches[0].client_id;
      highlightSubmissionId = matches[0].submission_public_id;
    } else {
      return {
        found: false,
        ambiguous: true,
        message: `${matches.length} clients match “${parsed.value}”. Pick one below.`,
        choices: matches.map((m) => ({
          client_id: m.client_id,
          primary_email: m.primary_email,
          matched_business_name: m.matched_business_name,
          submission_public_id: m.submission_public_id,
          segment: m.segment,
          submitted_at: m.submitted_at,
        })),
        query: rawQuery.trim(),
      };
    }
  }

  return loadOperatorClientProfile(pool, clientId, {
    matchKind,
    highlightSubmissionId,
    query: rawQuery.trim(),
  });
}

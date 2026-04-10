/**
 * Server-side context for /api/connect/chat: authoritative carrier name + carrier_knowledge FTS.
 */

async function resolveCarrierSlug(pool, carrierName) {
  if (!carrierName) return null;
  const raw = String(carrierName).trim();
  const slugify = (s) =>
    String(s)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "")
      .slice(0, 64) || null;

  const exact = await pool.query(
    `SELECT slug FROM carriers WHERE lower(trim(name)) = lower(trim($1)) LIMIT 1`,
    [raw],
  );
  if (exact.rows.length) return exact.rows[0].slug;

  const r = await pool.query(
    `SELECT slug FROM carriers
     WHERE $1::text ILIKE '%' || name || '%'
        OR name ILIKE '%' || $1 || '%'
     ORDER BY length(name) ASC
     LIMIT 1`,
    [raw],
  );
  if (r.rows.length) return r.rows[0].slug;
  return slugify(raw);
}

async function resolveCatalogName(pool, slug) {
  if (!slug) return null;
  const r = await pool.query(`SELECT name FROM carriers WHERE slug = $1`, [slug]);
  return r.rows.length ? r.rows[0].name : null;
}

/**
 * Same FTS + rank as GET /api/connect/knowledge/search (aligned WHERE clause).
 */
async function fetchKnowledgeSnippets(pool, carrierSlug, segment, searchText, limit = 8) {
  const q = String(searchText || "").trim();
  if (!q || !carrierSlug) return [];

  const cap = Math.min(Math.max(Number(limit) || 8, 1), 15);
  const params = [carrierSlug, segment, q];
  const sql = `
    SELECT id, topic, content, category, source_label
    FROM carrier_knowledge
    WHERE carrier_slug = $1
      AND is_published = true
      AND (segment::text = $2 OR segment IS NULL)
      AND to_tsvector('english', topic || ' ' || content) @@ plainto_tsquery('english', $3)
    ORDER BY ts_rank(
      to_tsvector('english', topic || ' ' || content),
      plainto_tsquery('english', $3)
    ) DESC
    LIMIT ${cap}
  `;
  const { rows } = await pool.query(sql, params);
  if (rows.length > 0) return rows;

  // Fallback: ILIKE on long keywords if FTS is too strict
  const words = q
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3)
    .slice(0, 5);
  if (words.length === 0) return [];

  const orConds = words.map((_, i) => `(topic || ' ' || content) ILIKE $${i + 3}`);
  const params2 = [carrierSlug, segment, ...words.map((w) => `%${w}%`)];
  const sql2 = `
    SELECT id, topic, content, category, source_label
    FROM carrier_knowledge
    WHERE carrier_slug = $1
      AND is_published = true
      AND (segment::text = $2 OR segment IS NULL)
      AND (${orConds.join(" OR ")})
    ORDER BY category, topic ASC
    LIMIT ${cap}
  `;
  const res2 = await pool.query(sql2, params2);
  return res2.rows;
}

function formatKnowledgeBlock(rows) {
  if (!rows || rows.length === 0) {
    return "";
  }
  return rows
    .map(
      (r, i) =>
        `### Snippet ${i + 1} [${r.category}] ${r.topic}\n` +
        `Source: ${r.source_label || "carrier KB"}\n` +
        `${r.content}`,
    )
    .join("\n\n");
}

/**
 * @param {import("pg").Pool} pool
 * @param {string} clientId
 * @param {{ policyContext?: unknown, message: string, chatHistory?: unknown[], aiSummary?: unknown }} body
 */
export async function buildEnrichedChatInput(pool, clientId, body) {
  const message = String(body?.message || "").trim();
  const clientPolicy =
    body?.policyContext && typeof body.policyContext === "object" ? body.policyContext : {};

  const pol = await pool.query(
    `SELECT * FROM policies
     WHERE client_id = $1::uuid AND status = 'active'
     ORDER BY effective_date DESC NULLS LAST
     LIMIT 1`,
    [clientId],
  );

  let carrierDisplayName = null;
  let carrierSlug = null;
  let segment = null;
  let mergedPolicy = { ...clientPolicy };

  if (pol.rows.length) {
    const row = pol.rows[0];
    segment = row.segment;

    if (row.carrier_slug) {
      carrierSlug = row.carrier_slug;
      carrierDisplayName = await resolveCatalogName(pool, carrierSlug);
    }
    if (!carrierSlug) {
      const cn = row.carrier_name || "";
      carrierSlug = await resolveCarrierSlug(pool, cn);
    }
    if (!carrierDisplayName && carrierSlug) {
      carrierDisplayName = await resolveCatalogName(pool, carrierSlug);
    }
    if (!carrierDisplayName) {
      carrierDisplayName = row.carrier_name || null;
    }

    // Server policy row is source of truth (avoid stale client policyContext overriding DB).
    mergedPolicy = {
      ...mergedPolicy,
      id: row.id,
      policy_number: row.policy_number,
      segment: row.segment,
      carrier: carrierDisplayName || row.carrier_name || null,
      carrier_slug: carrierSlug,
      premium: row.annual_premium != null ? Number(row.annual_premium) : undefined,
      coverage_data: row.coverage_data,
      effective_date: row.effective_date,
      expiration_date: row.expiration_date,
      status: row.status,
    };
  }

  const knowledgeRows = carrierSlug
    ? await fetchKnowledgeSnippets(pool, carrierSlug, segment, message)
    : [];

  return {
    policyContext: mergedPolicy,
    chatHistory: Array.isArray(body?.chatHistory) ? body.chatHistory : [],
    aiSummary: body?.aiSummary,
    carrierDisplayName,
    carrierSlug,
    knowledgeRows,
    knowledgeBlock: formatKnowledgeBlock(knowledgeRows),
  };
}

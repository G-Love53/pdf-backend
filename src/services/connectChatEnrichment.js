/**
 * Server-side context for /api/connect/chat: authoritative carrier name + carrier_knowledge FTS
 * + Famous `carrier_resources` (Train AI uploads) when Supabase is configured on CID-PDF-API.
 */
import { searchCarrierKnowledgeRows } from "../lib/carrierKnowledgeSearch.js";
import { fetchCarrierResourcesPromptBlock } from "./connectCarrierResourcesPrompt.js";

async function searchPolicyDocumentChunks(pool, policyId, searchText, limit = 5) {
  if (!policyId || !searchText) return [];
  try {
    const { rows } = await pool.query(
      `
        SELECT
          content,
          document_id,
          document_role,
          chunk_index,
          ts_rank(content_tsv, q) AS rank
        FROM policy_document_chunks, plainto_tsquery('english', $1) q
        WHERE policy_id = $2::uuid
          AND index_status = 'indexed'
          AND content_tsv @@ q
        ORDER BY rank DESC, chunk_index ASC
        LIMIT $3
      `,
      [searchText, policyId, Math.min(Math.max(Number(limit) || 5, 1), 12)],
    );
    return rows;
  } catch (e) {
    console.error("[connectChatEnrichment] policy_document_chunks search failed:", e?.message || e);
    return [];
  }
}

function formatPolicyExcerptBlock(rows) {
  if (!rows || rows.length === 0) return "";
  return rows
    .map((r, i) => {
      const role = r.document_role ? `role=${r.document_role}` : "role=unknown";
      const idx = Number.isFinite(Number(r.chunk_index))
        ? ` chunk=${Number(r.chunk_index)}`
        : "";
      return `### Policy Excerpt ${i + 1} (${role}${idx})\n${String(r.content || "").trim()}`;
    })
    .join("\n\n");
}

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

  // SELECT * only — do not JOIN on policies.carrier_slug; many DBs have no carrier_slug column yet.
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
  let activePolicyId = null;

  if (pol.rows.length) {
    const row = pol.rows[0];
    activePolicyId = row.id || null;
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

  let knowledgeRows = [];
  if (carrierSlug) {
    try {
      knowledgeRows = await searchCarrierKnowledgeRows(pool, {
        carrierSlug,
        segment,
        searchText: message,
        limit: 10,
      });
    } catch (e) {
      console.error("[connectChatEnrichment] carrier_knowledge search failed:", e?.message || e);
    }
  }

  let trainAiBlock = "";
  try {
    trainAiBlock = await fetchCarrierResourcesPromptBlock(
      carrierDisplayName,
      segment,
      message,
    );
  } catch (e) {
    console.warn(
      "[connectChatEnrichment] carrier_resources prompt block failed:",
      e?.message || e,
    );
  }

  const kbParts = [formatKnowledgeBlock(knowledgeRows), trainAiBlock].filter(
    (s) => String(s || "").trim(),
  );
  const knowledgeBlock = kbParts.join(
    "\n\n--- CARRIER RESOURCES (Train AI metadata) ---\n\n",
  );

  const policyExcerptRows = await searchPolicyDocumentChunks(
    pool,
    activePolicyId,
    message,
    5,
  );
  const policyPdfExcerptsBlock = formatPolicyExcerptBlock(policyExcerptRows);
  if (process.env.CONNECT_CHAT_PROMPT_DEBUG === "true") {
    console.log("[connectChatEnrichment] policy excerpt rows:", policyExcerptRows.length);
  }

  return {
    policyContext: mergedPolicy,
    chatHistory: Array.isArray(body?.chatHistory) ? body.chatHistory : [],
    aiSummary: body?.aiSummary,
    carrierDisplayName,
    carrierSlug,
    knowledgeRows,
    knowledgeBlock,
    policyPdfExcerptsBlock,
    policyExcerptRows,
  };
}

/**
 * Full-text search for carrier_knowledge — shared by Connect chat and GET /knowledge/search.
 * plainto_tsquery on a long user question often ANDs too many terms (e.g. "wet" not in KB);
 * we try websearch + plain + domain fallbacks, then ILIKE on stemmed tokens.
 */

const STOP = new Set([
  "the",
  "and",
  "for",
  "are",
  "but",
  "not",
  "you",
  "all",
  "can",
  "her",
  "was",
  "one",
  "our",
  "out",
  "day",
  "get",
  "has",
  "him",
  "his",
  "how",
  "its",
  "may",
  "new",
  "now",
  "old",
  "see",
  "two",
  "way",
  "who",
  "boy",
  "did",
  "let",
  "put",
  "say",
  "she",
  "too",
  "use",
  "that",
  "this",
  "with",
  "have",
  "from",
  "they",
  "been",
  "call",
  "come",
  "each",
  "made",
  "many",
  "more",
  "most",
  "much",
  "such",
  "than",
  "them",
  "well",
  "were",
  "what",
  "when",
  "will",
  "your",
  "about",
  "after",
  "again",
  "could",
  "every",
  "first",
  "going",
  "great",
  "might",
  "never",
  "other",
  "shall",
  "should",
  "still",
  "their",
  "there",
  "these",
  "think",
  "those",
  "under",
  "where",
  "which",
  "while",
  "would",
  "am",
  "is",
  "are",
  "be",
  "do",
  "if",
  "in",
  "it",
  "me",
  "my",
  "no",
  "of",
  "on",
  "or",
  "so",
  "to",
  "up",
  "we",
  "i",
  "a",
  "an",
  "as",
  "at",
  "by",
  "covered",
  "cover",
  "coverage",
]);

function ilikeTokens(q) {
  const raw = String(q || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  const out = new Set();
  for (const w of raw) {
    if (w.length < 3 || STOP.has(w)) continue;
    out.add(w);
    if (w.length > 4 && w.endsWith("s") && !w.endsWith("ss")) {
      out.add(w.slice(0, -1));
    }
  }
  const s = String(q || "").toLowerCase();
  if (/slip|wet|floor|trip|fall|injur|customer|patron|premise|liability/i.test(s)) {
    out.add("slip");
    out.add("fall");
  }
  if (/claim|loss|fnol|notice|report|damage|incident/i.test(s)) {
    out.add("claim");
    out.add("report");
    out.add("notice");
  }
  return [...out].slice(0, 10);
}

/**
 * @param {import("pg").Pool} pool
 * @param {{
 *   carrierSlug: string,
 *   segment: string | null,
 *   searchText: string,
 *   category?: string | null,
 *   limit?: number,
 * }} opts
 */
export async function searchCarrierKnowledgeRows(pool, opts) {
  const carrierSlug = opts.carrierSlug;
  const segment = opts.segment;
  const q = String(opts.searchText || "").trim();
  const category = opts.category;
  const cap = Math.min(Math.max(Number(opts.limit) || 10, 1), 25);

  if (!q || !carrierSlug) return [];

  const baseParams = [carrierSlug, segment];
  const whereSegment = `AND (
    ($2::text IS NULL OR segment::text = $2 OR segment IS NULL)
  )`;

  /** @type {{ rankSql: string, whereSql: string, params: unknown[] }[]} */
  const strategies = [];

  strategies.push({
    rankSql: `ts_rank(
      to_tsvector('english', topic || ' ' || content),
      websearch_to_tsquery('english', $3)
    )`,
    whereSql: `to_tsvector('english', topic || ' ' || content) @@ websearch_to_tsquery('english', $3)`,
    params: [...baseParams, q],
  });

  strategies.push({
    rankSql: `ts_rank(
      to_tsvector('english', topic || ' ' || content),
      plainto_tsquery('english', $3)
    )`,
    whereSql: `to_tsvector('english', topic || ' ' || content) @@ plainto_tsquery('english', $3)`,
    params: [...baseParams, q],
  });

  const lc = q.toLowerCase();
  if (/slip|wet|floor|trip|fall|injur|premise|patron|customer/i.test(lc)) {
    strategies.push({
      rankSql: `ts_rank(
        to_tsvector('english', topic || ' ' || content),
        plainto_tsquery('english', 'slip fall')
      )`,
      whereSql: `to_tsvector('english', topic || ' ' || content) @@ plainto_tsquery('english', 'slip fall')`,
      params: [...baseParams],
    });
  }

  if (/claim|loss|fnol|notice|report|damage|incident|injur/i.test(lc)) {
    strategies.push({
      rankSql: `ts_rank(
        to_tsvector('english', topic || ' ' || content),
        plainto_tsquery('english', 'claim incident report notice loss')
      )`,
      whereSql: `to_tsvector('english', topic || ' ' || content) @@ plainto_tsquery('english', 'claim incident report notice loss')`,
      params: [...baseParams],
    });
  }

  for (const strat of strategies) {
    let catClause = "";
    const params = [...strat.params];
    if (category) {
      catClause = ` AND category = $${params.length + 1}`;
      params.push(category);
    }
    const sql = `
      SELECT id, topic, content, category, source_label, tags, carrier_slug, segment
      FROM carrier_knowledge
      WHERE carrier_slug = $1
        AND is_published = true
        ${whereSegment}
        AND (${strat.whereSql})
        ${catClause}
      ORDER BY ${strat.rankSql} DESC
      LIMIT ${cap}
    `;
    try {
      const { rows } = await pool.query(sql, params);
      if (rows.length > 0) return rows;
    } catch (e) {
      if (strat.whereSql.includes("websearch_to_tsquery")) {
        continue;
      }
      throw e;
    }
  }

  const words = ilikeTokens(q);
  if (words.length === 0) return [];

  const orConds = words.map((_, i) => `(topic || ' ' || content) ILIKE $${i + 3}`);
  const params2 = [...baseParams, ...words.map((w) => `%${w}%`)];
  let catClause2 = "";
  if (category) {
    catClause2 = ` AND category = $${params2.length + 1}`;
    params2.push(category);
  }
  const sql2 = `
    SELECT id, topic, content, category, source_label, tags, carrier_slug, segment
    FROM carrier_knowledge
    WHERE carrier_slug = $1
      AND is_published = true
      ${whereSegment}
      AND (${orConds.join(" OR ")})
      ${catClause2}
    ORDER BY category, topic ASC
    LIMIT ${cap}
  `;
  const res2 = await pool.query(sql2, params2);
  return res2.rows;
}

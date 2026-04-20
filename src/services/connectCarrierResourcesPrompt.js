/**
 * Train AI / Admin uploads: `carrier_resources` in Famous Supabase + `ai-training-docs` bucket.
 * PDF bytes are not read at chat time — we pass metadata + keywords so the model has indexing context.
 * Full ingestion into prompts should eventually add extracted_text or sync into carrier_knowledge.
 */
import { supabase } from "../db.js";

function normSegment(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/**
 * @param {string|null|undefined} carrierDisplayName
 * @param {string|null|undefined} segment
 * @param {string} userMessage
 * @returns {Promise<string>}
 */
export async function fetchCarrierResourcesPromptBlock(
  carrierDisplayName,
  segment,
  userMessage,
) {
  if (!supabase) return "";

  const carrier = String(carrierDisplayName || "").trim();
  const seg = normSegment(segment);
  const msg = String(userMessage || "").toLowerCase();

  /** @type {Record<string, unknown>[]} */
  let rows = [];
  async function loadRows(fields) {
    const { data, error } = await supabase
      .from("carrier_resources")
      .select(fields)
      .limit(80);
    if (error) throw error;
    return Array.isArray(data) ? data : [];
  }
  try {
    rows = await loadRows(
      "document_title, title, resource_type, keywords, file_name, carrier_name, segment, is_active, display_order",
    );
  } catch (e1) {
    try {
      rows = await loadRows("document_title, resource_type, keywords, file_name, carrier_name, segment");
    } catch (e2) {
      console.warn(
        "[connectCarrierResourcesPrompt] carrier_resources select failed:",
        e2?.message || e2,
      );
      return "";
    }
  }

  const carrierLower = carrier.toLowerCase();
  const firstTok = carrierLower.split(/\s+/).filter(Boolean)[0] || "";

  const segmentOk = (r) => {
    const rSeg = normSegment(r.segment);
    if (!seg) return true;
    if (!rSeg) return true;
    return rSeg === seg;
  };

  const carrierOk = (r) => {
    const cn = String(r.carrier_name || "").trim();
    if (!cn) return true;
    if (!carrier) return false;
    const a = cn.toLowerCase();
    const b = carrierLower;
    return a === b || a.includes(b) || b.includes(a) || (firstTok && a.includes(firstTok));
  };

  const scoreRow = (r) => {
    let score = 0;
    if (segmentOk(r)) score += 2;
    const cn = String(r.carrier_name || "").toLowerCase();
    if (carrier && cn && carrierOk(r)) score += 5;
    const kw = String(r.keywords || "").toLowerCase();
    if (kw && msg) {
      for (const w of kw.split(/[,\s]+/)) {
        if (w.length > 3 && msg.includes(w)) score += 2;
      }
    }
    const title = String(r.document_title || r.title || "").toLowerCase();
    if (firstTok && title.includes(firstTok)) score += 1;
    const ord = Number(r.display_order);
    if (Number.isFinite(ord)) score += (100 - Math.min(ord, 99)) / 200;
    return score;
  };

  const filtered = rows
    .filter((r) => r.is_active !== false)
    .filter((r) => segmentOk(r))
    .filter((r) => carrierOk(r))
    .sort((a, b) => scoreRow(b) - scoreRow(a))
    .slice(0, 12);

  if (!filtered.length) return "";

  return filtered
    .map((r, i) => {
      const title = String(r.document_title || r.title || r.file_name || "Resource").trim();
      const type = String(r.resource_type || "doc");
      const kw = String(r.keywords || "").trim();
      const cn = String(r.carrier_name || "—").trim();
      const rs = String(r.segment || "all").trim();
      return (
        `### Train AI resource ${i + 1} [${type}]\n` +
        `Title: ${title}\n` +
        `Carrier tag: ${cn} | Segment: ${rs}\n` +
        (kw ? `Keywords / topics: ${kw}\n` : "") +
        `(Uploaded reference — not proof of in-force coverage; align answers with COVERAGE DETAILS JSON.)`
      );
    })
    .join("\n\n");
}

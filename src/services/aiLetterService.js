import { build as buildBarPrompt } from "../prompts/letters/bar.js";
import { build as buildPlumberPrompt } from "../prompts/letters/plumber.js";
import { build as buildRooferPrompt } from "../prompts/letters/roofer.js";
import { build as buildHvacPrompt } from "../prompts/letters/hvac.js";
import { build as buildElectricalPrompt } from "../prompts/letters/electrical.js";
const LETTER_PROMPTS = {
  bar: buildBarPrompt,
  roofer: buildRooferPrompt,
  plumber: buildPlumberPrompt,
  hvac: buildHvacPrompt,
  fitness: buildHvacPrompt,
  electrical: buildElectricalPrompt,
};

const SEGMENT_BRAND = {
  bar: "Bar Insurance Direct",
  roofer: "Roofing Insurance Direct",
  plumber: "Plumber Insurance Direct",
  hvac: "HVAC Insurance Direct",
  fitness: "Fitness Insurance Direct",
  electrical: "Electrical Insurance Direct",
};

function segmentKey(segment) {
  return String(segment || "bar").trim().toLowerCase();
}

function brandForSegment(segment) {
  return SEGMENT_BRAND[segmentKey(segment)] || "Commercial Insurance Direct";
}

/** First name only for letter salutation (e.g. "Dave w seubert" → "Dave"). */
function deriveFirstName(clientData, contactName) {
  const raw = String(clientData?.first_name || contactName || "").trim();
  if (!raw) return "";
  return raw.split(/\s+/)[0] || "";
}

function buildFallbackLetter(segment, extractionData, clientData, _letterContext = {}) {
  const policyType = extractionData?.policy_type || "insurance";
  const carrierName = extractionData?.carrier_name || "a carrier";
  const annualPremium = extractionData?.annual_premium ?? "";
  const brand = brandForSegment(segment);

  const perOcc = extractionData?.gl_per_occurrence || "N/A";
  const agg = extractionData?.gl_aggregate || "N/A";

  const firstName =
    deriveFirstName(clientData, clientData?.contact_name) || "there";

  return `${firstName},

Thank you for requesting a commercial insurance quote through ${brand}.

We have a ${policyType} quote ready for you from ${carrierName}:

Annual Premium: $${annualPremium}
Per Occurrence Limit: ${perOcc}
Aggregate Limit: ${agg}

Your full quote packet is attached. If you'd like to move forward, simply reply to this email.

Thank you for choosing ${brand}.`;
}

function normalizeLetterText(text) {
  const t = String(text || "").trim();
  // Some models return markdown or quotes; strip common wrappers.
  return t.replace(/^```(?:text|markdown)?/i, "").replace(/```$/i, "").trim();
}

/**
 * One thank-you + one sign-off. Fixes duplicate "Commercial Insurance Direct" and
 * double thank-yous (e.g. considering + our append).
 */
function normalizeLetterClosing(text, segment) {
  let t = String(text || "").trim();
  if (!t) return t;
  const brand = brandForSegment(segment);

  while (/Commercial Insurance Direct\.\s*Commercial Insurance Direct\.?/i.test(t)) {
    t = t.replace(/Commercial Insurance Direct\.\s*Commercial Insurance Direct\.?/gi, "Commercial Insurance Direct.");
  }
  t = t.replace(/\bCommercial Insurance Direct\s+Commercial Insurance Direct\b/gi, "Commercial Insurance Direct");

  t = t.replace(
    /\bThank you for considering Commercial Insurance Direct\.\s*Commercial Insurance Direct\.?/gi,
    "Thank you for considering Commercial Insurance Direct.",
  );

  t = t.replace(
    /\bThank you for choosing Commercial Insurance Direct\./gi,
    `Thank you for choosing ${brand}.`,
  );
  t = t.replace(
    /\bThank you for considering Commercial Insurance Direct\./gi,
    `Thank you for considering ${brand}.`,
  );

  const hasThank = /\bThank you for (choosing|considering)\b/i.test(t);

  if (!hasThank) {
    return `${t}\n\nThank you for choosing ${brand}.`;
  }

  return t;
}

function rewriteSalutation(letterText, firstName) {
  const fn = String(firstName || "").trim();
  const target = fn ? `${fn},` : "Hello,";
  const lines = String(letterText || "").split(/\r?\n/);
  let openerIndex = -1;
  for (let i = 0; i < Math.min(lines.length, 8); i += 1) {
    const t = lines[i].trim();
    if (!t) continue;
    if (
      /^client,?$/i.test(t) ||
      /^dear\b.*,/i.test(t) ||
      /^hi\b.*,/i.test(t) ||
      /^hello\b.*,/i.test(t) ||
      (fn && new RegExp(`^${fn.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")},?$`, "i").test(t))
    ) {
      openerIndex = i;
      break;
    }
  }

  if (openerIndex < 0) {
    const body = String(letterText || "").trim();
    return `${target}\n\n${body}`;
  }

  lines[openerIndex] = target;
  const out = [];
  let salutationDone = false;
  const skipRe = fn
    ? new RegExp(`^(dear\\s+)?${fn.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i")
    : /^dear\b/i;

  for (let i = 0; i < lines.length; i += 1) {
    const trimmed = lines[i].trim();
    if (!salutationDone) {
      out.push(lines[i]);
      if (i === openerIndex) salutationDone = true;
      continue;
    }
    if (!trimmed) {
      out.push(lines[i]);
      continue;
    }
    if (/^dear\b.*,/i.test(trimmed) || /^hi\b.*,/i.test(trimmed)) {
      continue;
    }
    if (skipRe.test(trimmed) && (trimmed.endsWith(",") || /^dear\b/i.test(trimmed))) {
      continue;
    }
    out.push(lines[i]);
  }
  return out.join("\n");
}

function stringHasCoverage(claimText, extraction) {
  const blob = JSON.stringify(extraction || {}).toLowerCase();
  const t = String(claimText || "").toLowerCase();
  if (/workers?\s*comp/.test(t)) {
    return (
      extraction?.wc_included === true ||
      extraction?.workers_comp_included === true ||
      extraction?.workers_comp === true ||
      /\bworkers?\s*comp(ensation)?\b/.test(blob)
    );
  }
  if (/liquor/.test(t)) {
    return (
      extraction?.liquor_liability_included === true ||
      extraction?.liquor_liability_limit != null ||
      /\bliquor\b/.test(blob)
    );
  }
  if (/cyber/.test(t)) {
    return extraction?.cyber_included === true || /\bcyber\b/.test(blob);
  }
  if (/umbrella/.test(t)) {
    return extraction?.umbrella_included === true || /\bumbrella\b/.test(blob);
  }
  return true;
}

function applyCoverageGuardrails(letterText, extraction) {
  const text = String(letterText || "");
  if (!text) return text;

  const paras = text.split(/\n\s*\n/g);
  const outParas = paras.map((para) => {
    const cleaned = para
      .trim()
      .replace(/\beverything covered\b/gi, "coverage tailored to your quote details")
      .replace(/\beverything you need in one policy\b/gi, "a policy package aligned to the quote details");
    const sentences = cleaned.split(/(?<=[.!?])\s+/);
    const filtered = sentences.filter((s) => stringHasCoverage(s, extraction));
    return filtered.join(" ").trim();
  });

  const out = outParas.filter(Boolean).join("\n\n").trim();
  return out || text;
}

async function withTimeout(promiseFactory, timeoutMs) {
  const timeout = Number(timeoutMs || 0);
  if (!Number.isFinite(timeout) || timeout <= 0) {
    return promiseFactory();
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    return await promiseFactory(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

async function callClaude(systemPrompt, userPrompt) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");

  const model = process.env.ANTHROPIC_LETTER_MODEL || "claude-sonnet-4-6";
  // Default 28s: 9s was aborting healthy Sonnet calls ("This operation was aborted").
  // Keep under typical ~30s edge timeouts; raise via CLAUDE_LETTER_TIMEOUT_MS if your host allows.
  const timeoutMs = Number(process.env.CLAUDE_LETTER_TIMEOUT_MS || 28000);

  const resp = await withTimeout(
    (signal) =>
      fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        signal,
        body: JSON.stringify({
          model,
          max_tokens: Number(process.env.LETTER_MAX_TOKENS || 1200),
          system: systemPrompt,
          messages: [{ role: "user", content: userPrompt }],
          temperature: Number(process.env.LETTER_TEMPERATURE || 0.4),
        }),
      }),
    timeoutMs,
  );

  if (!resp.ok) {
    const txt = await resp.text().catch(() => "");
    throw new Error(`Claude letter failed: ${resp.status} ${resp.statusText} - ${txt}`);
  }

  const data = await resp.json();
  const first = (data?.content || []).find((c) => c?.type === "text") || data?.content?.[0];
  const text = first?.text || "";
  if (!text) throw new Error("Claude letter response missing text");
  return text;
}

async function callGeminiFallback(systemPrompt, userPrompt) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not configured");

  const timeoutMs = Number(process.env.GEMINI_LETTER_TIMEOUT_MS || 9000);
  const model = process.env.GEMINI_LETTER_MODEL || "gemini-2.5-flash";

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model,
  )}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const text = [systemPrompt, userPrompt].join("\n\n");

  const resp = await withTimeout(
    (signal) =>
      fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal,
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text }] }],
        }),
      }),
    timeoutMs,
  );

  if (!resp.ok) {
    const txt = await resp.text().catch(() => "");
    const err = new Error(`Gemini letter failed: ${resp.status} ${resp.statusText} - ${txt}`);
    err.status = resp.status;
    throw err;
  }

  const data = await resp.json();
  const cand = data?.candidates?.[0];
  const partText = cand?.content?.parts?.[0]?.text;
  const fallbackText = partText || "";
  if (!fallbackText) throw new Error("Gemini letter response missing text");
  return fallbackText;
}

function finalizeLetterBody(text, extraction, segment) {
  return normalizeLetterClosing(applyCoverageGuardrails(text, extraction), segment);
}

export async function generateLetter(segment, extractionData, clientData, letterContext = {}) {
  const seg = segmentKey(segment);
  const promptBuilder = LETTER_PROMPTS[seg];
  const extraction = extractionData || {};
  const client = clientData || {};
  const businessName = client.business_name || extraction.business_name || extraction.insured_name || "";
  const salutationName = deriveFirstName(
    client,
    client.contact_name ||
      client.business_name ||
      extraction.business_name ||
      extraction.insured_name ||
      "",
  );

  if (!promptBuilder) {
    return finalizeLetterBody(
      rewriteSalutation(buildFallbackLetter(seg, extraction, client, letterContext), salutationName),
      extraction,
      seg,
    );
  }

  const { systemPrompt, userPrompt } = promptBuilder(extraction, client, letterContext);

  // Primary: Claude
  try {
    const t = await callClaude(systemPrompt, userPrompt);
    return finalizeLetterBody(
      rewriteSalutation(normalizeLetterText(t), salutationName),
      extraction,
      seg,
    );
  } catch (err) {
    console.warn("[aiLetterService] Claude failed; falling back:", err?.message || err);
  }

  // Secondary: Gemini (optional; 429 = quota/billing — do not slow the request retrying)
  try {
    const t = await callGeminiFallback(systemPrompt, userPrompt);
    return finalizeLetterBody(
      rewriteSalutation(normalizeLetterText(t), salutationName),
      extraction,
      seg,
    );
  } catch (err) {
    const isQuota =
      err?.status === 429 ||
      /429|quota|RESOURCE_EXHAUSTED/i.test(String(err?.message || err));
    console.warn(
      "[aiLetterService] Gemini failed; using last-resort template:",
      err?.message || err,
      isQuota ? "(check Gemini billing / rate limits for GEMINI_API_KEY)" : "",
    );
  }

  // Last resort: template-based letter (still produces page 1 in the packet PDF).
  console.warn(
    "[aiLetterService] letter_source=template_fallback (Claude and Gemini did not return body text)",
  );
  return finalizeLetterBody(
    rewriteSalutation(buildFallbackLetter(seg, extraction, client, letterContext), salutationName),
    extraction,
    seg,
  );
}


import { build as buildBarPrompt } from "../prompts/letters/bar.js";
import { build as buildPlumberPrompt } from "../prompts/letters/plumber.js";
import { build as buildRooferPrompt } from "../prompts/letters/roofer.js";
import { build as buildHvacPrompt } from "../prompts/letters/hvac.js";

const LETTER_PROMPTS = {
  bar: buildBarPrompt,
  roofer: buildRooferPrompt,
  plumber: buildPlumberPrompt,
  hvac: buildHvacPrompt,
};

function segmentKey(segment) {
  return String(segment || "bar").trim().toLowerCase();
}

function buildFallbackLetter(segment, extractionData, clientData) {
  const policyType = extractionData?.policy_type || "insurance";
  const carrierName = extractionData?.carrier_name || "a carrier";
  const annualPremium = extractionData?.annual_premium ?? "";

  const perOcc = extractionData?.gl_per_occurrence || "N/A";
  const agg = extractionData?.gl_aggregate || "N/A";

  const dearName = clientData?.contact_name || clientData?.business_name || "Business Owner";

  return `Dear ${dearName},

Thank you for requesting a commercial insurance quote through Commercial Insurance Direct.

We have a ${policyType} quote ready for you from ${carrierName}:

Annual Premium: $${annualPremium}
Per Occurrence Limit: ${perOcc}
Aggregate Limit: ${agg}

Your full quote packet is attached. If you'd like to move forward, simply reply to this email.

— CID Team
Commercial Insurance Direct`;
}

function normalizeLetterText(text) {
  const t = String(text || "").trim();
  // Some models return markdown or quotes; strip common wrappers.
  return t.replace(/^```(?:text|markdown)?/i, "").replace(/```$/i, "").trim();
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

  const model = process.env.ANTHROPIC_LETTER_MODEL || "claude-sonnet-4-20250514";
  const timeoutMs = Number(process.env.CLAUDE_LETTER_TIMEOUT_MS || 9000);

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
          max_tokens: Number(process.env.LETTER_MAX_TOKENS || 900),
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
  const model = process.env.GEMINI_LETTER_MODEL || "gemini-2.0-flash";

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
    throw new Error(`Gemini letter failed: ${resp.status} ${resp.statusText} - ${txt}`);
  }

  const data = await resp.json();
  const cand = data?.candidates?.[0];
  const partText = cand?.content?.parts?.[0]?.text;
  const fallbackText = partText || "";
  if (!fallbackText) throw new Error("Gemini letter response missing text");
  return fallbackText;
}

export async function generateLetter(segment, extractionData, clientData) {
  const seg = segmentKey(segment);
  const promptBuilder = LETTER_PROMPTS[seg];
  const extraction = extractionData || {};
  const client = clientData || {};

  if (!promptBuilder) {
    return buildFallbackLetter(seg, extraction, client);
  }

  const { systemPrompt, userPrompt } = promptBuilder(extraction, client);

  // Primary: Claude
  try {
    const t = await callClaude(systemPrompt, userPrompt);
    return normalizeLetterText(t);
  } catch (err) {
    console.warn("[aiLetterService] Claude failed; falling back:", err?.message || err);
  }

  // Secondary: Gemini
  try {
    const t = await callGeminiFallback(systemPrompt, userPrompt);
    return normalizeLetterText(t);
  } catch (err) {
    console.warn("[aiLetterService] Gemini failed; using last-resort template:", err?.message || err);
  }

  // Last resort: template-based letter.
  return buildFallbackLetter(seg, extraction, client);
}


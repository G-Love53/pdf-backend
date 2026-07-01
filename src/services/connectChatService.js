/**
 * CID Connect coverage chat — Claude primary, Gemini fallback (aligns with CID AI policy).
 */
import {
  analyzeConnectCoverageQuestion,
  sanitizeConnectReplyAgainstVerdicts,
} from "./connectCoverageVerdict.js";
import {
  isPolicyDocumentQuestion,
  policyDocumentsPendingReply,
} from "./connectChatPolicyDocs.js";
function truncate(str, max) {
  const s = String(str || "");
  if (s.length <= max) return s;
  return `${s.slice(0, max)}… [truncated]`;
}

function safeField(v) {
  return v != null && v !== "" ? String(v) : "—";
}

/**
 * CID Connect "Am I covered?" chat — verify-first advisor tone + RSS (Reliable, Scalable, Sellable).
 */
function buildSystemPrompt(policyContext, aiSummary, opts = {}) {
  const pc = policyContext && typeof policyContext === "object" ? policyContext : {};

  const carrierName =
    (typeof opts.carrierDisplayName === "string" && opts.carrierDisplayName.trim()
      ? opts.carrierDisplayName.trim()
      : null) || safeField(pc.carrier);

  const carrierStrict =
    carrierName && carrierName !== "—" ? carrierName : "Not specified in this summary";

  const businessName = safeField(pc.business_name);
  const segment = safeField(pc.segment);
  const policyNumber = safeField(pc.policy_number);
  const eff = safeField(pc.effective_date);
  const exp = safeField(pc.expiration_date);
  const premium =
    pc.premium != null && pc.premium !== ""
      ? String(pc.premium)
      : "—";

  const cov = pc.coverage_data != null ? pc.coverage_data : {};
  const coverageJson = truncate(JSON.stringify(cov, null, 0), 14000);
  const policyDocsPending = opts.policyDocumentsPending === true;

  const knowledgeChunks = String(opts.knowledgeBlock || "").trim();
  const kbBlock = knowledgeChunks
    ? truncate(knowledgeChunks, 8000)
    : "(none)";
  const policyPdfChunks = String(opts.policyPdfExcerptsBlock || "").trim();
  const policyPdfBlock = policyPdfChunks
    ? truncate(policyPdfChunks, 12000)
    : "(none)";

  const summaryStr =
    typeof aiSummary === "string"
      ? truncate(aiSummary, 4000)
      : truncate(JSON.stringify(aiSummary ?? null, null, 0), 4000);

  const isFirstTurn = opts.isFirstTurn === true;
  const machineBlock = String(opts.machineVerdictBlock || "").trim();

  const disclaimerInstr = isFirstTurn
    ? `DISCLAIMER (first reply only): End with one short line:
Coverage answers are based on your policy documents when they are available.`
    : `Do not repeat the disclaimer line — this is a follow-up.`;

  const pendingInstr = policyDocsPending
    ? `POLICY DOCUMENTS NOT UPLOADED YET:
For coverage, limits, exclusions, or "am I covered" questions, tell the customer their policy documents are not in the app yet and are expected soon. Do not guess coverage. Do not cite limits or quote summaries. Keep it to 2–3 short sentences.
You may still answer brief process questions (how to report a claim, COI requests) from carrier knowledge only.`
    : "";

  return `You are the coverage guide for Commercial Insurance Direct — warm, clear, and brief. Verify before you say yes; never invent limits or coverages.

CUSTOMER-FACING LANGUAGE (strict):
- Never mention JSON, APIs, excerpts, indexes, databases, or "coverage details JSON."
- Say "your policy documents" or "your declarations" when referring to source material.
- Prefer 2–4 short sentences. Plain English. No markdown bullets unless the user asks for a list.

${pendingInstr ? `${pendingInstr}\n\n` : ""}RULES:
- Only confirm coverage when it is supported by POLICY DOCUMENT TEXT below or the internal summary block.
- Never say "you're covered" from general insurance knowledge or carrier KB alone.
- GL does not automatically include equipment breakdown, cyber, flood, professional liability, auto, or liquor liability unless shown on the policy.
- Name the insurer only as: "${carrierStrict}" (exact string).

${machineBlock ? `${machineBlock}\n\n` : ""}VOICE:
You represent the app — not "call your agent." For follow-up: "Want me to look into that?" or "I can get that quoted."

${disclaimerInstr}

CUSTOMER POLICY (high level):
Business: ${businessName}
Carrier: ${carrierStrict}
Segment: ${segment}
Policy Number: ${policyNumber}
Effective: ${eff} to ${exp}
Annual Premium: $${premium}

INTERNAL POLICY SUMMARY (do not quote this label to the customer):
${coverageJson}

POLICY DOCUMENT TEXT (internal):
${policyPdfBlock}

CARRIER REFERENCE (exclusions, claims process, add-ons — not proof of in-force coverage):
${kbBlock}

ANALYSIS SUMMARY (internal, may be empty):
${summaryStr}`;
}

function buildAnthropicMessages(chatHistory, message) {
  const msgs = [];
  const history = Array.isArray(chatHistory) ? chatHistory : [];
  for (const h of history) {
    const role = h?.role;
    const content = String(h?.content || "").trim();
    if (!content) continue;
    if (role === "user") msgs.push({ role: "user", content });
    else if (role === "assistant") msgs.push({ role: "assistant", content });
  }
  msgs.push({ role: "user", content: String(message || "").trim() });
  return msgs;
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

async function callClaudeChat(systemPrompt, messages) {
  const apiKey = String(process.env.ANTHROPIC_API_KEY || "").trim();
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");

  const model =
    process.env.ANTHROPIC_CONNECT_CHAT_MODEL ||
    process.env.ANTHROPIC_LETTER_MODEL ||
    "claude-sonnet-4-6";
  const timeoutMs = Number(process.env.CONNECT_CHAT_TIMEOUT_MS || 55000);
  const maxTokens = Number(process.env.CONNECT_CHAT_MAX_TOKENS || 1536);

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
          max_tokens: maxTokens,
          system: systemPrompt,
          messages,
          temperature: Number(process.env.CONNECT_CHAT_TEMPERATURE || 0.3),
        }),
      }),
    timeoutMs,
  );

  if (!resp.ok) {
    const txt = await resp.text().catch(() => "");
    throw new Error(`Claude chat failed: ${resp.status} ${txt}`);
  }

  const data = await resp.json();
  const first =
    (data?.content || []).find((c) => c?.type === "text") || data?.content?.[0];
  const text = String(first?.text || "").trim();
  if (!text) throw new Error("Claude chat response missing text");
  return text;
}

async function callGeminiChat(systemPrompt, chatHistory, message) {
  const apiKey = String(process.env.GEMINI_API_KEY || "").trim();
  if (!apiKey) throw new Error("GEMINI_API_KEY not configured");

  const model =
    process.env.GEMINI_CONNECT_CHAT_MODEL ||
    process.env.GEMINI_LETTER_MODEL ||
    "gemini-2.5-flash";
  const timeoutMs = Number(process.env.GEMINI_CONNECT_CHAT_TIMEOUT_MS || 55000);

  const lines = [systemPrompt, "", "Conversation:"];
  const history = Array.isArray(chatHistory) ? chatHistory : [];
  for (const h of history) {
    const role = h?.role === "assistant" ? "Assistant" : "User";
    const content = String(h?.content || "").trim();
    if (content) lines.push(`${role}: ${content}`);
  }
  lines.push(`User: ${String(message || "").trim()}`);

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model,
  )}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const genBody = {
    contents: [{ role: "user", parts: [{ text: lines.join("\n") }] }],
  };
  const gt = Number(process.env.GEMINI_CONNECT_CHAT_TEMPERATURE);
  if (Number.isFinite(gt) && gt >= 0 && gt <= 2) {
    genBody.generationConfig = { temperature: gt };
  }

  const resp = await withTimeout(
    (signal) =>
      fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal,
        body: JSON.stringify(genBody),
      }),
    timeoutMs,
  );

  if (!resp.ok) {
    const txt = await resp.text().catch(() => "");
    throw new Error(`Gemini chat failed: ${resp.status} ${txt}`);
  }

  const data = await resp.json();
  const partText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  const text = String(partText || "").trim();
  if (!text) throw new Error("Gemini chat response missing text");
  return text;
}

function fallbackReply() {
  return "I'm temporarily unable to reach our coverage assistant. Please try again in a moment.";
}

/** @returns {("claude"|"gemini")[]} */
function connectChatProviderOrder() {
  const p = String(process.env.CONNECT_CHAT_PRIMARY || "claude")
    .trim()
    .toLowerCase();
  if (p === "gemini") return ["gemini", "claude"];
  return ["claude", "gemini"];
}

/**
 * @param {{
 *   message: string,
 *   policyContext?: unknown,
 *   chatHistory?: Array<{role: string, content: string}>,
 *   aiSummary?: unknown,
 *   carrierDisplayName?: string | null,
 *   knowledgeBlock?: string,
 *   policyPdfExcerptsBlock?: string,
 * }} input
 * @returns {Promise<{ reply: string, systemPrompt: string }>}
 */
export async function generateConnectChatReply(input) {
  const message = String(input?.message || "").trim();
  if (!message) {
    return { reply: "Please enter a question.", systemPrompt: "" };
  }

  const history = Array.isArray(input?.chatHistory) ? input.chatHistory : [];
  const isFirstTurn = !history.some((h) => h?.role === "assistant");

  if (input?.policyDocumentsPending && isPolicyDocumentQuestion(message)) {
    return {
      reply: policyDocumentsPendingReply(isFirstTurn),
      systemPrompt: "",
    };
  }

  const pc = input?.policyContext && typeof input.policyContext === "object" ? input.policyContext : {};
  const { triggeredResults, machineVerdictBlock } = analyzeConnectCoverageQuestion(
    message,
    pc.coverage_data,
  );

  const systemPrompt = buildSystemPrompt(input?.policyContext, input?.aiSummary, {
    carrierDisplayName: input?.carrierDisplayName,
    knowledgeBlock: input?.knowledgeBlock,
    policyPdfExcerptsBlock: input?.policyPdfExcerptsBlock,
    policyDocumentsPending: input?.policyDocumentsPending === true,
    isFirstTurn,
    machineVerdictBlock,
  });
  const anthropicMessages = buildAnthropicMessages(input?.chatHistory, message);

  const providerErrors = [];

  for (const provider of connectChatProviderOrder()) {
    try {
      if (provider === "claude") {
        const reply = await callClaudeChat(systemPrompt, anthropicMessages);
        return {
          reply: sanitizeConnectReplyAgainstVerdicts(reply, triggeredResults),
          systemPrompt,
        };
      }
      const reply = await callGeminiChat(
        systemPrompt,
        input?.chatHistory,
        message,
      );
      return {
        reply: sanitizeConnectReplyAgainstVerdicts(reply, triggeredResults),
        systemPrompt,
      };
    } catch (err) {
      const errMsg = err?.message || String(err);
      providerErrors.push({ provider, error: errMsg });
      console.warn(`[connectChatService] ${provider} failed:`, errMsg);
    }
  }

  return {
    reply: fallbackReply(),
    systemPrompt,
    providerErrors: providerErrors.length ? providerErrors : undefined,
  };
}

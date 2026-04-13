/**
 * CID Connect coverage chat — Claude primary, Gemini fallback (aligns with CID AI policy).
 */
import {
  analyzeConnectCoverageQuestion,
  sanitizeConnectReplyAgainstVerdicts,
} from "./connectCoverageVerdict.js";
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

  const knowledgeChunks = String(opts.knowledgeBlock || "").trim();
  const kbBlock = knowledgeChunks
    ? truncate(knowledgeChunks, 12000)
    : "(none — rely on policy details above.)";

  const summaryStr =
    typeof aiSummary === "string"
      ? truncate(aiSummary, 6000)
      : truncate(JSON.stringify(aiSummary ?? null, null, 0), 6000);

  const isFirstTurn = opts.isFirstTurn === true;

  const machineBlock = String(opts.machineVerdictBlock || "").trim();

  const disclaimerInstr = isFirstTurn
    ? `DISCLAIMER (first reply in this thread only):
At the very end of your response, add one short line on its own:
Coverage guidance based on your policy summary. Actual coverage is governed by your policy documents.
Do not add this line on later replies in the same conversation.`
    : `Do NOT include the small-print disclaimer line at the end — this is a follow-up in an ongoing conversation.`;

  return `You are the coverage guide for Commercial Insurance Direct: a trusted advisor who **verifies first**, then explains. You are warm and clear, never cold or robotic — but you never trade friendliness for a wrong "yes." E&O and customer trust come from the same habit: prove it in the data, then speak like a human.

CID RSS (how every answer is judged — align with it):
- **Reliable:** Coverage and dollar amounts exist only if they appear in COVERAGE DETAILS JSON (full tree: nested objects, arrays, and structured fields — not only top-level keys) or are explicitly confirmed by MACHINE COVERAGE VERDICT when shown. If you cannot find the line in the JSON tree, treat it as **not shown on this summary** until full policy documents or a closer review confirms. Never invent limits, deductibles, sublimits, endorsements, or reporting rules.
- **Scalable:** Use the same verification habit on every question (see VERIFY BEFORE YOU ANSWER). Do not improvise one-off underwriting rules from general knowledge.
- **Sellable:** The experience should feel premium: confident when the data supports it, honest and **helpful** when it does not (next steps, what to document, add-on context from carrier knowledge as *optional*). The customer should leave informed and well served — never misled for the sake of sounding upbeat.

${machineBlock ? `${machineBlock}\n\n` : ""}VERIFY BEFORE YOU ANSWER (do this mentally every time; do not print these steps to the customer):
1) Name the specific coverage type or peril they are really asking about (e.g. equipment breakdown, liquor liability, flood, cyber, auto, business income).
2) Search the entire COVERAGE DETAILS JSON for that line: nested keys, parent sections, and arrays (summaries vary by carrier and segment). A line "counts" only if the JSON actually represents that coverage, not because GL or a package name usually implies it.
3) If there is no match in the JSON for that line: lead with **not on this policy summary** (plain language is fine: "That line isn't shown here"). Then use RELEVANT CARRIER KNOWLEDGE only for exclusions, claims process, or **add-on / endorsement** possibilities — never as proof they already have the coverage. If MACHINE COVERAGE VERDICT says ABSENT for that intent, treat that as authoritative for "do they have it."
4) If there is a match: read limits, deductibles, and conditions **only** from the JSON subtree for that line. Do not move a deductible or limit from property, GL, or another section onto this line unless the JSON ties them together explicitly.
5) If the question is ambiguous or the JSON is unclear for that point: say you cannot confirm from the summary and offer to look into it or flag for a closer look against full policy documents — do not guess.

HARD RULES (non-negotiable):
- General liability does **not** automatically include equipment breakdown, cyber, flood, earthquake, professional liability, auto, employment practices, or liquor liability. Each needs its own representation in the JSON (or explicit verdict) to treat as present.
- Never say "you're covered" or equivalent based on training data or "typical" packages — only based on this customer's JSON (and verdict block when present).
- Never transfer numbers between coverage types. Property deductible applies to property as shown; it does not apply to another line unless that line appears in JSON with that number.
- If MACHINE COVERAGE VERDICT marks a line ABSENT, carrier KB must never be framed as proof they have that line in force.

GROUND TRUTH (carrier naming):
- Whenever you name the customer's insurer (including "report to ___," "call ___," or claims), use ONLY this exact string — copy it character-for-character: "${carrierStrict}"
- If COVERAGE DETAILS JSON or any other field names a different insurer than that string, ignore it; the Carrier line above wins.
- Do not substitute a different insurance company name from memory or training unless it matches that exact string.

VOICE (Reliable + Sellable):
You ARE the customer's agent through this app. Never say "contact your account team," "speak with your agent," or "reach out to your account team." Instead say "Want me to look into that for you?" or "I can get that quoted for you" or "Let me flag this for a closer look." The customer came to the app so they DON'T have to call anyone.

- Lead with the answer (yes / no / not on this summary / can't confirm from summary), then explain in a few short paragraphs. Plain English, short sentences.
- When the answer is effectively no: stay human — protect them from a false yes, then be helpful (documentation, optional add-ons from KB if grounded, or offer to look into it / get it quoted).
- When the answer is yes: weave in limits naturally; only numbers that appear in the JSON for that line.
- Never say "contact your agent" or route them to call someone outside the app — you represent the app. For anything that needs human follow-up, use the phrasing in the paragraph above.
- Avoid stiff disclaimers in the body; the first-message disclaimer line is specified below.

FORMATTING FOR THE CUSTOMER:
- Do not use markdown or ASCII bullet lists (no lines starting with "-" or "*") unless the user explicitly asks for a list. Use short paragraphs.
- No medical or legal advice. No invented coverage.

${disclaimerInstr}

CUSTOMER'S POLICY:
Business: ${businessName}
Carrier: ${carrierStrict}
Segment: ${segment}
Policy Number: ${policyNumber}
Effective: ${eff} to ${exp}
Annual Premium: $${premium}

COVERAGE DETAILS (JSON):
${coverageJson}

RELEVANT CARRIER KNOWLEDGE (exclusions, claims handling, and optional add-ons — not proof of in-force coverage unless COVERAGE DETAILS JSON agrees):
${kbBlock}

COVERAGE ANALYSIS SUMMARY (may be empty):
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
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");

  const model =
    process.env.ANTHROPIC_CONNECT_CHAT_MODEL ||
    process.env.ANTHROPIC_LETTER_MODEL ||
    "claude-sonnet-4-20250514";
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
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not configured");

  const model =
    process.env.GEMINI_CONNECT_CHAT_MODEL ||
    process.env.GEMINI_LETTER_MODEL ||
    "gemini-2.0-flash";
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

  const pc = input?.policyContext && typeof input.policyContext === "object" ? input.policyContext : {};
  const { triggeredResults, machineVerdictBlock } = analyzeConnectCoverageQuestion(
    message,
    pc.coverage_data,
  );

  const systemPrompt = buildSystemPrompt(input?.policyContext, input?.aiSummary, {
    carrierDisplayName: input?.carrierDisplayName,
    knowledgeBlock: input?.knowledgeBlock,
    isFirstTurn,
    machineVerdictBlock,
  });
  const anthropicMessages = buildAnthropicMessages(input?.chatHistory, message);

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
      console.warn(
        `[connectChatService] ${provider} failed:`,
        err?.message || err,
      );
    }
  }

  return { reply: fallbackReply(), systemPrompt };
}

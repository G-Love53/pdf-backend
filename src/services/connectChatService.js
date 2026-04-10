/**
 * CID Connect coverage chat — Claude primary, Gemini fallback (aligns with CID AI policy).
 */
function truncate(str, max) {
  const s = String(str || "");
  if (s.length <= max) return s;
  return `${s.slice(0, max)}… [truncated]`;
}

function safeField(v) {
  return v != null && v !== "" ? String(v) : "—";
}

/**
 * CID Connect "Am I covered?" chat — tuned for advisor tone (see CID-AI-Prompt-Tuning-Chat-Letters).
 */
function buildSystemPrompt(policyContext, aiSummary, opts = {}) {
  const pc = policyContext && typeof policyContext === "object" ? policyContext : {};

  const carrierName =
    (typeof opts.carrierDisplayName === "string" && opts.carrierDisplayName.trim()
      ? opts.carrierDisplayName.trim()
      : null) || safeField(pc.carrier);

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

  const disclaimerInstr = isFirstTurn
    ? `DISCLAIMER (first reply in this thread only):
At the very end of your response, add one short line on its own:
Coverage guidance based on your policy summary. Actual coverage is governed by your policy documents.
Do not add this line on later replies in the same conversation.`
    : `Do NOT include the small-print disclaimer line at the end — this is a follow-up in an ongoing conversation.`;

  return `You are the coverage assistant for Commercial Insurance Direct. You know this customer's policy inside and out, and you talk like a trusted insurance advisor — confident, clear, and human. You're the reason they don't need to call anyone else for routine coverage questions.

GROUND TRUTH:
- The Carrier name in CUSTOMER'S POLICY below is authoritative. Use that exact insurer name. Do not substitute another carrier from training data.
- Use only the policy fields, carrier knowledge, and coverage summary below. Do not invent limits, carriers, or endorsements.
- Deductibles in coverage JSON may be per-line (e.g. property). For GL / premises injury questions, do not apply a property or equipment deductible to GL unless the data explicitly ties it to that claim type.

VOICE AND TONE:
- Talk like a real person, not a legal document. Short sentences. Plain English.
- Be confident when the answer is clear. "Yes, you're covered" not "Your policy may provide coverage depending on circumstances."
- When you cite limits or details, weave them in naturally: "Your GL covers that — you've got $1M per occurrence" not stiff policy-language quotes.
- Never say "I'd recommend contacting your agent" — YOU are their advisor through this app. If something truly needs human review (complex claim, coverage dispute), say "Let me flag this for your account team to take a closer look" not "contact your agent."
- Never say "review the full policy terms" or "this is general information only." You have the policy data. Use it.
- Use "you" and "your" — this is a conversation, not a memo.
- If you identify a coverage gap, be helpful: explain what might be missing and what could be added when the data supports it.

ANSWERING QUESTIONS:
- Lead with the answer: yes or no, then explain.
- Cite specific limits, deductibles, and coverage details from the policy data when relevant.
- When carrier knowledge is available, include practical details: what to do, what to document, timelines, reporting windows.
- For claims scenarios, give action steps — not only a coverage yes/no.
- For upsell opportunities, be genuinely helpful, not salesy — only when grounded in knowledge or policy context.

WHAT YOU DON'T DO:
- Don't hedge every answer with "it depends on circumstances." If the policy clearly covers it, say so.
- Don't use bullet points for every answer — use sentences when they read more naturally.
- Don't repeat the same limits in every response.
- Don't use insurance jargon without a quick plain-English gloss.
- Don't give medical or legal advice.
- Don't make up coverage details. If you don't see it in the data, say so and offer to flag the account team.

${disclaimerInstr}

CUSTOMER'S POLICY:
Business: ${businessName}
Carrier: ${carrierName}
Segment: ${segment}
Policy Number: ${policyNumber}
Effective: ${eff} to ${exp}
Annual Premium: $${premium}

COVERAGE DETAILS (JSON):
${coverageJson}

RELEVANT CARRIER KNOWLEDGE:
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

  const resp = await withTimeout(
    (signal) =>
      fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal,
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: lines.join("\n") }] }],
        }),
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

/**
 * @param {{
 *   message: string,
 *   policyContext?: unknown,
 *   chatHistory?: Array<{role: string, content: string}>,
 *   aiSummary?: unknown,
 *   carrierDisplayName?: string | null,
 *   knowledgeBlock?: string,
 * }} input
 * @returns {Promise<string>}
 */
export async function generateConnectChatReply(input) {
  const message = String(input?.message || "").trim();
  if (!message) {
    return "Please enter a question.";
  }

  const history = Array.isArray(input?.chatHistory) ? input.chatHistory : [];
  const isFirstTurn = !history.some((h) => h?.role === "assistant");

  const systemPrompt = buildSystemPrompt(input?.policyContext, input?.aiSummary, {
    carrierDisplayName: input?.carrierDisplayName,
    knowledgeBlock: input?.knowledgeBlock,
    isFirstTurn,
  });
  const anthropicMessages = buildAnthropicMessages(input?.chatHistory, message);

  try {
    return await callClaudeChat(systemPrompt, anthropicMessages);
  } catch (err) {
    console.warn("[connectChatService] Claude failed:", err?.message || err);
  }

  try {
    return await callGeminiChat(
      systemPrompt,
      input?.chatHistory,
      message,
    );
  } catch (err) {
    console.warn("[connectChatService] Gemini failed:", err?.message || err);
  }

  return fallbackReply();
}

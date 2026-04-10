/**
 * CID Connect coverage chat — Claude primary, Gemini fallback (aligns with CID AI policy).
 */
function truncate(str, max) {
  const s = String(str || "");
  if (s.length <= max) return s;
  return `${s.slice(0, max)}… [truncated]`;
}

function buildSystemPrompt(policyContext, aiSummary, opts = {}) {
  const carrierDisplayName =
    typeof opts.carrierDisplayName === "string" && opts.carrierDisplayName.trim()
      ? opts.carrierDisplayName.trim()
      : null;
  const knowledgeBlock = String(opts.knowledgeBlock || "").trim();

  const policyJson = truncate(
    JSON.stringify(policyContext || {}, null, 0),
    12000,
  );
  const summaryStr =
    typeof aiSummary === "string"
      ? truncate(aiSummary, 8000)
      : truncate(JSON.stringify(aiSummary ?? null, null, 0), 8000);

  const carrierSection = carrierDisplayName
    ? `Authoritative insurer name (use exactly this name; do not substitute any other carrier):
${carrierDisplayName}

`
    : "";

  const kbSection = knowledgeBlock
    ? `Carrier knowledge base (use when relevant to the user's question; prefer these details over general knowledge; mention the topic or source when you use them):
${truncate(knowledgeBlock, 10000)}

`
    : "";

  return `You are CID Connect's commercial insurance coverage assistant.

Rules:
- Answer clearly and concisely in plain English.
- Use only the policy context, carrier name, knowledge base, and coverage summary below; do not invent limits, carriers, or endorsements.
- If something is not in the context, say you don't have that detail and suggest contacting their agent or broker.
- Do not give legal advice; remind the user that the policy document is authoritative.
- When an authoritative insurer name is given above, you MUST use that exact name only. Do not substitute another insurance company name from general knowledge or training.
- Deductibles in coverage_data are often per-line (e.g. property). For a general liability / premises injury question, do not cite a property or equipment deductible as applying to GL liability unless the JSON explicitly ties that deductible to GL liability or the claim type.

${carrierSection}${kbSection}Policy context (JSON):
${policyJson}

Coverage analysis summary (may be empty):
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
  const maxTokens = Number(process.env.CONNECT_CHAT_MAX_TOKENS || 1024);

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
  return "I'm temporarily unable to reach our coverage assistant. Please try again in a moment, or contact your agent for policy questions.";
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

  const systemPrompt = buildSystemPrompt(input?.policyContext, input?.aiSummary, {
    carrierDisplayName: input?.carrierDisplayName,
    knowledgeBlock: input?.knowledgeBlock,
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

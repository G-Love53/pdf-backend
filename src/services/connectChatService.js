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

  const disclaimerInstr = isFirstTurn
    ? `DISCLAIMER (first reply in this thread only):
At the very end of your response, add one short line on its own:
Coverage guidance based on your policy summary. Actual coverage is governed by your policy documents.
Do not add this line on later replies in the same conversation.`
    : `Do NOT include the small-print disclaimer line at the end — this is a follow-up in an ongoing conversation.`;

  return `You are the coverage assistant for Commercial Insurance Direct. You know this customer's policy inside and out, and you talk like a trusted insurance advisor — confident, clear, and human. You're the reason they don't need to call anyone else for routine coverage questions.

COVERAGE INVENTORY — READ FIRST (NON-NEGOTIABLE / E&O):
- The ONLY source of truth for what this policy includes is the COVERAGE DETAILS (JSON) block below. It is a summary of in-force coverage as we have it.
- NEVER state or imply that the customer has a coverage line, endorsement, or peril covered unless it is actually represented in that JSON (including nested keys such as general_liability, property, liquor_liability, workers_comp, equipment_breakdown, etc.). If a coverage type is missing from the JSON, they do NOT have it on this policy per this summary — say that clearly. Do not fill gaps with "typical" or "standard" packages.
- Before answering any question about coverage for a scenario (equipment failure, liquor claim, hired auto, business income, etc.), mentally check: does the JSON include that line of coverage? If NO → your answer must be that they are not covered for that under this summary, then what to do next (see below). Do NOT invent deductibles, limits, or claim mechanics for coverage that is not in the JSON.
- NEVER hallucinate endorsements, sublimits, waiting periods, or deductibles for coverage types that are not documented in the JSON.
- Deductibles and limits in the JSON are tied to the sections where they appear (e.g. property.deductible applies to property — not to a hypothetical equipment breakdown line that does not exist in the JSON).
- After a clear "not covered on this summary" when appropriate, you MAY use RELEVANT CARRIER KNOWLEDGE to describe whether the carrier often offers that protection as an add-on or endorsement — phrase it as optional / not in force, not as something they already have.
- If carrier knowledge does not mention an add-on, do not invent pricing or availability; offer to flag the account team.

GROUND TRUTH:
- Whenever you name the customer's insurer (including "report to ___," "call ___," or claims), use ONLY this exact string — copy it character-for-character: "${carrierStrict}"
- If COVERAGE DETAILS JSON or any other field names a different insurer than that string, ignore it; the Carrier line above wins.
- Do not substitute a different insurance company name from memory or training unless it matches that exact string.
- Use only the policy fields, carrier knowledge, and coverage summary below. Do not invent limits, carriers, or endorsements.

VOICE AND TONE:
- Talk like a real person, not a legal document. Short sentences. Plain English.
- Be confident only when the JSON clearly supports the coverage you're describing. "Yes, you're covered" is correct only if that coverage line exists in COVERAGE DETAILS. If it does not, be equally clear: "You don't have that on this policy per your summary" — not "your policy may provide."
- When you cite limits or details, weave them in naturally: "Your GL covers that — you've got $1M per occurrence" not stiff policy-language quotes.
- Never say "I'd recommend contacting your agent" — YOU are their advisor through this app. If something truly needs human review (complex claim, coverage dispute), say "Let me flag this for your account team to take a closer look" not "contact your agent."
- Never say "review the full policy terms" or "this is general information only." You have the policy data. Use it.
- Use "you" and "your" — this is a conversation, not a memo.
- If you identify a coverage gap, be helpful: explain what might be missing and what could be added when the data supports it.

ANSWERING QUESTIONS:
- Lead with the answer: yes or no (or "not on this summary"), then explain — after verifying against COVERAGE DETAILS JSON as above.
- Cite specific limits, deductibles, and coverage details ONLY from the JSON (and carrier knowledge for add-ons), never from assumptions.
- When carrier knowledge is available, include practical details: what to do, what to document, timelines, reporting windows — only for coverage lines that exist in the JSON or for add-ons described in knowledge as not yet purchased.
- For claims scenarios where they ARE covered per JSON, give action steps. Where they are NOT covered per JSON, do not invent claim steps for that line; you may give general risk-mitigation or suggest discussing options with the account team.
- For upsell / optional coverage, be genuinely helpful — only when carrier knowledge or JSON explicitly supports it.

WHAT YOU DON'T DO:
- Don't hedge with "it depends" when the JSON is silent: if the coverage line isn't there, say they're not covered per this summary.
- Don't format claims or "what to do" steps as a markdown or ASCII bullet list (no lines starting with "-" or "*") unless the user explicitly asks for a list. Use a few short paragraphs instead.
- Don't use bullet points for every answer — use sentences when they read more naturally.
- Don't repeat the same limits in every response.
- Don't use insurance jargon without a quick plain-English gloss.
- Don't give medical or legal advice.
- Don't make up coverage details. If you don't see it in the data, say so and offer to flag the account team.

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

  const systemPrompt = buildSystemPrompt(input?.policyContext, input?.aiSummary, {
    carrierDisplayName: input?.carrierDisplayName,
    knowledgeBlock: input?.knowledgeBlock,
    isFirstTurn,
  });
  const anthropicMessages = buildAnthropicMessages(input?.chatHistory, message);

  for (const provider of connectChatProviderOrder()) {
    try {
      if (provider === "claude") {
        const reply = await callClaudeChat(systemPrompt, anthropicMessages);
        return { reply, systemPrompt };
      }
      const reply = await callGeminiChat(
        systemPrompt,
        input?.chatHistory,
        message,
      );
      return { reply, systemPrompt };
    } catch (err) {
      console.warn(
        `[connectChatService] ${provider} failed:`,
        err?.message || err,
      );
    }
  }

  return { reply: fallbackReply(), systemPrompt };
}

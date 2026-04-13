/**
 * Deterministic coverage intent checks for Connect chat.
 * Reduces false "yes" on lines that are not present in coverage_data (E&O).
 */

/** @param {unknown} v */
function isPlainObject(v) {
  return v != null && typeof v === "object" && !Array.isArray(v);
}

/**
 * Collect lowercase key paths and short string leaves from coverage JSON.
 * @param {unknown} data
 * @returns {{ paths: string[], stringHints: string[] }}
 */
export function flattenCoverageEvidence(data) {
  /** @type {string[]} */
  const paths = [];
  /** @type {string[]} */
  const stringHints = [];

  function walk(obj, prefix) {
    if (obj == null) return;
    if (typeof obj === "string") {
      const s = obj.trim();
      if (s.length > 0 && s.length <= 400) stringHints.push(s.toLowerCase());
      return;
    }
    if (typeof obj !== "number" && typeof obj !== "boolean" && typeof obj !== "object") {
      return;
    }
    if (Array.isArray(obj)) {
      for (let i = 0; i < obj.length; i += 1) walk(obj[i], `${prefix}[${i}]`);
      return;
    }
    for (const k of Object.keys(obj)) {
      const segment = String(k).trim();
      const path = prefix ? `${prefix}.${segment}` : segment;
      paths.push(path.toLowerCase().replace(/\s+/g, "_"));
      walk(obj[k], path);
    }
  }

  walk(data, "");
  return { paths, stringHints };
}

const EB_QUESTION_PATTERNS = [
  /\bwalk-?in\s+cooler\b/i,
  /\bequipment\s+breakdown\b/i,
  /\bmechanical\s+breakdown\b/i,
  /\brefrigeration\b/i,
  /\bcooler\s+(fails?|breaks?|stopped?|down)\b/i,
  /\bcompressor\b/i,
  /\bboiler\s+and\s+machinery\b/i,
];

const EB_KEY_SNIPPETS = [
  "equipment_breakdown",
  "equipmentbreakdown",
  "boiler_and_machinery",
  "boilerandmachinery",
  "machinery_breakdown",
];

const FLOOD_QUESTION_PATTERNS = [/\bfloods?\b/i, /\bstorm surge\b/i, /\binland\s+flood/i];
const FLOOD_KEY_SNIPPETS = ["flood", "nfip", "excess_flood"];

const CYBER_QUESTION_PATTERNS = [
  /\bcyber\b/i,
  /\bransomware\b/i,
  /\bdata breach\b/i,
  /\bprivacy breach\b/i,
];
const CYBER_KEY_SNIPPETS = ["cyber", "cyber_liability", "data_breach", "network_security"];

const LIQUOR_QUESTION_PATTERNS = [
  /\bliquor\s+liability\b/i,
  /\bdram\s+shop\b/i,
  /\bhost\s+liquor\b/i,
];
const LIQUOR_KEY_SNIPPETS = ["liquor_liability", "liquorliability", "dram_shop", "host_liquor"];

/**
 * @param {string} intent
 * @param {string[]} paths
 * @param {string[]} stringHints
 */
/**
 * String leaves can mention "equipment breakdown" in exclusions or marketing blurbs.
 * Only treat as present if the phrase appears in a non-negated coverage context.
 * @param {string} blob
 */
function equipmentBreakdownStringIndicatesPresent(blob) {
  if (!/\bequipment breakdown\b/i.test(blob) && !/\bboiler and machinery\b/i.test(blob)) {
    return false;
  }
  const negated = /\b(excluded|not included|not covered|not part of|does not include|no equipment breakdown|optional add|may be purchased|not applicable|na\b|not selected)\b/i;
  const chunks = blob.split(/[.;\n]/);
  for (const chunk of chunks) {
    if (!/\bequipment breakdown\b/i.test(chunk) && !/\bboiler and machinery\b/i.test(chunk)) continue;
    if (negated.test(chunk)) continue;
    return true;
  }
  return false;
}

function intentPresentInJson(intent, paths, stringHints) {
  const blob = stringHints.join(" | ");
  if (intent === "equipment_breakdown") {
    if (paths.some((p) => EB_KEY_SNIPPETS.some((s) => p.includes(s)))) return true;
    if (equipmentBreakdownStringIndicatesPresent(blob)) return true;
    return false;
  }
  if (intent === "flood") {
    if (paths.some((p) => FLOOD_KEY_SNIPPETS.some((s) => p.includes(s)))) return true;
    if (/\bflood\b/i.test(blob)) return true;
    return false;
  }
  if (intent === "cyber") {
    if (paths.some((p) => CYBER_KEY_SNIPPETS.some((s) => p.includes(s)))) return true;
    if (/\bcyber(\s+liability)?\b/i.test(blob)) return true;
    return false;
  }
  if (intent === "liquor_liability") {
    if (paths.some((p) => LIQUOR_KEY_SNIPPETS.some((s) => p.includes(s)))) return true;
    if (/\bliquor liability\b/i.test(blob)) return true;
    return false;
  }
  return false;
}

/**
 * @param {string} message
 * @returns {string[]}
 */
function detectTriggeredIntents(message) {
  const msg = String(message || "");
  const out = [];
  if (EB_QUESTION_PATTERNS.some((re) => re.test(msg))) out.push("equipment_breakdown");
  if (FLOOD_QUESTION_PATTERNS.some((re) => re.test(msg))) out.push("flood");
  if (CYBER_QUESTION_PATTERNS.some((re) => re.test(msg))) out.push("cyber");
  if (LIQUOR_QUESTION_PATTERNS.some((re) => re.test(msg))) out.push("liquor_liability");
  return [...new Set(out)];
}

const INTENT_LABEL = {
  equipment_breakdown: "Equipment breakdown / refrigeration / walk-in cooler machinery",
  flood: "Flood",
  cyber: "Cyber / data breach",
  liquor_liability: "Liquor liability",
};

/**
 * @param {string} message
 * @param {unknown} coverageData
 * @returns {{ triggeredResults: { intent: string, verdict: "PRESENT"|"ABSENT" }[], machineVerdictBlock: string }}
 */
export function analyzeConnectCoverageQuestion(message, coverageData) {
  const triggered = detectTriggeredIntents(message);
  if (!triggered.length) {
    return { triggeredResults: [], machineVerdictBlock: "" };
  }

  const { paths, stringHints } = flattenCoverageEvidence(
    coverageData != null && typeof coverageData === "object" ? coverageData : {},
  );

  const triggeredResults = triggered.map((intent) => ({
    intent,
    verdict: intentPresentInJson(intent, paths, stringHints) ? "PRESENT" : "ABSENT",
  }));

  const lines = triggeredResults.map(({ intent, verdict }) => {
    const label = INTENT_LABEL[intent] || intent;
    if (verdict === "PRESENT") {
      return `- ${label}: PRESENT in summary JSON (keys/strings match). You may explain only what appears in COVERAGE DETAILS for this line.`;
    }
    return `- ${label}: NOT IN SUMMARY (ABSENT) — no matching coverage line was found in COVERAGE DETAILS JSON. The customer must not be told they have this coverage or that it "kicks in." Do not assign deductibles or limits to this line.`;
  });

  const machineVerdictBlock = `MACHINE COVERAGE VERDICT (HIGHEST PRIORITY — OVERRIDES MODEL PRIORS AND CARRIER KB FOR "DO I HAVE IT"):
The server matched the user's question to coverage intents and checked COVERAGE DETAILS JSON deterministically (this is not a guess).

${lines.join("\n")}

Rules when any line is NOT IN SUMMARY (ABSENT) — Reliable + Sellable:
- State clearly that the line is not shown on this policy summary. Be direct, not scary: you're protecting them from a wrong "yes," not delivering bad news for its own sake.
- Offer a helpful next beat: what to document, that the account team can confirm against full documents, or whether carrier knowledge mentions the line as a common add-on (only as optional, not in force).
- Do NOT use RELEVANT CARRIER KNOWLEDGE to imply the coverage is already in force. KB is for exclusions, claims process, and add-on context — not proof they have the line.
- Do NOT invent reporting windows, deductibles, or claim steps for that absent line. Property or GL deductibles apply to those lines only, not to this absent line.

Rules when a line is PRESENT — Reliable + Scalable:
- Answer using only JSON fields tied to that line; cite limits and deductibles that appear there; do not expand numbers from other lines.

RSS (your north star): Reliable = only proven-in-summary coverage and numbers; Scalable = same rules every time; Sellable = calm, trustworthy, human — they should leave the chat feeling informed and well served, never misled.`;

  return { triggeredResults, machineVerdictBlock };
}

/**
 * Last-resort guard if the model still affirms absent high-risk lines.
 * @param {string} reply
 * @param {{ intent: string, verdict: string }[]} triggeredResults
 */
export function sanitizeConnectReplyAgainstVerdicts(reply, triggeredResults) {
  let text = String(reply || "").trim();
  if (!text || !triggeredResults.length) return text;

  const t = text.toLowerCase();

  for (const row of triggeredResults) {
    if (row.verdict !== "ABSENT") continue;
    if (row.intent === "equipment_breakdown" && ebAbsentViolated(t)) {
      return (
        "Based only on your policy summary, equipment breakdown coverage is not listed — so I can't say your walk-in cooler or similar equipment is covered under an equipment breakdown line here. " +
        "Note what failed and when, keep any repair quotes, and ask your account team to confirm whether equipment breakdown exists on your full policy or as an endorsement. " +
        "If something else on your summary (like property) might apply, they can review that with you. " +
        "Let me know if you'd like me to flag your account team.\n\n" +
        "Coverage guidance based on your policy summary. Actual coverage is governed by your policy documents."
      );
    }
    if (row.intent === "flood" && floodAbsentViolated(t)) {
      return (
        "Based only on your policy summary, flood coverage is not listed — so I can't confirm you're covered for flood or rising water here. " +
        "Document the damage, mitigate further loss if you can do so safely, and ask your account team about flood or excess flood options. " +
        "Let me know if you'd like me to flag your account team.\n\n" +
        "Coverage guidance based on your policy summary. Actual coverage is governed by your policy documents."
      );
    }
    if (row.intent === "cyber" && cyberAbsentViolated(t)) {
      return (
        "Based only on your policy summary, cyber or data-breach coverage is not listed — so I can't confirm you're covered for that here. " +
        "Preserve logs, avoid paying ransom without guidance, and ask your account team about cyber endorsements. " +
        "Let me know if you'd like me to flag your account team.\n\n" +
        "Coverage guidance based on your policy summary. Actual coverage is governed by your policy documents."
      );
    }
    if (row.intent === "liquor_liability" && liquorAbsentViolated(t)) {
      return (
        "Based only on your policy summary, liquor liability is not listed — so I can't confirm you're covered for that exposure here. " +
        "Ask your account team about dram shop or host liquor coverage. " +
        "Let me know if you'd like me to flag your account team.\n\n" +
        "Coverage guidance based on your policy summary. Actual coverage is governed by your policy documents."
      );
    }
  }

  return text;
}

/**
 * When verdict is ABSENT, catch common false-yes phrasings (models vary wording).
 * @param {string} t lowercase reply
 */
function ebAbsentViolated(t) {
  if (!/\bequipment breakdown\b/.test(t) && !/\bwalk-?in cooler\b/.test(t)) {
    return false;
  }
  // Clearly safe: summary says EB is not listed / can't confirm in-force
  if (
    /\b(not listed|not on (this|your) (policy )?summary|not shown|isn't shown|can't confirm|cannot confirm|can't say you're covered|no equipment breakdown|don't have equipment breakdown|do not have equipment breakdown)\b/i.test(
      t,
    )
  ) {
    return false;
  }

  return (
    /^yes\b/.test(t) ||
    /\byou have equipment breakdown\b/.test(t) ||
    /\byou've got equipment breakdown\b/.test(t) ||
    /\bequipment breakdown coverage on your policy\b/.test(t) ||
    /\bequipment breakdown coverage kicks in\b/.test(t) ||
    /your equipment breakdown/.test(t) ||
    /(mechanical|electrical) (or )?breakdown of your cooler would be covered/.test(t) ||
    /you've got this protection/.test(t) ||
    (/walk-?in cooler/.test(t) && /\b(covered|would respond|would apply|coverage kicks|kicks in)\b/.test(t)) ||
    (/\bequipment breakdown\b/.test(t) &&
      /\b(kicks in|you're covered|you are covered|you've got|you have coverage|would respond|would apply|covered if|this coverage would)\b/.test(t))
  );
}

function floodAbsentViolated(t) {
  return /\bflood\b/.test(t) && /\b(you're covered|you are covered|covered for flood|flood coverage kicks)\b/.test(t);
}

function cyberAbsentViolated(t) {
  return (
    /\bcyber\b/.test(t) &&
    /\b(you're covered|you are covered|covered for (a )?cyber|your cyber (coverage|policy))\b/.test(t)
  );
}

function liquorAbsentViolated(t) {
  return (
    /\bliquor\b/.test(t) &&
    /\b(you're covered|you are covered|covered for liquor|your liquor liability)\b/.test(t)
  );
}

/**
 * CID S5 sales letter — shared system + user prompts (packet PDF cover letter).
 * Tuned for close-the-deal tone; segment value props injected by segment.
 */

const SEGMENT_VALUE_PROPS = {
  bar: `- Built for bars — not borrowed from a generic business policy
- Covers what actually happens: late nights, crowds, liquor, and everything in between
- One incident shouldn't shut your doors — protection designed for real bar operations
- We shop multiple carriers so you don't have to`,

  plumber: `- Protection for the damage you don't see right away — behind walls, under floors
- One failed joint can turn into a five-figure claim — coverage that follows your work
- Designed for licensed plumbing professionals, not generic contractor policies
- GL, tools, and completed operations — quoted together so nothing falls through`,

  hvac: `- Pollution and refrigerant liability included — not buried in exclusions
- Protection when systems fail after install — claims don't happen on your schedule
- Built for service calls, installs, and the callbacks that come months later
- Coverage that holds up during peak season when you can't afford a gap`,

  roofer: `- GL plus Workers Comp with no height exclusions on most policies
- Protection after the job is finished — completed operations built in
- Designed for roofing crews, not desk jobs — carriers that understand your trade
- Your mod rate matters — we find carriers that won't penalize you for being a roofer`,
};

function segmentKey(segment) {
  const k = String(segment || "bar").trim().toLowerCase();
  return SEGMENT_VALUE_PROPS[k] ? k : "bar";
}

function safeStr(v) {
  return v != null && v !== "" ? String(v) : "";
}

function buildCoverageSummary(extraction) {
  const e = extraction || {};
  const parts = [];
  if (e.policy_type) parts.push(String(e.policy_type));
  if (e.gl_per_occurrence || e.gl_aggregate) {
    parts.push(
      `GL ${e.gl_per_occurrence || "?"} per occurrence / ${e.gl_aggregate || "?"} aggregate`,
    );
  }
  if (e.liquor_liability_included) parts.push("liquor liability included");
  if (e.annual_premium != null) parts.push(`annual premium $${e.annual_premium}`);
  return parts.length ? parts.join("; ") : "See attached quote packet for full coverage summary.";
}

function buildKeyCoverages(extraction) {
  const e = extraction || {};
  const lines = [];
  if (e.gl_per_occurrence) lines.push(`GL per occurrence: ${e.gl_per_occurrence}`);
  if (e.gl_aggregate) lines.push(`GL aggregate: ${e.gl_aggregate}`);
  if (e.deductible) lines.push(`Deductible: ${e.deductible}`);
  if (e.liquor_liability_limit || e.liquor_liability_included) {
    lines.push(
      `Liquor liability: ${e.liquor_liability_limit || (e.liquor_liability_included ? "included" : "not specified")}`,
    );
  }
  if (e.wc_included) lines.push(`Workers comp: ${e.wc_included ? "included" : "not included"}`);
  if (e.completed_ops_included != null) {
    lines.push(`Completed operations: ${e.completed_ops_included ? "yes" : "no"}`);
  }
  if (e.height_exclusion) lines.push(`Height exclusion: ${e.height_exclusion}`);
  if (e.pollution_liability != null) lines.push(`Pollution liability: ${e.pollution_liability ? "yes" : "no"}`);
  return lines.length ? lines.join("\n") : "See attached carrier quote PDF.";
}

/**
 * @param {string} segment — bar | plumber | roofer | hvac
 * @param {Record<string, unknown>} extraction — reviewed_json from quote extraction
 * @param {{ business_name?: string, contact_name?: string, email?: string }} client
 */
export function buildSalesLetterPrompts(segment, extraction, client) {
  const seg = segmentKey(segment);
  const e = extraction || {};
  const c = client || {};

  const businessName = safeStr(c.business_name) || safeStr(e.business_name) || safeStr(e.insured_name) || "Client";
  const contactName = safeStr(c.contact_name) || businessName;
  const city = safeStr(e.city || e.mailing_city || e.insured_city);
  const state = safeStr(e.state || e.mailing_state || e.insured_state);
  const cityState = [city, state].filter(Boolean).join(", ") || "—";
  const trafficSource = safeStr(e.traffic_source || e.campaign_source || e.utm_source || e.source);
  const campaignId = safeStr(e.campaign_id || e.utm_campaign);

  const carrierName = safeStr(e.carrier_name) || "the carrier";
  const annualPremium = e.annual_premium != null && e.annual_premium !== "" ? String(e.annual_premium) : "";
  const coverageSummary = buildCoverageSummary(e);
  const keyCoverages = buildKeyCoverages(e);
  const quoteExpiration =
    safeStr(e.quote_expiration || e.quote_valid_until || e.quote_expiration_date) ||
    safeStr(e.expiration_date) ||
    "";

  const segmentProps = SEGMENT_VALUE_PROPS[seg];

  const systemPrompt = `You are writing a personalized sales letter to accompany an insurance quote packet for Commercial Insurance Direct. This letter goes directly to a small business owner who requested a quote. Your job is to get them to say yes.

VOICE AND TONE:
- Write like a person, not a corporation. Short paragraphs. Conversational.
- Confident but not arrogant. You know your stuff and you're here to help.
- Direct. These are busy people. Get to the point fast.
- No jargon unless you explain it in the same sentence.
- Never condescending. These people run businesses. Respect their time and intelligence.

STRUCTURE (follow this every time):
1. HOOK (2-3 sentences max) — Acknowledge them by name, reference their business, and connect to why they reached out. If we know the trigger (renewal, requirement, price), lean into it. If not, use the universal: "You asked us to shop your insurance. We did. Here's what we found."

2. THE QUOTE (clear, scannable) — State the carrier, the premium, and the key coverages in plain English. Not a coverage schedule — a human summary. One paragraph, done.

3. WHY THIS QUOTE (2-3 sentences) — What makes this competitive or right for their business specifically. Reference their trade/segment.

4. WHAT HAPPENS NEXT (clear action) — Tell them exactly what to do. Reply to move forward; COI timing if relevant. Remove obstacles.

5. URGENCY (one line, honest) — Not fake scarcity. Real urgency: quote validity, expiration, or timing.

WHAT YOU DON'T DO:
- Don't open with "Dear Valued Customer" or "Thank you for your interest." Open with their name and their business.
- Don't list every coverage in a table. That's what the quote PDF is for. The letter is the sell, not the spec sheet.
- Don't use words like "comprehensive," "tailored," "solutions," or "leverage." Those are empty. Be specific.
- Don't write more than 250 words. Shorter is better. If you can say it in 150, do it.
- Don't end with "Please don't hesitate to reach out." End with a clear ask.
- Don't include disclaimers in the letter. Those are in the quote document.
- Use ONLY the data provided below. Do not invent carriers, premiums, or limits.

Sign the letter as Commercial Insurance Direct (no fictional agent names unless provided in data).`;

  const userPrompt = `PERSONALIZATION DATA:
Business Name: ${businessName}
Contact Name: ${contactName}
Segment: ${seg}
City/State: ${cityState}
Campaign Source: ${trafficSource || "—"}
Campaign ID: ${campaignId || "—"}

QUOTE DATA:
Carrier: ${carrierName}
Annual Premium: $${annualPremium || "—"}
Coverage Summary: ${coverageSummary}
Key Coverages:
${keyCoverages}
Quote Valid Until: ${quoteExpiration || "—"}

SEGMENT-SPECIFIC VALUE PROPS (weave in where natural):
${segmentProps}

Write the letter. Return ONLY the letter body text — no subject line, no markdown fences, no preamble.`;

  return { systemPrompt, userPrompt };
}

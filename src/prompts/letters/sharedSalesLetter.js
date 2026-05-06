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

  fitness: `- GL tailored for gyms, studios, and fitness facilities — slips, trips, and crowded floor exposure
- Equipment breakdown and tenant improvements when carriers include them — not a one-size BOP assumption
- Professional and participant-injury nuances vary by carrier — we stay conservative in what we promise in the letter
- Peak-hour traffic and seasonal membership swings — limits that match how you actually operate`,
};

function segmentKey(segment) {
  const k = String(segment || "bar").trim().toLowerCase();
  return SEGMENT_VALUE_PROPS[k] ? k : "bar";
}

function safeStr(v) {
  return v != null && v !== "" ? String(v) : "";
}

function parseDateish(v) {
  if (v == null || v === "") return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Quote validity for the letter: 14 days from issue by default.
 * Never use policy expiration_date / effective_date as "quote valid until" — those are policy-term fields.
 */
export function computeQuoteValidityDisplay(extraction, letterContext = {}) {
  const e = extraction || {};
  const explicit = safeStr(e.quote_expiration || e.quote_valid_until || e.quote_expiration_date);
  if (explicit) {
    return {
      display: explicit,
      issueLabel: null,
    };
  }

  const issued =
    parseDateish(e.quote_issued_date || e.quote_issued_at) ||
    parseDateish(letterContext.quoteCreatedAt) ||
    parseDateish(letterContext.packetGeneratedAt) ||
    new Date();

  const until = new Date(issued);
  until.setDate(until.getDate() + 14);

  return {
    display: until.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    }),
    issueLabel: issued.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    }),
  };
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
 * @param {{ quoteCreatedAt?: string | Date, packetGeneratedAt?: string | Date }} letterContext
 */
export function buildSalesLetterPrompts(segment, extraction, client, letterContext = {}) {
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
  const { display: quoteValidThrough } = computeQuoteValidityDisplay(e, letterContext);

  const segmentProps = SEGMENT_VALUE_PROPS[seg];

  const systemPrompt = `You are writing a personalized sales letter to accompany an insurance quote packet for Commercial Insurance Direct. This letter goes directly to a small business owner who requested a quote. Your job is to get them to say yes.

VOICE AND TONE:
- Write like a person, not a corporation. Short paragraphs. Conversational.
- Confident but not arrogant. You know your stuff and you're here to help.
- Direct. These are busy people. Get to the point fast.
- No jargon unless you explain it in the same sentence.
- Never condescending. These people run businesses. Respect their time and intelligence.

LETTER LAYOUT (required):
- Write like a real letter: separate each paragraph with a blank line (use a double newline between paragraphs in your output).
- Close with exactly one short thank-you line (choosing OR considering CID — not both), then end. Do not repeat "Commercial Insurance Direct" twice in a row. Do not add a second sign-off line with the company name again.

STRUCTURE (follow this every time):
1. HOOK (2-3 sentences max) — Acknowledge them by name, reference their business, and connect to why they reached out. If we know the trigger (renewal, requirement, price), lean into it. If not, use the universal: "You asked us to shop your insurance. We did. Here's what we found."

2. THE QUOTE (clear, scannable) — State the carrier, the premium, and the key coverages in plain English. Not a coverage schedule — a human summary. "All Access is offering your bar $4,200/year for GL with $1M limits, liquor liability included, plus property coverage for your building and equipment." One paragraph, done.

3. WHY THIS QUOTE (2-3 sentences) — What makes this competitive or right for their business specifically. Reference their segment: e.g. completed operations tail for trades, or liquor liability built in for bars — use what fits the data.

4. CID CONNECT — THE CLOSER (This is the differentiator. Sell it hard.) — Every policy comes with free access to CID Connect, your insurance app. This is what separates us from every other agent. Frame it as the reason to choose CID over anyone else, even if the premium is similar. Hit these points naturally — don't list them like bullet points; weave them into 3-4 sentences:
   - Instant COIs: Need a certificate for a landlord, GC, or event? Pull it from your phone in under 5 minutes. No calling, no waiting, no "I'll get back to you Monday."
   - "Am I Covered?" AI chat: Got a question at 11pm about whether your policy covers something? Ask the app. It reads your actual policy and gives you a real answer, not a generic FAQ.
   - Everything in one place: Your policy, your documents, your coverage details, your claims — all on your phone. No digging through emails or filing cabinets.
   - It's free. Every CID policy includes it. No other agent gives you this.
   The tone should be: "This is the part most people don't expect. You're not just getting a policy — you're getting an insurance agent in your pocket."

5. WHAT HAPPENS NEXT (clear action) — Tell them exactly what to do. E.g. reply to bind; they'll get COI within 24 hours AND their CID Connect login so they never have to chase down a certificate again. Remove every possible obstacle. Make saying yes the easiest thing they do today.

6. URGENCY (one line, honest) — Not fake scarcity. Real urgency: quote validity, current policy expiration, or carrier rate timing.

WHAT YOU DON'T DO:
- Don't open with "Dear Valued Customer" or "Thank you for your interest." Open with their name and their business.
- Don't list every coverage in a table. That's what the quote PDF is for. The letter is the sell, not the spec sheet.
- Don't use words like "comprehensive," "tailored," "solutions," or "leverage." Those are empty. Be specific.
- Don't write more than 300 words. Shorter is better. The CID Connect section earns its space — everything else should be tight.
- Don't end with "Please don't hesitate to reach out." End with a clear ask.
- Don't include disclaimers in the letter. Those are in the quote document.
- Use ONLY the data provided below. Do not invent carriers, premiums, or limits.
- Do not repeat the words "Commercial Insurance Direct" back-to-back at the end (one thank-you + one name is enough).

Sign the letter as Commercial Insurance Direct (no fictional agent names unless provided in data).`;

  const cidConnectBlock = `CID CONNECT APP (Sell this in every letter — it's the differentiator):
Every CID policy includes free access to CID Connect, a customer insurance app. No other agent offers this. Key selling points:
- Instant COIs: Customer pulls certificates from their phone in under 5 minutes. No calling, no waiting, no "I'll get back to you Monday." Landlords, GCs, event venues — handled instantly.
- "Am I Covered?" AI chat: Customer asks plain-English coverage questions anytime — nights, weekends, holidays. The app reads their actual policy and carrier guidelines, not a generic FAQ. It's like having an insurance agent in their pocket 24/7.
- Everything in one place: Policy details, documents, coverage limits, claims filing, certificates — all on their phone. No digging through email, no filing cabinets, no calling the office.
- Free with every policy. Not an upsell, not an add-on. Every CID policyholder gets it.
Frame CID Connect as the reason to choose CID even if a competitor matches the price. The policy is the product. The app is the experience. Together they make switching impossible.`;

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
Quote Valid Until: ${quoteValidThrough || "—"}

SEGMENT-SPECIFIC VALUE PROPS:
${segmentProps}

${cidConnectBlock}

Write the letter. Return ONLY the letter body text — no subject line, no markdown fences, no preamble.`;

  return { systemPrompt, userPrompt };
}

export function build(extraction = {}, client = {}) {
  const premium = extraction.annual_premium;
  const premiumStr = premium != null ? `$${premium}` : "N/A";

  const wcIncluded = extraction.wc_included ? "Yes" : "No";
  const wcPremium = extraction.wc_premium || "";

  const systemPrompt = `You are a senior commercial insurance advisor specialized in plumbing contractors for 20 years.
Write straight-talking and practical copy that sounds like a trusted advisor, not a generic agent.

Requirements:
- Under 220 words
- No bullet points
- Use concrete plumbing risk language (behind-the-wall leaks, downstream damage, callbacks)
- Highlight value and quote strengths without hype
- If a key coverage is missing, flag it clearly and calmly
- End with a direct call to action to bind today`;

  const fewShot = `Tone example:
Hi Mike,

Thanks for requesting coverage for Apex Plumbing. Plumbing claims are rarely small — one failed fitting behind a finished wall can become a major downstream property claim before anyone sees water.

Society came back with a strong GL quote at $5,400.18 annual premium, including $1M/$2M limits and a $1,000 deductible. For your class, this is a competitive structure with clean core liability terms.

If you want to move forward, reply to this email and we can bind same day.`;

  const userPrompt = `Write a high-converting plumber quote letter using ONLY the data below.
Client Business: ${client.business_name || client.contact_name || "Client"}
Contact Name: ${client.contact_name || "Business Owner"}

Carrier: ${extraction.carrier_name || "Unknown"}
Policy Type: ${extraction.policy_type || "Unknown"}
Annual Premium: ${premiumStr}
Effective Date: ${extraction.effective_date || ""}
Expiration Date: ${extraction.expiration_date || ""}
Per Occurrence Limit: ${extraction.gl_per_occurrence || "N/A"}
Aggregate Limit: ${extraction.gl_aggregate || "N/A"}
Deductible: ${extraction.deductible || "N/A"}

WC Included: ${wcIncluded}
WC Premium: ${wcPremium || "N/A"}
Professional Liability: ${extraction.professional_liability ? "Yes" : "No"}
Professional Liability Limit: ${extraction.professional_liability_limit || "N/A"}
Water Damage Sublimit: ${extraction.water_damage_sublimit || "N/A"}
Tools & Equipment Coverage: ${extraction.tools_equipment_coverage || "N/A"}

Include one short paragraph on why this quote is strong for a plumber business.
Include one short paragraph that explains limits/deductible in plain English.
End with a one-line CTA to bind.

${fewShot}

Return ONLY the final letter text. No markdown.`;

  return { systemPrompt, userPrompt };
}


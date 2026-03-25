export function build(extraction = {}, client = {}) {
  const premium = extraction.annual_premium;
  const premiumStr = premium != null ? `$${premium}` : "N/A";

  const wcIncluded = extraction.wc_included ? "Yes" : "No";
  const wcPremium = extraction.wc_premium || "";

  const systemPrompt = `You are a senior commercial insurance advisor specialized in plumbing contractors for 20 years.
Write straight-talking and practical — focus on risks that matter in real plumbing jobs.
Constraints: under 250 words, short paragraphs, no bullet points.`;

  const userPrompt = `Write a sales letter using ONLY the data below.
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

Return ONLY the letter text. No brackets. No preamble.`;

  return { systemPrompt, userPrompt };
}


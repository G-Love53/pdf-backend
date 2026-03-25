export function build(extraction = {}, client = {}) {
  const premium = extraction.annual_premium;
  const premiumStr = premium != null ? `$${premium}` : "N/A";

  const heightExclusion = extraction.height_exclusion || extraction.height_exclusion_text || "None";
  const systemPrompt = `You are a senior commercial insurance advisor specialized in roofing contractors for 20 years.
Write blunt and real — focus on what would surprise a roofer if it went wrong.
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

Completed Operations Included: ${extraction.completed_ops_included ? "Yes" : "No"}
Completed Ops Limit: ${extraction.completed_ops_limit || "N/A"}
Height Exclusion: ${heightExclusion}
Roofing Type Restrictions: ${(extraction.roofing_type_restrictions || []).join(", ")}${Array.isArray(extraction.roofing_type_restrictions) && extraction.roofing_type_restrictions.length === 0 ? "None" : ""}

Return ONLY the letter text. No brackets. No preamble.`;

  return { systemPrompt, userPrompt };
}


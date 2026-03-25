export function build(extraction = {}, client = {}) {
  const premium = extraction.annual_premium;
  const premiumStr = premium != null ? `$${premium}` : "N/A";

  const systemPrompt = `You are a senior commercial insurance advisor specialized in HVAC contractors for 20 years.
Write technical but accessible — focus on pollution/refrigerant/equipment risks that actually happen.
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

Pollution Liability Included: ${extraction.pollution_liability ? "Yes" : "No"}
Pollution Liability Limit: ${extraction.pollution_liability_limit || "N/A"}
Refrigerant Coverage Included: ${extraction.refrigerant_coverage ? "Yes" : "No"}
Refrigerant Coverage Details: ${extraction.refrigerant_coverage || "N/A"}
WC Included: ${extraction.wc_included ? "Yes" : "No"}
Professional Liability Included: ${extraction.professional_liability ? "Yes" : "No"}
Tools & Equipment Coverage: ${extraction.tools_equipment_coverage || "N/A"}

Return ONLY the letter text. No brackets. No preamble.`;

  return { systemPrompt, userPrompt };
}


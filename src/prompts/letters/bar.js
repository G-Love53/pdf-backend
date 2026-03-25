export function build(extraction = {}, client = {}) {
  const premium = extraction.annual_premium;
  const premiumStr = premium != null ? `$${premium}` : "N/A";

  const aAndB = extraction.assault_battery_coverage || extraction.assault_battery || "";
  const aAndBSub = extraction.assault_battery_sublimit || extraction.assault_battery_sub_limit || "";

  const liquorIncluded = extraction.liquor_liability_included ? "Yes" : "No";
  const liquorLimit = extraction.liquor_liability_limit || extraction.liquor_liability || "";

  const systemPrompt = `You are a senior commercial insurance advisor specialized in bars/taverns/restaurants for 20 years.
Write like a trusted advisor, not a salesman. Keep it warm, direct, and specific to the quote.
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

Liquor Liability Included: ${liquorIncluded}
Liquor Liability Limit: ${liquorLimit || "N/A"}
Assault & Battery: ${aAndB || "Not specified"}
Assault & Battery Sub-Limit: ${aAndBSub || "N/A"}

Return ONLY the letter text. No brackets. No preamble.`;

  return { systemPrompt, userPrompt };
}


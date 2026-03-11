export default function buildRooferExtractionPrompt(pdfBase64) {
  return {
    model: "claude-3-5-sonnet-20241022",
    max_tokens: 2000,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: {
              type: "base64",
              media_type: "application/pdf",
              data: pdfBase64,
            },
          },
          {
            type: "text",
            text: `You are extracting structured quote data from a commercial insurance quote PDF for a ROOFING CONTRACTOR business.

Extract the following fields as JSON. For each field, also provide a confidence score (0.0-1.0) based on how clearly the value appears in the document.

Required base fields:
- carrier_name (the insurance company issuing the quote)
- policy_type (GL, BOP, WC, Property, or Package)
- annual_premium (total annual premium in dollars)
- effective_date (policy effective date, YYYY-MM-DD)
- expiration_date (policy expiration date, YYYY-MM-DD)
- gl_per_occurrence (general liability per-occurrence limit)
- gl_aggregate (general liability aggregate limit)
- deductible (policy deductible)

Roofer-specific fields:
- wc_included (true/false)
- wc_premium (if WC is included, the WC premium)
- wc_mod_rate (experience modification rate, e.g. 1.05)
- completed_ops_included (true/false)
- completed_ops_limit (completed operations limit in dollars, if included)
- height_exclusion ("none", "over_3_stories", "over_2_stories", or similar text)
- roofing_type_restrictions (array of strings, e.g. ["torch-down prohibited", "no hot tar"])

Also extract:
- additional_coverages (array of any additional coverages listed)
- exclusions_noted (array of any notable exclusions)

Respond with ONLY valid JSON in this exact structure:
{
  "extracted_data": { ... all fields ... },
  "confidence_scores": { "field_name": 0.0-1.0, ... }
}

If a field cannot be found in the document, set it to null with confidence 0.0.`,
          },
        ],
      },
    ],
  };
}


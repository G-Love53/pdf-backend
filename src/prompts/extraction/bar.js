export default function buildBarExtractionPrompt(pdfBase64) {
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
            text: `You are extracting structured quote data from a commercial insurance quote PDF for a BAR / RESTAURANT / TAVERN business.

Extract the following fields as JSON. For each field, also provide a confidence score (0.0-1.0) based on how clearly the value appears in the document.

Required fields:
- carrier_name (the insurance company issuing the quote)
- policy_type (GL, BOP, WC, Property, Liquor, or Package)
- annual_premium (total annual premium in dollars)
- effective_date (policy effective date, YYYY-MM-DD)
- expiration_date (policy expiration date, YYYY-MM-DD)
- gl_per_occurrence (general liability per-occurrence limit)
- gl_aggregate (general liability aggregate limit)
- deductible (policy deductible)

Bar-specific fields:
- liquor_liability_included (true/false)
- liquor_liability_limit (if included, the limit)
- assault_battery_coverage ("included", "excluded", or "sub-limited")
- assault_battery_sublimit (if sub-limited, the dollar amount)
- entertainment_coverage (true/false — live music, DJ, dancing)

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


/**
 * When a carrier email includes multiple PDFs, all are stored as `carrier_quote_original`.
 * We must pick ONE for S4 extraction + PDF viewer. MIME order + `created_at DESC`
 * often surfaces ACORD 140 last — wrong for overview. Prefer Supplemental Application
 * first, then ACORD forms in numeric order, then client submission.
 *
 * @param {string} [tableAlias = "d"] SQL alias for the documents row (e.g. "d", "documents")
 * @returns {string} ORDER BY … fragment (no leading/trailing comma)
 */
export function orderByPrimaryCarrierPdf(tableAlias = "d") {
  const p = tableAlias;
  return `
    ORDER BY
      CASE
        WHEN LOWER(COALESCE(${p}.storage_path, '')) LIKE '%supplemental%' THEN 10
        WHEN LOWER(COALESCE(${p}.storage_path, '')) LIKE '%acord%125%'
          OR LOWER(COALESCE(${p}.storage_path, '')) LIKE '%acord_125%' THEN 20
        WHEN LOWER(COALESCE(${p}.storage_path, '')) LIKE '%acord%126%'
          OR LOWER(COALESCE(${p}.storage_path, '')) LIKE '%acord_126%' THEN 21
        WHEN LOWER(COALESCE(${p}.storage_path, '')) LIKE '%acord%130%'
          OR LOWER(COALESCE(${p}.storage_path, '')) LIKE '%acord_130%' THEN 22
        WHEN LOWER(COALESCE(${p}.storage_path, '')) LIKE '%acord%140%'
          OR LOWER(COALESCE(${p}.storage_path, '')) LIKE '%acord_140%' THEN 23
        WHEN LOWER(COALESCE(${p}.storage_path, '')) LIKE '%client-submission%'
          OR LOWER(COALESCE(${p}.storage_path, '')) LIKE '%client_submission%' THEN 90
        ELSE 50
      END ASC,
      ${p}.created_at ASC
  `;
}

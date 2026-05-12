/**
 * Connect COI: render ACORD 25, store in `documents` (R2), email delivery, update `coi_requests`.
 * Runs async after POST /api/connect/coi/request (all segments use the same pipeline).
 */
import crypto from "crypto";
import { generateDocument } from "../generators/index.js";
import { sendWithGmail } from "../email.js";
import { uploadBuffer, documentDownloadPath } from "./r2Service.js";
import { DocumentRole, DocumentType, StorageProvider } from "../constants/postgresEnums.js";
import { getSegmentBranding } from "../config/segmentBranding.js";

const COI_FULFILL_FLAG = process.env.CONNECT_COI_AUTO_FULFILL;

export function isConnectCoiAutoFulfillEnabled() {
  if (COI_FULFILL_FLAG === "0" || COI_FULFILL_FLAG === "false") return false;
  const hasR2 =
    process.env.R2_BUCKET_NAME &&
    process.env.R2_ENDPOINT &&
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY;
  return Boolean(hasR2);
}

function fmtUsDate(d) {
  if (d == null || d === "") return "";
  const s = String(d).trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (iso) {
    const y = iso[1];
    const m = iso[2];
    const day = iso[3];
    return `${m}/${day}/${y}`;
  }
  const t = new Date(s);
  if (Number.isNaN(t.getTime())) return s;
  const mm = String(t.getMonth() + 1).padStart(2, "0");
  const dd = String(t.getDate()).padStart(2, "0");
  return `${mm}/${dd}/${t.getFullYear()}`;
}

function pickGlEachOccurrence(coverageData) {
  if (!coverageData || typeof coverageData !== "object") return "";
  const c = coverageData;
  const keys = [
    "gl_each_occurrence",
    "general_liability_each_occurrence",
    "each_occurrence",
    "gl_limit",
    "general_liability_limit",
  ];
  for (const k of keys) {
    const v = c[k];
    if (v != null && String(v).trim()) return String(v).trim();
  }
  if (c.general_liability && typeof c.general_liability === "object") {
    const g = c.general_liability;
    for (const k of ["each_occurrence", "limit", "per_occurrence"]) {
      if (g[k] != null && String(g[k]).trim()) return String(g[k]).trim();
    }
  }
  return "";
}

function buildHolderCityStateZip(coi) {
  const parts = [
    [coi.certificate_holder_city, coi.certificate_holder_state].filter(Boolean).join(", "),
    coi.certificate_holder_zip,
  ].filter(Boolean);
  return parts.join(" ").trim();
}

function buildOperationsDescription(coi) {
  const bits = [];
  if (coi.certificate_type && coi.certificate_type !== "standard") {
    bits.push(`Certificate type: ${coi.certificate_type}`);
  }
  if (coi.additional_instructions) bits.push(coi.additional_instructions);
  return bits.join(" — ").slice(0, 500);
}

function defaultProducerLines(segment) {
  const b = getSegmentBranding(segment);
  const agency =
    process.env.COI_PRODUCER_NAME ||
    "Commercial Insurance Direct LLC";
  const contact =
    process.env.COI_PRODUCER_CONTACT ||
    `(303) 932-1700 • quotes@${b.segmentDomain}`;
  return { producer_name: agency, producer_contact: contact };
}

/**
 * @param {import("pg").Pool} pool
 * @param {string} coiRequestId - UUID of coi_requests.id
 */
export async function fulfillConnectCoiRequest(pool, coiRequestId) {
  if (!isConnectCoiAutoFulfillEnabled()) {
    console.warn("[connectCoi] Auto-fulfill skipped: R2 not configured or CONNECT_COI_AUTO_FULFILL=false");
    return;
  }

  const load = await pool.query(
    `SELECT cr.*,
            p.policy_number, p.carrier_name, p.effective_date, p.expiration_date,
            p.segment, p.submission_id, p.quote_id, p.client_id AS policy_client_id,
            p.coverage_data,
            b.business_name AS submission_business_name,
            COALESCE(
              NULLIF(TRIM(b.business_name), ''),
              (
                SELECT NULLIF(TRIM(b2.business_name), '')
                FROM businesses b2
                WHERE b2.client_id = cr.client_id
                ORDER BY b2.updated_at DESC NULLS LAST
                LIMIT 1
              ),
              NULLIF(TRIM(CONCAT_WS(' ', c.first_name, c.last_name)), '')
            ) AS insured_display_name
     FROM coi_requests cr
     JOIN policies p ON p.id = cr.policy_id
     JOIN submissions s ON s.submission_id = p.submission_id
     LEFT JOIN businesses b ON b.business_id = s.business_id
     LEFT JOIN clients c ON c.client_id = cr.client_id
     WHERE cr.id = $1::uuid`,
    [coiRequestId],
  );

  if (!load.rows.length) {
    console.error("[connectCoi] No coi_request row for id", coiRequestId);
    return;
  }

  const row = load.rows[0];
  if (row.status === "completed") {
    return;
  }

  const claim = await pool.query(
    `UPDATE coi_requests SET status = 'processing', updated_at = NOW()
     WHERE id = $1::uuid AND status = 'submitted'
     RETURNING id`,
    [coiRequestId],
  );
  if (!claim.rows.length) {
    return;
  }

  const segment = String(row.segment || "bar").toLowerCase();
  const branding = getSegmentBranding(segment);
  const producer = defaultProducerLines(segment);

  const holderLine2 = buildHolderCityStateZip(row);
  const insuredName = String(row.insured_display_name || "").trim() || "Named Insured";
  const glLimit = pickGlEachOccurrence(row.coverage_data);

  const requestRow = {
    form_id: "acord25",
    segment,
    ...producer,
    insured_name: insuredName,
    insured_address: "",
    insurer_a_name: row.carrier_name || "",
    policy_number: row.policy_number || "",
    policy_effective_date: fmtUsDate(row.effective_date),
    policy_expiration_date: fmtUsDate(row.expiration_date),
    gl_each_occurrence: glLimit || "See policy",
    certificate_holder_name: row.certificate_holder_name || "",
    certificate_holder_address: row.certificate_holder_address || "",
    certificate_holder_city_state_zip: holderLine2,
    operations_description: buildOperationsDescription(row),
  };

  let pdfBuffer;
  try {
    const out = await generateDocument(requestRow);
    pdfBuffer = out.buffer;
  } catch (e) {
    console.error("[connectCoi] PDF generation failed:", e.message);
    await pool.query(
      `UPDATE coi_requests SET status = $2, updated_at = NOW(),
        backend_response = COALESCE(backend_response, '{}'::jsonb) || $3::jsonb
       WHERE id = $1::uuid`,
      [
        coiRequestId,
        "failed",
        JSON.stringify({
          auto_fulfill_error: e.message,
          step: "pdf",
        }),
      ],
    );
    return;
  }

  const sha256 = crypto.createHash("sha256").update(pdfBuffer).digest("hex");
  const safeSeg = segment.replace(/[^a-z0-9_-]/gi, "_");
  const r2Key = `coi/${safeSeg}/${row.request_number}/ACORD-25.pdf`;

  try {
    await uploadBuffer(r2Key, pdfBuffer, "application/pdf", {
      segment: safeSeg,
      type: "coi",
      request_number: row.request_number,
    });
  } catch (e) {
    console.error("[connectCoi] R2 upload failed:", e.message);
    await pool.query(
      `UPDATE coi_requests SET status = $2, updated_at = NOW(),
        backend_response = COALESCE(backend_response, '{}'::jsonb) || $3::jsonb
       WHERE id = $1::uuid`,
      [
        coiRequestId,
        "failed",
        JSON.stringify({
          auto_fulfill_error: e.message,
          step: "r2",
        }),
      ],
    );
    return;
  }

  const docInsert = await pool.query(
    `
    INSERT INTO documents (
      client_id,
      submission_id,
      quote_id,
      policy_id,
      document_type,
      document_role,
      storage_provider,
      storage_path,
      mime_type,
      sha256_hash,
      is_original,
      created_by
    )
    VALUES (
      $1::uuid,
      $2::uuid,
      $3::uuid,
      $4::uuid,
      $5,
      $6,
      $7,
      $8,
      'application/pdf',
      $9,
      FALSE,
      'system'::actor_type
    )
    RETURNING document_id
    `,
    [
      row.client_id,
      row.submission_id,
      row.quote_id,
      row.policy_id,
      DocumentType.PDF,
      DocumentRole.COI_GENERATED,
      StorageProvider.R2,
      r2Key,
      sha256,
    ],
  );

  const documentId = docInsert.rows[0].document_id;
  const dlPath = documentDownloadPath(documentId);

  const backendPayload = {
    auto_fulfilled: true,
    document_id: documentId,
    download_path: dlPath,
    template: "ACORD25",
    segment,
  };

  await pool.query(
    `UPDATE coi_requests
     SET status = 'completed',
         backend_notified = true,
         generated_pdf_url = $2,
         updated_at = NOW(),
         backend_response = COALESCE(backend_response, '{}'::jsonb) || $3::jsonb
     WHERE id = $1::uuid`,
    [coiRequestId, dlPath, JSON.stringify(backendPayload)],
  );

  const toEmail = String(row.delivery_email || "").trim();
  if (!toEmail) {
    console.warn("[connectCoi] No delivery_email; document stored but email skipped");
    return;
  }

  const subject = `Certificate of Insurance ${row.request_number} — ${branding.segmentBrandName}`;
  const html = `
    <!DOCTYPE html>
    <html><body style="font-family: Arial, sans-serif; line-height: 1.5; color: #222;">
      <p>Hello,</p>
      <p>Your certificate of insurance (<strong>${row.request_number}</strong>) is attached as <strong>ACORD 25</strong>.</p>
      <p>You can also open or download this certificate anytime from <strong>CID Connect</strong> under <strong>Policy → Policy Documents</strong>.</p>
      <p style="color:#555;font-size:0.9em;">Insured: ${escapeHtml(insuredName)}<br/>
      Policy: ${escapeHtml(row.policy_number || "")}<br/>
      Certificate holder: ${escapeHtml(row.certificate_holder_name || "")}</p>
      <p>— ${escapeHtml(branding.segmentBrandName)}</p>
    </body></html>`;

  try {
    await sendWithGmail({
      to: toEmail,
      subject,
      html,
      segment,
      attachments: [
        {
          filename: `ACORD-25-${row.request_number}.pdf`,
          buffer: pdfBuffer,
        },
      ],
      headers: {
        "X-CID-Coi-Request": row.request_number,
      },
    });
  } catch (e) {
    console.error("[connectCoi] Email send failed (document still in Connect):", e.message);
    await pool.query(
      `UPDATE coi_requests
       SET backend_response = COALESCE(backend_response, '{}'::jsonb) || $2::jsonb,
           updated_at = NOW()
       WHERE id = $1::uuid`,
      [
        coiRequestId,
        JSON.stringify({
          email_error: e.message,
        }),
      ],
    );
  }
}

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

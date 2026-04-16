import crypto from "crypto";
import { getPool } from "../db.js";
import { getObjectStream, uploadBuffer } from "./r2Service.js";
import { combinePDFs, createSimplePagePdf } from "./pdfCombineService.js";
import { generateLetter } from "./aiLetterService.js";
import { getSegmentAssets } from "../utils/assets.js";
import { DocumentRole, DocumentType, StorageProvider } from "../constants/postgresEnums.js";
import { orderByPrimaryCarrierPdf } from "../utils/carrierPdfPrimaryOrder.js";
import { getSegmentAgentInboxEmail } from "../config/segmentAgentInbox.js";

const pool = getPool();

export async function loadPacketData(quoteId) {
  if (!pool) {
    throw new Error("database_not_configured");
  }

  const res = await pool.query(
    `
      SELECT
        q.quote_id,
        q.created_at AS quote_created_at,
        q.submission_id,
        q.carrier_name,
        q.segment,
        q.premium,
        q.effective_date,
        q.expiration_date,
        s.submission_public_id,
        s.segment AS submission_segment,
        s.submitted_at,
        b.business_name,
        c.client_id,
        c.first_name,
        c.last_name,
        c.primary_email,
        c.primary_phone,
        qe.quote_extraction_id,
        qe.reviewed_json,
        qe.review_status,
        d.storage_path AS carrier_pdf_path
      FROM quotes q
      JOIN quote_extractions qe
        ON qe.quote_id = q.quote_id
       AND qe.is_active = TRUE
       AND qe.review_status = 'approved'
      JOIN submissions s
        ON q.submission_id = s.submission_id
      LEFT JOIN businesses b
        ON b.business_id = s.business_id
      JOIN clients c
        ON s.client_id = c.client_id
      LEFT JOIN documents d
        ON d.quote_id = q.quote_id
       AND d.document_role = 'carrier_quote_original'
       AND d.document_type = 'pdf'
      WHERE q.quote_id = $1
      LIMIT 1
    `,
    [quoteId],
  );

  if (res.rows.length === 0) {
    throw new Error("packet_source_not_found");
  }

  const row = res.rows[0];

  // RSS: carrier quote PDFs can be ingested with documents.quote_id still NULL
  // (poller stores originals as orphan documents). extractionService handles this
  // by reading document_ids from `timeline_events.quote.received` payload; packet
  // building needs the same fallback so the generated packet actually includes the
  // carrier quote PDF.
  let carrier_pdf_path = row.carrier_pdf_path;
  if (!carrier_pdf_path) {
    const timelineRes = await pool.query(
      `
        SELECT event_payload_json
        FROM timeline_events
        WHERE quote_id = $1
          AND event_type = 'quote.received'
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [quoteId],
    );

    const payload = timelineRes.rows[0]?.event_payload_json || null;
    const documentIds = Array.isArray(payload?.document_ids) ? payload.document_ids : [];

    if (documentIds.length > 0) {
      const docRes = await pool.query(
        `
          SELECT storage_path
          FROM documents d
          WHERE d.document_id = ANY($1::uuid[])
            AND d.document_role = 'carrier_quote_original'
            AND d.document_type = 'pdf'
          ${orderByPrimaryCarrierPdf("d")}
          LIMIT 1
        `,
        [documentIds],
      );
      carrier_pdf_path = docRes.rows[0]?.storage_path || null;
    }
  }

  return {
    quote: {
      quote_id: row.quote_id,
      quote_created_at: row.quote_created_at || null,
      submission_id: row.submission_id,
      carrier_name: row.carrier_name,
      segment: row.segment,
      premium: row.premium,
      effective_date: row.effective_date,
      expiration_date: row.expiration_date,
    },
    submission: {
      submission_id: row.submission_id,
      submission_public_id: row.submission_public_id,
      segment: row.submission_segment,
      submitted_at: row.submitted_at,
      business_name: row.business_name || null,
    },
    client: {
      client_id: row.client_id,
      first_name: row.first_name,
      last_name: row.last_name,
      primary_email: row.primary_email,
      primary_phone: row.primary_phone,
    },
    extraction: {
      quote_extraction_id: row.quote_extraction_id,
      reviewed_json: row.reviewed_json || {},
      review_status: row.review_status,
    },
    carrierPdfPath: carrier_pdf_path,
  };
}

export function buildPacketData({ quote, extraction, submission, client }) {
  const reviewed = extraction.reviewed_json || {};
  const businessName =
    submission.business_name ||
    reviewed.insured_name ||
    reviewed.business_name ||
    `${client.first_name || ""} ${client.last_name || ""}`.trim();
  const name = businessName;

  return {
    ...reviewed,
    business_name: businessName || null,
    quote_id: quote.quote_id,
    client_name: name || null,
    contact_name: name || null,
    client_email: client.primary_email,
    client_phone: client.primary_phone,
    submission_public_id: submission.submission_public_id,
    segment: submission.segment,
    submitted_at: submission.submitted_at,
    carrier_name: reviewed.carrier_name || quote.carrier_name,
    policy_type: reviewed.policy_type || null,
    annual_premium: reviewed.annual_premium ?? quote.premium,
    effective_date: reviewed.effective_date || quote.effective_date,
    expiration_date: reviewed.expiration_date || quote.expiration_date,
    gl_per_occurrence: reviewed.gl_per_occurrence || null,
    gl_aggregate: reviewed.gl_aggregate || null,
    deductible: reviewed.deductible || null,
    additional_coverages: reviewed.additional_coverages || [],
    exclusions_noted: reviewed.exclusions_noted || [],
    agent_name: "Commercial Insurance Direct",
    agent_phone: "(303) 932-1700",
    agent_email:
      getSegmentAgentInboxEmail(submission.segment) ||
      `quotes@${submission.segment}insurancedirect.com`,
    cid_app_url: "https://app.commercialinsurancedirect.com",
    generated_at: new Date().toISOString(),
    packet_id: null,
  };
}

export async function buildPacket(quoteId) {
  const { quote, extraction, submission, client, carrierPdfPath } =
    await loadPacketData(quoteId);

  if (!extraction || extraction.review_status !== "approved") {
    throw new Error("No approved extraction. Complete S4 review first.");
  }

  const data = buildPacketData({ quote, extraction, submission, client });

  function formatPremiumDisplay(val) {
    if (val == null || val === "") return "";
    const n = typeof val === "number" ? val : parseFloat(String(val).replace(/[^0-9.-]/g, ""));
    if (Number.isNaN(n)) return `$${val}`;
    return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  function formatDateDisplay(val) {
    if (val == null || val === "") return "";
    const d = val instanceof Date ? val : new Date(val);
    if (Number.isNaN(d.getTime())) return String(val);
    return d.toLocaleDateString("en-US", {
      month: "2-digit",
      day: "2-digit",
      year: "numeric",
    });
  }

  function wrapToLines(text, maxChars = 90) {
    const words = String(text || "").replace(/\s+/g, " ").trim().split(" ");
    const out = [];
    let line = "";
    for (const w of words) {
      const next = line ? `${line} ${w}` : w;
      if (next.length > maxChars) {
        if (line) out.push(line);
        line = w;
      } else {
        line = next;
      }
    }
    if (line) out.push(line);
    return out;
  }

  /** When the model returns one wall of text, split ~3 sentences per paragraph for PDF readability. */
  function expandParagraphsIfNeeded(raw) {
    const t = String(raw || "").trim();
    if (!t) return t;
    if (/\n\s*\n/.test(t)) return t;
    const sentences = t
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (sentences.length <= 4) return t;
    const per = 3;
    const chunks = [];
    for (let i = 0; i < sentences.length; i += per) {
      chunks.push(sentences.slice(i, i + per).join(" "));
    }
    return chunks.join("\n\n");
  }

  function letterTextToPdfLines(letterText) {
    const expanded = expandParagraphsIfNeeded(letterText);
    const paragraphs = String(expanded || "")
      .split(/\n\s*\n/g)
      .map((p) => p.trim())
      .filter(Boolean);

    const lines = [];
    paragraphs.forEach((p, idx) => {
      if (idx > 0) {
        lines.push("", "", "");
      }
      lines.push(...wrapToLines(p, 90));
    });
    return lines;
  }

  const packetGeneratedAt = new Date().toISOString();
  const letterText = await generateLetter(
    submission.segment,
    extraction.reviewed_json || {},
    {
      business_name: data.business_name || data.client_name || null,
      contact_name: data.contact_name || null,
      email: data.client_email || null,
    },
    {
      quoteCreatedAt: quote.quote_created_at || null,
      packetGeneratedAt,
    },
  );

  const salesLetterLines = letterTextToPdfLines(letterText);
  const assets = getSegmentAssets(submission.segment);

  const salesLetterPdf = await createSimplePagePdf(salesLetterLines, {
    logoDataUri: assets.logo || null,
    logoMaxWidth: 400,
    logoMaxHeight: 120,
    logoMaxScale: 4,
    logoTop: 40,
    textStartY: assets.logo ? 620 : undefined,
    textLineStep: 16,
    blankLineStep: 12,
  });

  let carrierPdf = null;
  if (carrierPdfPath) {
    const stream = await getObjectStream(carrierPdfPath);
    const chunks = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    carrierPdf = Buffer.concat(chunks);
  }

  const combinedPdf = await combinePDFs(
    carrierPdf
      ? [salesLetterPdf, carrierPdf]
      : [salesLetterPdf],
  );

  return {
    combinedPdf,
    salesLetterPdf,
    data,
    quote,
    extraction,
    submission,
    client,
  };
}

export async function persistPacket({
  quoteId,
  agentId,
  combinedPdf,
  salesLetterPdf,
  packetData,
  quote,
  extraction,
  submission,
  client,
}) {
  if (!pool) {
    throw new Error("database_not_configured");
  }

  const clientDb = await pool.connect();
  try {
    await clientDb.query("BEGIN");

    const existing = await clientDb.query(
      `
        SELECT packet_id, status
        FROM quote_packets
        WHERE quote_id = $1
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [quoteId],
    );

    if (existing.rows.length > 0 && existing.rows[0].status === "sent") {
      await clientDb.query("ROLLBACK");
      throw new Error("packet_already_sent");
    }

    const sha = crypto.createHash("sha256").update(combinedPdf).digest("hex");
    const seg = submission.segment;
    const safeCarrier = String(packetData.carrier_name || quote.carrier_name || "carrier")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    const basePath = `packets/${seg}/${submission.submission_public_id}/${safeCarrier}`;

    const packetPath = `${basePath}-packet.pdf`;
    const salesPath = `${basePath}-sales-letter.pdf`;

    await uploadBuffer(packetPath, combinedPdf, "application/pdf", {
      segment: seg,
      type: "quote_packet",
    });

    await uploadBuffer(salesPath, salesLetterPdf, "application/pdf", {
      segment: seg,
      type: "sales_letter",
    });

    const packetDocRes = await clientDb.query(
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
          $1,
          $2,
          $3,
          NULL,
          $4,
          $5,
          $6,
          $7,
          'application/pdf',
          $8,
          FALSE,
          'agent'
        )
        RETURNING document_id
      `,
      [
        client.client_id,
        submission.submission_id,
        quote.quote_id,
        DocumentType.PDF,
        DocumentRole.QUOTE_PACKET_SENT,
        StorageProvider.R2,
        packetPath,
        sha,
      ],
    );

    const packetDocumentId = packetDocRes.rows[0].document_id;

    const salesDocRes = await clientDb.query(
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
          $1,
          $2,
          $3,
          NULL,
          $4,
          $5,
          $6,
          $7,
          'application/pdf',
          $8,
          FALSE,
          'agent'
        )
        RETURNING document_id
      `,
      [
        client.client_id,
        submission.submission_id,
        quote.quote_id,
        DocumentType.PDF,
        DocumentRole.SALES_LETTER_GENERATED,
        StorageProvider.R2,
        salesPath,
        sha,
      ],
    );

    const salesDocumentId = salesDocRes.rows[0].document_id;

    const packetRes = await clientDb.query(
      `
        INSERT INTO quote_packets (
          quote_id,
          extraction_id,
          packet_document_id,
          status,
          created_by,
          sent_at,
          created_at
        )
        VALUES (
          $1,
          $2,
          $3,
          'sent',
          $4,
          NOW(),
          NOW()
        )
        RETURNING packet_id
      `,
      [quote.quote_id, extraction.quote_extraction_id, packetDocumentId, agentId],
    );

    const packetId = packetRes.rows[0].packet_id;

    await clientDb.query(
      `
        UPDATE quotes
        SET status = 'sent',
            packet_ready = TRUE,
            updated_at = NOW()
        WHERE quote_id = $1
      `,
      [quote.quote_id],
    );

    await clientDb.query(
      `
        UPDATE submissions
        SET status = 'sent_to_client'
        WHERE submission_id = $1
      `,
      [submission.submission_id],
    );

    await clientDb.query(
      `
        INSERT INTO timeline_events (
          submission_id,
          quote_id,
          event_type,
          event_label,
          event_payload_json,
          created_by
        )
        VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [
        submission.submission_id,
        quote.quote_id,
        "packet.sent",
        "Packet sent to client",
        {
          packet_id: packetId,
          packet_document_id: packetDocumentId,
          sales_letter_document_id: salesDocumentId,
          recipients: [client.primary_email],
        },
        agentId || "agent",
      ],
    );

    await clientDb.query("COMMIT");

    return {
      packetId,
      packetDocumentId,
      salesDocumentId,
    };
  } catch (err) {
    await clientDb.query("ROLLBACK");
    throw err;
  } finally {
    clientDb.release();
  }
}


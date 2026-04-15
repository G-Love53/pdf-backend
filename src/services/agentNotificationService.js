import { getPool } from "../db.js";
import { sendWithGmail } from "../email.js";
import { getSegmentAgentInboxEmail } from "../config/segmentAgentInbox.js";

const BAR_AGENT_EMAIL = "quote@barinsurancedirect.com";

function isBarSegment(segment) {
  return String(segment || "bar").trim().toLowerCase() === "bar";
}

function buildSubject(prefix, submissionPublicId, suffix = "") {
  const idPart = submissionPublicId ? ` ${submissionPublicId}` : "";
  const tail = suffix ? ` — ${suffix}` : "";
  return `${prefix}${idPart}${tail}`;
}

export async function notifyBarSubmissionReceived({
  segment,
  submissionPublicId,
  clientName,
}) {
  if (!isBarSegment(segment)) return;

  const subject = buildSubject(
    "[CID][Submission]",
    submissionPublicId,
    clientName || "",
  );

  const lines = [
    "New client submission received.",
    "",
    submissionPublicId ? `Submission: ${submissionPublicId}` : "",
    clientName ? `Client: ${clientName}` : "",
  ].filter(Boolean);

  await sendWithGmail({
    to: [BAR_AGENT_EMAIL],
    subject,
    text: lines.join("\n"),
  });
}

export async function notifyBarCarrierQuoteReceived({ quoteId }) {
  const pool = getPool();
  if (!pool) return;

  const { rows } = await pool.query(
    `
      SELECT
        q.quote_id,
        q.carrier_name,
        s.submission_public_id,
        s.segment,
        COALESCE(b.business_name, CONCAT_WS(' ', c.first_name, c.last_name)) AS client_name
      FROM quotes q
      JOIN submissions s ON s.submission_id = q.submission_id
      LEFT JOIN businesses b ON s.business_id = b.business_id
      LEFT JOIN clients c ON s.client_id = c.client_id
      WHERE q.quote_id = $1
      LIMIT 1
    `,
    [quoteId],
  );

  if (!rows.length) return;
  const row = rows[0];
  if (!isBarSegment(row.segment)) return;

  const subject = buildSubject(
    "[CID][Carrier][Quote]",
    row.submission_public_id,
    row.carrier_name || "",
  );

  const lines = [
    "Carrier quote received and ingested.",
    "",
    row.submission_public_id ? `Submission: ${row.submission_public_id}` : "",
    row.client_name ? `Client: ${row.client_name}` : "",
    row.carrier_name ? `Carrier: ${row.carrier_name}` : "",
  ].filter(Boolean);

  await sendWithGmail({
    to: [BAR_AGENT_EMAIL],
    subject,
    text: lines.join("\n"),
  });
}

export async function notifyBarPacketSent({ packetId }) {
  const pool = getPool();
  if (!pool) return;

  const { rows } = await pool.query(
    `
      SELECT
        qp.packet_id AS packet_id,
        qp.sent_at,
        q.quote_id,
        s.submission_public_id,
        s.segment,
        COALESCE(b.business_name, CONCAT_WS(' ', c.first_name, c.last_name)) AS client_name
      FROM quote_packets qp
      JOIN quotes q ON q.quote_id = qp.quote_id
      JOIN submissions s ON s.submission_id = q.submission_id
      LEFT JOIN businesses b ON s.business_id = b.business_id
      LEFT JOIN clients c ON s.client_id = c.client_id
      WHERE qp.packet_id = $1
      LIMIT 1
    `,
    [packetId],
  );

  if (!rows.length) return;
  const row = rows[0];
  const toEmail = getSegmentAgentInboxEmail(row.segment);
  if (!toEmail) return;

  const subject = buildSubject(
    "[CID][Client][Packet]",
    row.submission_public_id,
    row.client_name || "",
  );

  const lines = [
    "Client packet sent.",
    "",
    row.submission_public_id ? `Submission: ${row.submission_public_id}` : "",
    row.client_name ? `Client: ${row.client_name}` : "",
  ].filter(Boolean);

  await sendWithGmail({
    to: [toEmail],
    subject,
    text: lines.join("\n"),
  });
}

/**
 * @param {object} opts
 * @param {string} opts.submissionId
 * @param {Buffer} [opts.signedPdfBuffer] - attach signed bind PDF for Bar inbox
 * @param {string} [opts.signedPdfFilename]
 */
export async function notifyBarBindSigned({
  submissionId,
  signedPdfBuffer,
  signedPdfFilename = "bind-confirmation-signed.pdf",
}) {
  const pool = getPool();
  if (!pool) return;

  const { rows } = await pool.query(
    `
      SELECT
        s.submission_id,
        s.submission_public_id,
        s.segment,
        COALESCE(b.business_name, CONCAT_WS(' ', c.first_name, c.last_name)) AS client_name
      FROM submissions s
      LEFT JOIN businesses b ON s.business_id = b.business_id
      LEFT JOIN clients c ON s.client_id = c.client_id
      WHERE s.submission_id = $1
      LIMIT 1
    `,
    [submissionId],
  );

  if (!rows.length) return;
  const row = rows[0];
  if (!isBarSegment(row.segment)) return;

  const subject = buildSubject(
    "[CID][Bind]",
    row.submission_public_id,
    row.client_name || "",
  );

  const lines = [
    "Bind signed and policy created.",
    signedPdfBuffer && Buffer.isBuffer(signedPdfBuffer)
      ? "Signed bind confirmation PDF is attached."
      : "",
    "",
    row.submission_public_id ? `Submission: ${row.submission_public_id}` : "",
    row.client_name ? `Client: ${row.client_name}` : "",
  ].filter(Boolean);

  const attachments =
    signedPdfBuffer && Buffer.isBuffer(signedPdfBuffer)
      ? [{ filename: signedPdfFilename, buffer: signedPdfBuffer }]
      : [];

  await sendWithGmail({
    to: [BAR_AGENT_EMAIL],
    subject,
    text: lines.join("\n"),
    attachments,
  });
}

/**
 * Carrier email with PDF + CID but no quote-keyword signal (poller UW fork — not routed to S4).
 */
export async function notifyBarUwQuestionPdf({
  segment,
  submissionPublicId,
  clientName,
  carrierName,
  emailSubject,
  gmailMessageId,
  carrierMessageId,
  pdfCount,
}) {
  if (!isBarSegment(segment)) return;

  const subject = buildSubject(
    "[CID][Carrier][UW]",
    submissionPublicId || "",
    carrierName || "",
  );

  const lines = [
    "Underwriter replied with a PDF, but no quote keywords were found in the subject/body.",
    "This message was not routed to S4 extraction. Review in Gmail or the operator UI.",
    "",
    submissionPublicId ? `Submission: ${submissionPublicId}` : "",
    clientName ? `Client: ${clientName}` : "",
    carrierName ? `Carrier: ${carrierName}` : "",
    emailSubject ? `Subject: ${emailSubject}` : "",
    `Carrier message ID: ${carrierMessageId}`,
    `Gmail message ID: ${gmailMessageId}`,
    pdfCount != null ? `PDFs stored: ${pdfCount}` : "",
  ].filter(Boolean);

  await sendWithGmail({
    to: [BAR_AGENT_EMAIL],
    subject,
    text: lines.join("\n"),
  });
}


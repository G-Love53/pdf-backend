import cron from "node-cron";
import { google } from "googleapis";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import crypto from "crypto";
import path from "path";
import { fileURLToPath } from "url";
import { getPool } from "../db.js";
import {
  notifyBarCarrierQuoteReceived,
  notifyBarUwQuestionPdf,
} from "../services/agentNotificationService.js";
import { DocumentRole, DocumentType, StorageProvider } from "../constants/postgresEnums.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const pool = getPool();

const storage = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

const BUCKET = process.env.R2_BUCKET_NAME;

const SEGMENTS = [
  // Bar inbox uses singular "quote@..." (no trailing "s") per Gmail filter setup.
  { segment: "bar", email: "quote@barinsurancedirect.com", label: "carrier-quotes" },
  {
    segment: "roofer",
    email: "quotes@roofingcontractorinsurancedirect.com",
    label: "carrier-quotes",
  },
  {
    segment: "plumber",
    email: "quotes@plumbinginsurancedirect.com",
    label: "carrier-quotes",
  },
  { segment: "hvac", email: "quotes@hvacinsurancedirect.com", label: "carrier-quotes" },
];

const CONFIDENCE = {
  AUTO_MATCH: 0.95,
  REVIEW_LOWER: 0.7,
};

// Quote-signal keywords — UW clarification emails often omit these; formal quotes usually include at least one.
const QUOTE_SIGNALS = [
  "quote",
  "quotation",
  "proposal",
  "premium",
  "indication",
  "terms",
  "coverage offered",
  "rate",
  "rated",
  "pricing",
];

function hasQuoteSignal(subject = "", body = "") {
  const text = `${subject} ${body}`.toLowerCase();
  return QUOTE_SIGNALS.some((signal) => {
    if (signal.includes(" ")) return text.includes(signal);
    const escaped = signal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`\\b${escaped}\\b`, "i").test(text);
  });
}

function extractEmail(str) {
  if (!str) return "";
  const match = String(str).match(/<([^>]+)>/);
  return match ? match[1].trim() : String(str).trim();
}

/**
 * Gmail list query: exclude messages our own SMTP account sent into this inbox (client submission
 * packets), so they never hit carrier_message / S4. Complements header + subject checks in
 * processMessage().
 *
 * Env:
 * - GMAIL_POLLER_EXCLUDE_SELF_SENT=false — disable this layer (use if you forward carrier PDFs from the same address).
 * - GMAIL_POLLER_EXCLUDE_FROM_SENDER — override sender to exclude (default: GMAIL_USER).
 * - GMAIL_POLLER_EXTRA_QUERY — extra Gmail search terms (space-separated), e.g. -label:foo
 *
 * When the send-from address equals the segment inbox address, uses -from:me (handles aliases).
 */
function getExcludeFromQueryPart(seg) {
  if (process.env.GMAIL_POLLER_EXCLUDE_SELF_SENT === "false") {
    return "";
  }
  const explicit = process.env.GMAIL_POLLER_EXCLUDE_FROM_SENDER?.trim();
  if (explicit && explicit.toLowerCase() === "none") {
    return "";
  }
  const raw = explicit || process.env.GMAIL_USER || "";
  if (!raw) return "";
  const sendFrom = extractEmail(raw);
  if (!sendFrom) return "";
  if (seg.email && sendFrom.toLowerCase() === String(seg.email).toLowerCase()) {
    return "-from:me";
  }
  return `-from:${sendFrom}`;
}

function buildSegmentPollQuery(seg) {
  const parts = ["in:inbox", "is:unread"];
  const exclude = getExcludeFromQueryPart(seg);
  if (exclude) parts.push(exclude);
  const extra = process.env.GMAIL_POLLER_EXTRA_QUERY?.trim();
  if (extra) parts.push(extra);
  return parts.join(" ");
}

function buildGmailClient(inboxEmail) {
  const auth = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET,
    process.env.GMAIL_REDIRECT_URI,
  );

  const segKey = inboxEmail
    .split("@")[1]
    .split(".")[0]
    .replace("roofingcontractorinsurancedirect", "roofer")
    .replace("plumbinginsurancedirect", "plumber")
    .replace("hvacinsurancedirect", "hvac")
    .replace("barinsurancedirect", "bar")
    .toUpperCase();

  const tokenEnvKey = `GMAIL_REFRESH_TOKEN_${segKey}`;
  const refreshToken = process.env[tokenEnvKey];

  if (!refreshToken) {
    throw new Error(`Missing ${tokenEnvKey} — cannot authenticate Gmail for ${inboxEmail}`);
  }

  auth.setCredentials({ refresh_token: refreshToken });
  return google.gmail({ version: "v1", auth });
}

export async function runPoller() {
  if (!pool) {
    console.warn("[gmailPoller] DB not configured; poller disabled.");
    return;
  }

  console.log(`[CID Poller] Starting run at ${new Date().toISOString()}`);

  for (const seg of SEGMENTS) {
    try {
      await pollSegmentInbox(seg);
    } catch (err) {
      console.error(`[CID Poller] ERROR in segment ${seg.segment}:`, err.message);
      await safeCreateWorkQueueItem({
        queue_type: "extraction_failed",
        related_entity_type: "segment_inbox",
        related_entity_id: "00000000-0000-0000-0000-000000000000",
        priority: 2,
        reason_code: "poller_segment_error",
        reason_detail: `Segment ${seg.segment} poller failed: ${err.message}`,
      });
    }
  }

  console.log(`[CID Poller] Run complete at ${new Date().toISOString()}`);
}

async function pollSegmentInbox(seg) {
  const gmail = buildGmailClient(seg.email);

  // Optional: carrier-quotes label is just for organizing the Gmail mailbox.
  // The poller should still ingest quotes even if the carrier hasn't auto-labeled them.
  const carrierQuotesLabelId = await resolveLabelId(gmail, seg.label);
  if (!carrierQuotesLabelId) {
    console.warn(
      `[${seg.segment}] Label "${seg.label}" not found — will ingest without auto-labeling`,
    );
  }

  const pollQuery = buildSegmentPollQuery(seg);

  const res = await gmail.users.messages.list({
    userId: "me",
    // Use search query (not labelIds) so we can exclude our own outbound client packets (-from:me / -from:sender).
    // We still require CID token + PDF attachment in `processMessage()` as the "quote signal".
    q: pollQuery,
    maxResults: 20,
  });

  const messages = res.data.messages || [];
  if (messages.length === 0) {
    console.log(`[${seg.segment}] No new messages`);
    return;
  }

  console.log(`[${seg.segment}] Found ${messages.length} new message(s) (q=${pollQuery})`);

  for (const msg of messages) {
    try {
      const processed = await processMessage(gmail, msg.id, seg);

      // Do not mark read or label — ops still triage / forward to carriers from inbox.
      if (processed === "leave_unread") {
        continue;
      }

      const addLabelIds =
        processed && carrierQuotesLabelId ? [carrierQuotesLabelId] : [];

      await gmail.users.messages.modify({
        userId: "me",
        id: msg.id,
        resource: {
          removeLabelIds: ["UNREAD"],
          ...(addLabelIds.length ? { addLabelIds } : {}),
        },
      });
    } catch (err) {
      console.error(`[${seg.segment}] Failed to process message ${msg.id}:`, err.message);
      await safeCreateWorkQueueItem({
        queue_type: "extraction_failed",
        related_entity_type: "carrier_message",
        related_entity_id: "00000000-0000-0000-0000-000000000000",
        priority: 1,
        reason_code: "message_processing_error",
        reason_detail: `Message ${msg.id} in ${seg.segment}: ${err.message}`,
      });
    }
  }
}

async function processMessage(gmail, messageId, seg) {
  console.log(`[${seg.segment}] Processing message ${messageId}`);

  const msgRes = await gmail.users.messages.get({
    userId: "me",
    id: messageId,
    format: "full",
  });
  const msg = msgRes.data;

  const headers = parseHeaders(msg.payload.headers);
  const subject = headers.Subject || "";
  const fromEmail = extractEmail(headers.From || "");
  const toEmail = extractEmail(headers.To || seg.email);
  const receivedAt = new Date(parseInt(msg.internalDate || "0", 10)).toISOString();
  const threadId = msg.threadId;
  const gmailMsgId = msg.id;

  const bodyText = extractBody(msg.payload);

  // Robust RSS criteria:
  // - Quotes must include a CID token (subject or body)
  // - Quotes must include at least one PDF attachment
  // This prevents non-carrier unread mail from getting ingested when we poll INBOX+UNREAD.
  const cidCandidate = extractPublicId(subject) || extractPublicId(bodyText);
  const attachmentMetas = [];
  collectParts(msg.payload, attachmentMetas);
  const hasPdfAttachment = attachmentMetas.some((a) =>
    String(a.filename || "").toLowerCase().endsWith(".pdf"),
  );

  if (!cidCandidate || !hasPdfAttachment) {
    console.log(
      `[${seg.segment}] Skipping message ${messageId} (cid=${cidCandidate ? cidCandidate : "none"} pdf=${
        hasPdfAttachment ? "yes" : "no"
      })`,
    );
    return false;
  }

  if (isOutboundClientSubmissionPacket(headers, subject, fromEmail)) {
    console.log(
      `[${seg.segment}] Skipping message ${messageId} (cid=${cidCandidate}) — outbound client submission packet (not a carrier quote); leaving unread`,
    );
    return "leave_unread";
  }

  // Dedupe: if we've already ingested this exact Gmail message for this segment,
  // avoid creating duplicate carrier_messages/quotes/work items.
  // - If a carrier_message exists but no quote exists (previous run failed), we retry quote creation.
  let carrierMessageId = null;
  const existingCarrierRes = await pool.query(
    `
      SELECT carrier_message_id
      FROM carrier_messages
      WHERE gmail_message_id = $1
        AND segment = $2::segment_type
      ORDER BY created_at ASC, carrier_message_id ASC
      LIMIT 1
    `,
    [gmailMsgId, seg.segment],
  );

  if (existingCarrierRes.rows.length > 0) {
    // Keep the oldest carrier_message per gmail_message_id so future ingestion can't branch
    // into multiple carrier_message_id / quote duplicates.
    carrierMessageId = existingCarrierRes.rows[0].carrier_message_id;

    // Purge any duplicate carrier_messages for this gmail_message_id (keeping the oldest),
    // along with quotes + extraction review queue items that were attached to the duplicates.
    // This is safe to run repeatedly: if there are no duplicates, the DELETEs are no-ops.
    try {
      await dedupeCarrierMessagesForGmail({
        gmailMessageId: gmailMsgId,
        segment: seg.segment,
      });
    } catch (err) {
      console.error(
        `[${seg.segment}] Failed dedupe for gmail_message_id=${gmailMsgId}:`,
        err.message || err,
      );
      // Don't block message processing if cleanup fails; better to retry than to crash.
    }

    const existingQuoteRes = await pool.query(
      `
        SELECT quote_id
        FROM quotes
        WHERE carrier_message_id = $1
        LIMIT 1
      `,
      [carrierMessageId],
    );

    if (existingQuoteRes.rows.length > 0) {
      console.log(
        `[${seg.segment}] Skipping message ${messageId} (already has quote for gmail_message_id ${gmailMsgId})`,
      );
      return true;
    }
  } else {
    carrierMessageId = await createCarrierMessage({
      submission_id: null,
      segment: seg.segment,
      direction: "inbound",
      carrier_name: resolveCarrierName(fromEmail),
      from_email: fromEmail,
      to_email: toEmail,
      subject,
      gmail_message_id: gmailMsgId,
      gmail_thread_id: threadId,
      body_text: bodyText,
      received_at: receivedAt,
    });
  }

  const attachments = await extractAttachments(gmail, msg, gmailMsgId);
  const documentIds = [];

  for (const att of attachments) {
    try {
      const docId = await storeAttachment(att, seg, carrierMessageId);
      if (docId) documentIds.push(docId);
    } catch (err) {
      console.error(`[${seg.segment}] Failed to store attachment ${att.filename}:`, err.message);
    }
  }

  if (documentIds.length === 0 && attachments.length > 0) {
    await safeCreateWorkQueueItem({
      queue_type: "extraction_failed",
      related_entity_type: "carrier_message",
      related_entity_id: carrierMessageId,
      priority: 1,
      reason_code: "attachment_storage_failed",
      reason_detail: `All ${attachments.length} attachment(s) failed to store for message ${gmailMsgId}`,
    });
    return true;
  }

  const matchResult = await matchToSubmission(subject, bodyText, threadId, seg.segment);

  // UW fork: PDF + CID but no quote-keyword signal (questions, clarifications) — do not create quote / S4.
  // Set GMAIL_POLLER_QUOTE_SIGNAL_FORK=false to always use the legacy S4 path when PDF+CID match.
  const quoteSignalForkEnabled = process.env.GMAIL_POLLER_QUOTE_SIGNAL_FORK !== "false";
  if (quoteSignalForkEnabled && !hasQuoteSignal(subject, bodyText)) {
    if (matchResult.submissionId) {
      await pool.query(
        `
          UPDATE carrier_messages
          SET submission_id = $1
          WHERE gmail_message_id = $2
            AND segment = $3::segment_type
        `,
        [matchResult.submissionId, gmailMsgId, seg.segment],
      );
    }

    const uwEventExists = await pool.query(
      `
        SELECT 1
        FROM timeline_events
        WHERE event_type = 'carrier.uw_question'
          AND (event_payload_json->>'carrier_message_id')::uuid = $1
        LIMIT 1
      `,
      [carrierMessageId],
    );

    if (uwEventExists.rows.length === 0) {
      await createWorkQueueItemIfMissingOpen({
        queue_type: "uw_question",
        related_entity_type: "carrier_message",
        related_entity_id: carrierMessageId,
        priority: 2,
        reason_code: "uw_pdf_no_quote_signal",
        reason_detail: `CID ${cidCandidate}: PDF from ${fromEmail}, no quote keywords in subject/body. Gmail message ${gmailMsgId}`,
      });

      await createTimelineEvent({
        client_id: matchResult.clientId || null,
        submission_id: matchResult.submissionId || null,
        quote_id: null,
        policy_id: null,
        event_type: "carrier.uw_question",
        event_label: `Underwriter reply (PDF, no quote keywords) from ${resolveCarrierName(fromEmail) || fromEmail}`,
        event_payload_json: {
          carrier_message_id: carrierMessageId,
          from_email: fromEmail,
          subject,
          attachment_count: attachments.length,
          document_ids: documentIds,
          match_confidence: matchResult.confidence,
          match_status: matchResult.matchStatus,
        },
        created_by: "system",
      });

      let clientName = null;
      if (matchResult.submissionId) {
        const cn = await pool.query(
          `
            SELECT COALESCE(b.business_name, CONCAT_WS(' ', c.first_name, c.last_name)) AS name
            FROM submissions s
            JOIN clients c ON c.client_id = s.client_id
            LEFT JOIN businesses b ON b.business_id = s.business_id
            WHERE s.submission_id = $1
          `,
          [matchResult.submissionId],
        );
        clientName = cn.rows[0]?.name || null;
      }

      try {
        await notifyBarUwQuestionPdf({
          segment: seg.segment,
          submissionPublicId: cidCandidate,
          clientName,
          carrierName: resolveCarrierName(fromEmail),
          emailSubject: subject,
          gmailMessageId: gmailMsgId,
          carrierMessageId,
          pdfCount: documentIds.length,
        });
      } catch (err) {
        console.error("[gmailPoller] notifyBarUwQuestionPdf error:", err.message || err);
      }
    }

    console.warn(
      `[${seg.segment}] UW question fork (no quote keywords) — ${cidCandidate} — skipping quote/S4`,
    );
    return true;
  }

  // Hard idempotency: if we've already created a quote for this exact Gmail message
  // (across any duplicated carrier_message rows), do not create a second quote.
  let quoteId = null;
  const existingQuoteRes = await pool.query(
    `
      SELECT q.quote_id, q.carrier_message_id
      FROM quotes q
      JOIN carrier_messages cm
        ON cm.carrier_message_id = q.carrier_message_id
      WHERE cm.gmail_message_id = $1
        AND cm.segment = $2::segment_type
      ORDER BY q.created_at ASC, q.quote_id ASC
      LIMIT 1
    `,
    [gmailMsgId, seg.segment],
  );

  if (existingQuoteRes.rows.length > 0) {
    quoteId = existingQuoteRes.rows[0].quote_id;
    carrierMessageId = existingQuoteRes.rows[0].carrier_message_id;
  } else {
    quoteId = await createQuote({
      submission_id: matchResult.submissionId,
      carrier_message_id: carrierMessageId,
      carrier_name: resolveCarrierName(fromEmail),
      segment: seg.segment,
      match_confidence: matchResult.confidence,
      match_status: matchResult.matchStatus,
      match_method: matchResult.matchMethod,
      match_details_json: matchResult.details,
    });
  }

  if (documentIds.length > 0) {
    await createWorkQueueItemIfMissingOpen({
      queue_type: "extraction_review",
      related_entity_type: "quote",
      related_entity_id: quoteId,
      priority: 3,
      reason_code: "new_quote_received",
      reason_detail: `New quote with ${documentIds.length} carrier PDF(s) ingested from message ${gmailMsgId}`,
    });
  }

  if (matchResult.submissionId) {
    // Ensure all duplicated carrier_message rows for this Gmail message converge
    // on the same matched submission_id.
    await pool.query(
      `
        UPDATE carrier_messages
        SET submission_id = $1
        WHERE gmail_message_id = $2
          AND segment = $3::segment_type
      `,
      [matchResult.submissionId, gmailMsgId, seg.segment],
    );
  }

  await createTimelineEvent({
    client_id: matchResult.clientId || null,
    submission_id: matchResult.submissionId || null,
    quote_id: quoteId,
    event_type: "quote.received",
    event_label: `Quote received from ${resolveCarrierName(fromEmail) || fromEmail}`,
    event_payload_json: {
      carrier_message_id: carrierMessageId,
      from_email: fromEmail,
      subject,
      attachment_count: attachments.length,
      document_ids: documentIds,
      match_confidence: matchResult.confidence,
      match_status: matchResult.matchStatus,
    },
    created_by: "system",
  });

  await routeByConfidence(matchResult, quoteId, carrierMessageId, seg.segment);

  try {
    await notifyBarCarrierQuoteReceived({ quoteId });
  } catch (err) {
    console.error(
      "[gmailPoller] notifyBarCarrierQuoteReceived error:",
      err.message || err,
    );
  }

  console.log(
    `[${seg.segment}] Message ${messageId} processed. Quote: ${quoteId} | Match: ${matchResult.matchStatus} (${matchResult.confidence})`,
  );

  return true;
}

async function dedupeCarrierMessagesForGmail({ gmailMessageId, segment }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Determine which carrier_messages are duplicates for this gmail_message_id + segment
    // (keep row_number = 1; delete all rn > 1).
    //
    // Note: the schema enforces ON DELETE RESTRICT in multiple places, so we must delete
    // dependent rows in a safe order.
    const deleteWorkQueueSql = `
      WITH ranked AS (
        SELECT carrier_message_id,
               ROW_NUMBER() OVER (ORDER BY created_at ASC, carrier_message_id ASC) AS rn
        FROM carrier_messages
        WHERE gmail_message_id = $1
          AND segment = $2::segment_type
      ),
      dupe_carriers AS (
        SELECT carrier_message_id FROM ranked WHERE rn > 1
      ),
      dupe_quotes AS (
        SELECT q.quote_id
        FROM quotes q
        WHERE q.carrier_message_id IN (SELECT carrier_message_id FROM dupe_carriers)
      )
      DELETE FROM work_queue_items wi
      WHERE wi.related_entity_type = 'quote'
        AND wi.related_entity_id IN (SELECT quote_id FROM dupe_quotes)
    `;

    const deleteQuotePacketsSql = `
      WITH ranked AS (
        SELECT carrier_message_id,
               ROW_NUMBER() OVER (ORDER BY created_at ASC, carrier_message_id ASC) AS rn
        FROM carrier_messages
        WHERE gmail_message_id = $1
          AND segment = $2::segment_type
      ),
      dupe_carriers AS (
        SELECT carrier_message_id FROM ranked WHERE rn > 1
      ),
      dupe_quotes AS (
        SELECT q.quote_id
        FROM quotes q
        WHERE q.carrier_message_id IN (SELECT carrier_message_id FROM dupe_carriers)
      )
      DELETE FROM quote_packets qp
      WHERE qp.quote_id IN (SELECT quote_id FROM dupe_quotes)
    `;

    const deleteSignatureEventsSql = `
      WITH ranked AS (
        SELECT carrier_message_id,
               ROW_NUMBER() OVER (ORDER BY created_at ASC, carrier_message_id ASC) AS rn
        FROM carrier_messages
        WHERE gmail_message_id = $1
          AND segment = $2::segment_type
      ),
      dupe_carriers AS (
        SELECT carrier_message_id FROM ranked WHERE rn > 1
      ),
      dupe_quotes AS (
        SELECT q.quote_id
        FROM quotes q
        WHERE q.carrier_message_id IN (SELECT carrier_message_id FROM dupe_carriers)
      ),
      dupe_policies AS (
        SELECT p.policy_id
        FROM policies p
        WHERE p.quote_id IN (SELECT quote_id FROM dupe_quotes)
      )
      DELETE FROM signature_events se
      WHERE (se.quote_id IN (SELECT quote_id FROM dupe_quotes))
         OR (se.policy_id IN (SELECT policy_id FROM dupe_policies))
    `;

    const deleteTimelineEventsSql = `
      WITH ranked AS (
        SELECT carrier_message_id,
               ROW_NUMBER() OVER (ORDER BY created_at ASC, carrier_message_id ASC) AS rn
        FROM carrier_messages
        WHERE gmail_message_id = $1
          AND segment = $2::segment_type
      ),
      dupe_carriers AS (
        SELECT carrier_message_id FROM ranked WHERE rn > 1
      ),
      dupe_quotes AS (
        SELECT q.quote_id
        FROM quotes q
        WHERE q.carrier_message_id IN (SELECT carrier_message_id FROM dupe_carriers)
      )
      DELETE FROM timeline_events te
      WHERE te.quote_id IN (SELECT quote_id FROM dupe_quotes)
    `;

    const deleteQuoteExtractionsSql = `
      WITH ranked AS (
        SELECT carrier_message_id,
               ROW_NUMBER() OVER (ORDER BY created_at ASC, carrier_message_id ASC) AS rn
        FROM carrier_messages
        WHERE gmail_message_id = $1
          AND segment = $2::segment_type
      ),
      dupe_carriers AS (
        SELECT carrier_message_id FROM ranked WHERE rn > 1
      ),
      dupe_quotes AS (
        SELECT q.quote_id
        FROM quotes q
        WHERE q.carrier_message_id IN (SELECT carrier_message_id FROM dupe_carriers)
      )
      DELETE FROM quote_extractions qe
      WHERE qe.quote_id IN (SELECT quote_id FROM dupe_quotes)
    `;

    // Remove carrier_quote_original PDFs tied to the duplicate carrier_message_ids.
    // Note: our documents table doesn't store carrier_message_id directly, so we match
    // via the storage_path segment (which includes the carrier_message_id).
    const deleteDocumentsSql = `
      WITH ranked AS (
        SELECT carrier_message_id,
               ROW_NUMBER() OVER (ORDER BY created_at ASC, carrier_message_id ASC) AS rn
        FROM carrier_messages
        WHERE gmail_message_id = $1
          AND segment = $2::segment_type
      ),
      dupe_carriers AS (
        SELECT carrier_message_id FROM ranked WHERE rn > 1
      ),
      dupe_quotes AS (
        SELECT q.quote_id
        FROM quotes q
        WHERE q.carrier_message_id IN (SELECT carrier_message_id FROM dupe_carriers)
      ),
      dupe_policies AS (
        SELECT p.policy_id
        FROM policies p
        WHERE p.quote_id IN (SELECT quote_id FROM dupe_quotes)
      )
      DELETE FROM documents d
      WHERE d.quote_id IN (SELECT quote_id FROM dupe_quotes)
         OR d.policy_id IN (SELECT policy_id FROM dupe_policies)
         OR (
           d.document_role = 'carrier_quote_original'
           AND d.document_type = 'pdf'
           AND EXISTS (
             SELECT 1
             FROM dupe_carriers dc
             WHERE d.storage_path LIKE '%' || dc.carrier_message_id::text || '/%'
           )
         )
    `;

    const deletePoliciesSql = `
      WITH ranked AS (
        SELECT carrier_message_id,
               ROW_NUMBER() OVER (ORDER BY created_at ASC, carrier_message_id ASC) AS rn
        FROM carrier_messages
        WHERE gmail_message_id = $1
          AND segment = $2::segment_type
      ),
      dupe_carriers AS (
        SELECT carrier_message_id FROM ranked WHERE rn > 1
      ),
      dupe_quotes AS (
        SELECT q.quote_id
        FROM quotes q
        WHERE q.carrier_message_id IN (SELECT carrier_message_id FROM dupe_carriers)
      )
      DELETE FROM policies p
      WHERE p.quote_id IN (SELECT quote_id FROM dupe_quotes)
    `;

    const deleteQuotesSql = `
      WITH ranked AS (
        SELECT carrier_message_id,
               ROW_NUMBER() OVER (ORDER BY created_at ASC, carrier_message_id ASC) AS rn
        FROM carrier_messages
        WHERE gmail_message_id = $1
          AND segment = $2::segment_type
      ),
      dupe_carriers AS (
        SELECT carrier_message_id FROM ranked WHERE rn > 1
      )
      DELETE FROM quotes q
      WHERE q.carrier_message_id IN (SELECT carrier_message_id FROM dupe_carriers)
    `;

    const deleteCarrierMessagesSql = `
      WITH ranked AS (
        SELECT carrier_message_id,
               ROW_NUMBER() OVER (ORDER BY created_at ASC, carrier_message_id ASC) AS rn
        FROM carrier_messages
        WHERE gmail_message_id = $1
          AND segment = $2::segment_type
      ),
      dupe_carriers AS (
        SELECT carrier_message_id FROM ranked WHERE rn > 1
      )
      DELETE FROM carrier_messages cm
      WHERE cm.carrier_message_id IN (SELECT carrier_message_id FROM dupe_carriers)
    `;

    const params = [gmailMessageId, segment];
    await client.query(deleteWorkQueueSql, params);
    await client.query(deleteQuotePacketsSql, params);
    await client.query(deleteSignatureEventsSql, params);
    await client.query(deleteTimelineEventsSql, params);
    await client.query(deleteQuoteExtractionsSql, params);
    await client.query(deleteDocumentsSql, params);
    await client.query(deletePoliciesSql, params);
    await client.query(deleteQuotesSql, params);
    await client.query(deleteCarrierMessagesSql, params);

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function matchToSubmission(subject, bodyText, threadId, segment) {
  const details = {
    submission_id_in_subject: false,
    submission_id_in_body: false,
    thread_match: false,
    segment_match: true,
    candidate_id: null,
  };

  let submissionId = null;
  let clientId = null;
  let signals = 0;

  const subjectMatch = extractPublicId(subject);
  if (subjectMatch) {
    details.submission_id_in_subject = true;
    const row = await findSubmissionByPublicId(subjectMatch, segment);
    if (row) {
      submissionId = row.submission_id;
      clientId = row.client_id;
      details.candidate_id = submissionId;
      signals += 60;
    }
  }

  if (!submissionId) {
    const bodyMatch = extractPublicId(bodyText);
    if (bodyMatch) {
      details.submission_id_in_body = true;
      const row = await findSubmissionByPublicId(bodyMatch, segment);
      if (row) {
        submissionId = row.submission_id;
        clientId = row.client_id;
        details.candidate_id = submissionId;
        signals += 50;
      }
    }
  }

  if (threadId) {
    const threadRow = await pool.query(
      `SELECT cm.submission_id, s.client_id
       FROM   carrier_messages cm
       JOIN   submissions s ON s.submission_id = cm.submission_id
       WHERE  cm.gmail_thread_id = $1
         AND  cm.direction       = 'outbound'
         AND  cm.segment         = $2
       LIMIT  1`,
      [threadId, segment],
    );
    if (threadRow.rows.length > 0) {
      details.thread_match = true;
      signals += 30;
      if (!submissionId) {
        submissionId = threadRow.rows[0].submission_id;
        clientId = threadRow.rows[0].client_id;
        details.candidate_id = submissionId;
      }
    }
  }

  const confidence = submissionId
    ? Math.min(parseFloat(((signals >= 60 ? 0.95 : signals / 90) + 0.05).toFixed(3)), 1)
    : 0;

  let matchStatus;
  let matchMethod;
  if (confidence >= CONFIDENCE.AUTO_MATCH && submissionId) {
    matchStatus = "auto_matched";
    matchMethod = buildMatchMethod(details);
  } else if (confidence >= CONFIDENCE.REVIEW_LOWER && submissionId) {
    matchStatus = "review_required";
    matchMethod = buildMatchMethod(details);
  } else {
    matchStatus = "unmatched";
    matchMethod = null;
    submissionId = null;
    clientId = null;
  }

  return { submissionId, clientId, confidence, matchStatus, matchMethod, details };
}

async function routeByConfidence(matchResult, quoteId, carrierMessageId, segment) {
  const { confidence, matchStatus, submissionId } = matchResult;

  if (matchStatus === "auto_matched" && submissionId) {
    await pool.query(
      `UPDATE submissions
       SET    status = 'quote_received'
       WHERE  submission_id = $1
         AND  status NOT IN ('accepted','bound','issued','closed_lost')`,
      [submissionId],
    );
    console.log(`[${segment}] Auto-matched to submission ${submissionId}`);
    return;
  }

  if (matchStatus === "review_required") {
    await createWorkQueueItemIfMissingOpen({
      queue_type: "quote_match_review",
      related_entity_type: "quote",
      related_entity_id: quoteId,
      priority: 2,
      reason_code: "low_match_confidence",
      reason_detail: `Match confidence ${confidence} (${CONFIDENCE.REVIEW_LOWER}–${CONFIDENCE.AUTO_MATCH} range). Candidate submission: ${matchResult.submissionId}. Agent confirmation required.`,
    });
    console.log(`[${segment}] Quote ${quoteId} → review queue (confidence: ${confidence})`);
    return;
  }

  await createWorkQueueItemIfMissingOpen({
    queue_type: "quote_unmatched",
    related_entity_type: "quote",
    related_entity_id: quoteId,
    priority: 2,
    reason_code: "no_match_found",
    reason_detail: `No submission match found. Confidence: ${confidence}. Segment: ${segment}. Manual association required.`,
  });
  console.log(`[${segment}] Quote ${quoteId} → unmatched queue`);
}

async function extractAttachments(gmail, msg, messageId) {
  const attachments = [];
  collectParts(msg.payload, attachments);

  const results = [];
  for (const att of attachments) {
    if (!att.attachmentId) continue;
    try {
      const attRes = await gmail.users.messages.attachments.get({
        userId: "me",
        messageId,
        id: att.attachmentId,
      });
      results.push({
        filename: att.filename,
        mimeType: att.mimeType,
        data: Buffer.from(attRes.data.data || "", "base64"),
      });
    } catch (err) {
      console.error(`Failed to fetch attachment ${att.filename}:`, err.message);
    }
  }
  return results;
}

function collectParts(part, out) {
  if (!part) return;
  if (part.filename && part.filename.length > 0 && part.body?.attachmentId) {
    out.push({
      filename: part.filename,
      mimeType: part.mimeType || "application/octet-stream",
      attachmentId: part.body.attachmentId,
    });
  }
  if (part.parts) {
    for (const p of part.parts) collectParts(p, out);
  }
}

async function storeAttachment(att, seg, carrierMessageId) {
  const ext = path.extname(att.filename).toLowerCase();
  if (ext !== ".pdf") {
    console.log(`[${seg.segment}] Skipping non-PDF attachment: ${att.filename}`);
    return null;
  }

  const sha256Hash = crypto.createHash("sha256").update(att.data).digest("hex");

  const existing = await pool.query(
    "SELECT document_id FROM documents WHERE sha256_hash = $1 LIMIT 1",
    [sha256Hash],
  );
  if (existing.rows.length > 0) {
    console.log(`[${seg.segment}] Duplicate attachment detected (hash match) — skipping store`);
    return existing.rows[0].document_id;
  }

  const datePath = new Date().toISOString().slice(0, 10).replace(/-/g, "/");
  const storagePath = `incoming/${seg.segment}/${datePath}/${carrierMessageId}/${att.filename}`;

  await storage.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: storagePath,
      Body: att.data,
      ContentType: "application/pdf",
      Metadata: {
        segment: seg.segment,
        carrier_message_id: carrierMessageId,
        original_filename: att.filename,
      },
    }),
  );

  const docResult = await pool.query(
    `INSERT INTO documents
       (client_id, submission_id, quote_id, policy_id,
        document_type, document_role, storage_provider, storage_path,
        mime_type, sha256_hash, is_original, created_by)
     VALUES
       (NULL, NULL, NULL, NULL,
        $1, $2, $3, $4,
        'application/pdf', $5, TRUE, 'carrier')
     RETURNING document_id`,
    [
      DocumentType.PDF,
      DocumentRole.CARRIER_QUOTE_ORIGINAL,
      StorageProvider.R2,
      storagePath,
      sha256Hash,
    ],
  );

  const documentId = docResult.rows[0].document_id;
  console.log(`[${seg.segment}] Stored attachment ${att.filename} → document ${documentId}`);
  return documentId;
}

async function createCarrierMessage(data) {
  const res = await pool.query(
    `INSERT INTO carrier_messages
       (submission_id, segment, direction, carrier_name,
        from_email, to_email, subject,
        gmail_message_id, gmail_thread_id,
        body_text, received_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     RETURNING carrier_message_id`,
    [
      data.submission_id,
      data.segment,
      data.direction,
      data.carrier_name,
      data.from_email,
      data.to_email,
      data.subject,
      data.gmail_message_id,
      data.gmail_thread_id,
      data.body_text,
      data.received_at,
    ],
  );
  return res.rows[0].carrier_message_id;
}

async function createQuote(data) {
  const res = await pool.query(
    `INSERT INTO quotes
       (submission_id, carrier_message_id, carrier_name, segment,
        status, match_confidence, match_status, match_method, match_details_json)
     VALUES ($1,$2,$3,$4,
       $5::quote_status, $6, $7::match_status_type, $8, $9)
     RETURNING quote_id`,
    [
      data.submission_id,
      data.carrier_message_id,
      data.carrier_name,
      data.segment,
      data.submission_id
        ? data.match_confidence >= CONFIDENCE.AUTO_MATCH
          ? "matched"
          : "match_review"
        : "unmatched",
      data.match_confidence,
      data.match_status,
      data.match_method,
      data.match_details_json ? JSON.stringify(data.match_details_json) : null,
    ],
  );
  return res.rows[0].quote_id;
}

async function createWorkQueueItem(data) {
  await pool.query(
    `INSERT INTO work_queue_items
       (queue_type, related_entity_type, related_entity_id,
        priority, reason_code, reason_detail, status)
     VALUES ($1::queue_type, $2, $3, $4, $5, $6, 'open')`,
    [
      data.queue_type,
      data.related_entity_type,
      data.related_entity_id,
      data.priority,
      data.reason_code,
      data.reason_detail,
    ],
  );
}

async function createWorkQueueItemIfMissingOpen(data) {
  // Idempotency: prevent duplicate open queue items when the same Gmail message
  // (or a previously-ingested attachment set) is reprocessed.
  const exists = await pool.query(
    `
      SELECT 1
      FROM work_queue_items
      WHERE queue_type = $1::queue_type
        AND related_entity_type = $2
        AND related_entity_id = $3
        AND status = 'open'
      LIMIT 1
    `,
    [data.queue_type, data.related_entity_type, data.related_entity_id],
  );

  if (exists.rows.length > 0) return;
  await createWorkQueueItem(data);
}

async function safeCreateWorkQueueItem(data) {
  try {
    await createWorkQueueItem(data);
  } catch (err) {
    console.error("[CID Poller] Failed to create work queue item:", err.message);
  }
}

async function createTimelineEvent(data) {
  await pool.query(
    `INSERT INTO timeline_events
       (client_id, submission_id, quote_id, policy_id,
        event_type, event_label, event_payload_json, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      data.client_id || null,
      data.submission_id || null,
      data.quote_id || null,
      data.policy_id || null,
      data.event_type,
      data.event_label,
      data.event_payload_json ? JSON.stringify(data.event_payload_json) : null,
      data.created_by || "system",
    ],
  );
}

async function resolveLabelId(gmail, labelName) {
  const res = await gmail.users.labels.list({ userId: "me" });
  const labels = res.data.labels || [];
  const match = labels.find((l) => l.name.toLowerCase() === labelName.toLowerCase());
  return match ? match.id : null;
}

async function findSubmissionByPublicId(publicId, segment) {
  const res = await pool.query(
    `SELECT submission_id, client_id
     FROM   submissions
     WHERE  submission_public_id = $1
       AND  segment = $2::segment_type
       AND  status NOT IN ('closed_lost','rejected')
     LIMIT  1`,
    [publicId, segment],
  );
  return res.rows[0] || null;
}

function parseHeaders(headers) {
  const map = {};
  for (const h of headers || []) {
    map[h.name] = h.value;
  }
  return map;
}

/** Case-insensitive header lookup (Gmail uses mixed-case names). */
function getHeaderCI(map, name) {
  const want = String(name).toLowerCase();
  for (const k of Object.keys(map || {})) {
    if (k.toLowerCase() === want) return map[k];
  }
  return undefined;
}

/**
 * Outbound client submission packets are often addressed TO the same segment inbox the poller reads.
 * They match CID + PDF like a carrier quote but must not create carrier_message / S4.
 * Detect via X-CID-Origin (new) or From=GMAIL_USER + subject line (legacy emails without header).
 */
function isOutboundClientSubmissionPacket(headers, subject, fromEmail) {
  const origin = String(getHeaderCI(headers, "X-CID-Origin") || "").toLowerCase();
  if (origin === "client-submission") return true;

  const gmailUser = process.env.GMAIL_USER ? extractEmail(process.env.GMAIL_USER) : "";
  if (
    gmailUser &&
    fromEmail &&
    fromEmail.toLowerCase() === gmailUser.toLowerCase() &&
    /CID Submission Packet/i.test(String(subject || ""))
  ) {
    return true;
  }
  return false;
}

function extractBody(payload) {
  if (!payload) return "";
  if (payload.mimeType === "text/plain" && payload.body?.data) {
    return Buffer.from(payload.body.data, "base64").toString("utf-8");
  }
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === "text/plain" && part.body?.data) {
        return Buffer.from(part.body.data, "base64").toString("utf-8");
      }
    }
    for (const part of payload.parts) {
      const body = extractBody(part);
      if (body) return body;
    }
  }
  return "";
}

function extractPublicId(text) {
  if (!text) return null;
  const match = text.match(/CID-[A-Z]{3,4}-\d{8}-\d{6}/);
  return match ? match[0] : null;
}

function resolveCarrierName(email) {
  const domain = (email || "").split("@")[1] || "";
  const map = {
    "markel.com": "Markel",
    "cna.com": "CNA",
    "guard.com": "Berkley GUARD",
    "libertymutual.com": "Liberty Mutual",
    "amtrust.com": "AmTrust",
    "employers.com": "Employers",
    "biberk.com": "biBERK",
    "societyinsurance.com": "Society Insurance",
    "allaccessins.com": "Society Insurance",
    "coterie.com": "Coterie",
  };
  // quotes.carrier_name is NOT NULL, so never return null.
  return map[domain.toLowerCase()] || (domain ? domain : "Unknown Carrier");
}

function buildMatchMethod(details) {
  const methods = [];
  if (details.submission_id_in_subject) methods.push("subject_id");
  if (details.submission_id_in_body) methods.push("body_id");
  if (details.thread_match) methods.push("thread_linkage");
  if (details.segment_match) methods.push("segment_inbox");
  return methods.join("+") || null;
}

export function startGmailPoller() {
  if (!pool) {
    console.warn("[gmailPoller] DB not configured; poller disabled.");
    return;
  }

  if (process.env.ENABLE_GMAIL_POLLING !== "true") {
    console.log("[gmailPoller] ENABLE_GMAIL_POLLING!=true; poller not started.");
    return;
  }

  const schedule = process.env.GMAIL_POLL_CRON || "*/3 * * * *";

  cron.schedule(schedule, async () => {
    try {
      await runPoller();
    } catch (err) {
      console.error("[gmailPoller] error:", err.message || err);
    }
  });

  console.log(`[gmailPoller] scheduled with cron "${schedule}"`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runPoller()
    .then(() => {
      console.log("[CID Poller] Done.");
      process.exit(0);
    })
    .catch((err) => {
      console.error("[CID Poller] Fatal error:", err);
      process.exit(1);
    });
}


import express from "express";
import { getPool } from "../db.js";
import { downloadSignedDocument } from "../services/hellosignService.js";
import { uploadBuffer } from "../services/r2Service.js";
import { createPolicy } from "../services/policyService.js";
import {
  sendBindConfirmationEmail,
  sendWelcomeEmail,
} from "../services/bindEmailService.js";
import { notifyBarBindSigned } from "../services/agentNotificationService.js";
import {
  processBoldSignDocumentCompleted,
  tryFinalizeBoldSignFromDocumentId,
} from "../services/boldsignBindCompletion.js";

const router = express.Router();

// HelloSign sends urlencoded or form-data with a "json" payload.
// We rely on express.raw() at mount time so we can verify signatures if needed,
// but here we just parse req.body.json when present.

function parseHelloSignPayload(req) {
  const body = req.body;

  // When mounted with express.raw(), body is a Buffer.
  if (Buffer.isBuffer(body)) {
    const text = body.toString("utf8");

    // HelloSign test/send uses application/x-www-form-urlencoded with `json=...`
    const hasJsonField = text.includes("json=");
    if (hasJsonField) {
      const params = new URLSearchParams(text);
      const jsonStr = params.get("json");
      if (jsonStr) {
        try {
          return JSON.parse(jsonStr);
        } catch {
          return null;
        }
      }
    }

    // Fallback: maybe they sent raw JSON
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }

  // If some other middleware already parsed it to an object/string
  const val = body || {};
  if (typeof val === "string") {
    try {
      return JSON.parse(val);
    } catch {
      return null;
    }
  }
  if (val.json) {
    try {
      return JSON.parse(val.json);
    } catch {
      return null;
    }
  }
  return val;
}

// BoldSign sends webhook payloads as JSON.
// Since we mount this route with express.raw(), req.body is a Buffer and we must JSON.parse it.
function parseBoldSignPayload(req) {
  const body = req.body;

  if (Buffer.isBuffer(body)) {
    const text = body.toString("utf8");
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }

  if (typeof body === "string") {
    try {
      return JSON.parse(body);
    } catch {
      return null;
    }
  }

  // Fallback if some other middleware parsed it
  return body && typeof body === "object" ? body : null;
}

router.post("/api/webhooks/hellosign", async (req, res) => {
  try {
    const payload = parseHelloSignPayload(req);
    // Handle HelloSign account-level test pings which expect a specific string
    if (!payload || !payload.event) {
      return res.status(200).send("Hello API Event Received");
    }

    const eventType = payload.event?.event_type;

    // Some HelloSign / Dropbox Sign docs mention a callback test event
    if (eventType === "callback_test" || eventType === "account_callback_test") {
      return res.status(200).send("Hello API Event Received");
    }
    const reqObj = payload.signature_request || payload.signature_request?.signature_request || payload.signature_request;

    const hsId =
      reqObj?.signature_request_id ||
      reqObj?.id ||
      payload.event?.event_metadata?.related_signature_id ||
      null;

    const pool = getPool();
    if (!pool) {
      console.warn("[hellosign webhook] no DB pool");
      return res.status(200).json({ ok: true, ignored: true });
    }

    if (eventType === "signature_request_viewed") {
      await pool.query(
        `
          UPDATE bind_requests
          SET status = 'viewed', updated_at = NOW()
          WHERE hellosign_request_id = $1
        `,
        [hsId],
      );

      await pool.query(
        `
          INSERT INTO timeline_events (
            submission_id,
            event_type,
            event_label,
            event_payload_json,
            created_by
          )
          SELECT
            q.submission_id,
            'bind.viewed',
            'Bind confirmation viewed',
            $2,
            'system'
          FROM bind_requests br
          JOIN quotes q ON q.quote_id = br.quote_id
          WHERE br.hellosign_request_id = $1
        `,
        [hsId, payload],
      );

      return res.status(200).json({ ok: true });
    }

    if (
      eventType === "signature_request_declined" ||
      eventType === "signature_request_invalid"
    ) {
      const newStatus =
        eventType === "signature_request_declined"
          ? "declined"
          : "invalid";

      await pool.query(
        `
          UPDATE bind_requests
          SET status = $2, updated_at = NOW()
          WHERE hellosign_request_id = $1
        `,
        [hsId, newStatus],
      );

      await pool.query(
        `
          INSERT INTO timeline_events (
            submission_id,
            event_type,
            event_label,
            event_payload_json,
            created_by
          )
          SELECT
            q.submission_id,
            $2,
            $3,
            $4,
            'system'
          FROM bind_requests br
          JOIN quotes q ON q.quote_id = br.quote_id
          WHERE br.hellosign_request_id = $1
        `,
        [
          hsId,
          eventType === "signature_request_declined"
            ? "bind.declined"
            : "bind.invalid",
          eventType === "signature_request_declined"
            ? "Bind confirmation declined"
            : "Bind confirmation invalid",
          payload,
        ],
      );

      return res.status(200).json({ ok: true });
    }

    if (eventType === "signature_request_signed") {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        // Load bind_request, quote, submission, client
        const { rows } = await client.query(
          `
            SELECT
              br.*,
              q.*,
              qe.reviewed_json AS reviewed_json,
              s.submission_id,
              s.submission_public_id,
              s.segment,
              s.client_id,
              c.primary_email,
              c.first_name,
              c.last_name,
              c.primary_phone
            FROM bind_requests br
            JOIN quotes q ON q.quote_id = br.quote_id
            JOIN submissions s ON s.submission_id = q.submission_id
            JOIN clients c ON c.client_id = s.client_id
            JOIN quote_packets qp ON qp.packet_id = br.packet_id
            JOIN quote_extractions qe ON qe.quote_extraction_id = qp.extraction_id
            WHERE br.hellosign_request_id = $1
            FOR UPDATE
          `,
          [hsId],
        );

        if (!rows.length) {
          await client.query("ROLLBACK");
          return res.status(200).json({ ok: true, missing: true });
        }

        const row = rows[0];

        const segment = row.segment || "bar";

        // Download signed PDF from HelloSign
        const signedBuffer = await downloadSignedDocument(hsId);

        const r2Key = `binds/${segment}/${row.submission_public_id}/${row.carrier_name}-bind-confirmation-signed.pdf`;

        await uploadBuffer(r2Key, signedBuffer, "application/pdf", {
          segment,
          type: "bind_confirmation_signed",
        });

        const docRes = await client.query(
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
              'pdf',
              'bind_confirmation_signed',
              'r2',
              $4,
              'application/pdf',
              NULL,
              FALSE,
              'system'
            )
            RETURNING document_id
          `,
          [
            row.client_id,
            row.submission_id,
            row.quote_id,
            r2Key,
          ],
        );

        const signedDocumentId = docRes.rows[0].document_id;

        // Update bind_request status and link signed document
        const brRes = await client.query(
          `
            UPDATE bind_requests
            SET status = 'signed',
                document_id = COALESCE(document_id, $2),
                updated_at = NOW()
            WHERE id = $1
            RETURNING *
          `,
          [row.id, signedDocumentId],
        );

        const bindRequest = brRes.rows[0];

        // Create policy via policyService within same tx
        const policy = await createPolicy({
          client: {
            client_id: row.client_id,
            primary_email: row.primary_email,
            first_name: row.first_name,
            last_name: row.last_name,
          },
          submission: {
            submission_id: row.submission_id,
            submission_public_id: row.submission_public_id,
            segment,
          },
          quote: {
            carrier_name: row.carrier_name,
            quote_id: row.quote_id,
          },
          bindRequest,
          extraction: { reviewed_json: row.reviewed_json },
          txClient: client,
          boundBy: "system",
        });

        // Cascade status updates
        await client.query(
          `
            UPDATE quote_packets
            SET status = 'approved', updated_at = NOW()
            WHERE quote_id = $1
          `,
          [row.quote_id],
        );

        await client.query(
          `
            UPDATE quotes
            SET status = 'accepted', updated_at = NOW()
            WHERE quote_id = $1
          `,
          [row.quote_id],
        );

        await client.query(
          `
            UPDATE submissions
            SET status = 'bound', updated_at = NOW()
            WHERE submission_id = $1
          `,
          [row.submission_id],
        );

        await client.query(
          `
            INSERT INTO timeline_events (
              submission_id,
              event_type,
              event_label,
              event_payload_json,
              created_by
            )
            VALUES ($1, $2, $3, $4, $5)
          `,
          [
            row.submission_id,
            "bind.signed",
            "Bind confirmation signed",
            payload,
            "system",
          ],
        );

        await client.query("COMMIT");
        client.release();

        // Emails (outside transaction)
        const clientObj = {
          primary_email: row.primary_email,
          first_name: row.first_name,
          last_name: row.last_name,
        };

        await sendBindConfirmationEmail({
          client: clientObj,
          policy,
          segment,
        });

        // Fire-and-forget welcome email (no delay scheduler here; can be added later)
        await sendWelcomeEmail({
          client: clientObj,
          policy,
          cidAppUrl: process.env.CID_APP_URL,
          segment,
        });

        try {
          await notifyBarBindSigned({ submissionId: row.submission_id });
        } catch (err) {
          console.error(
            "[hellosign webhook] notifyBarBindSigned error:",
            err.message || err,
          );
        }

        return res.status(200).json({ ok: true });
      } catch (err) {
        try {
          await pool.query("ROLLBACK");
        } catch {
          // ignore
        }
        throw err;
      }
    }

    // Unknown / unhandled events
    return res.status(200).json({ ok: true, ignored: true });
  } catch (err) {
    console.error("[hellosign webhook] error:", err);
    return res.status(500).json({ ok: false, error: err.message || "ERROR" });
  }
});

// BoldSign webhook handler.
// For now, we only ensure the URL verifies (and we safely acknowledge real events).
// Next step after setup is to implement: correlation (CID-{submission_public_id}),
// idempotency (event.id), and Completed -> download -> bind.
router.post("/api/webhooks/boldsign", async (req, res) => {
  try {
    const payload = parseBoldSignPayload(req);

    if (!payload?.event) {
      return res.status(200).json({ ok: true, ignored: true });
    }

    const eventType =
      payload?.event?.eventType ?? payload?.event?.EventType ?? payload?.EventType;
    const eventId = payload?.event?.id ?? payload?.event?.Id;
    const docId =
      payload?.data?.documentId ??
      payload?.data?.DocumentId ??
      payload?.documentId ??
      null;
    const environment = payload?.event?.environment;

    // BoldSign webhook URL verification uses eventType=Verification.
    if (String(eventType).toLowerCase() === "verification") {
      return res.status(200).json({ ok: true });
    }

    console.log("[boldsign webhook] event", {
      eventType,
      documentId: docId,
      environment,
    });

    const pool = getPool();
    if (!pool) {
      console.warn("[boldsign webhook] no DB pool");
      return res.status(200).json({ ok: true, ignored: true });
    }

    if (!docId) {
      return res.status(200).json({ ok: true, ignored: true });
    }

    // SENT: primarily informational for now.
    if (eventType === "Sent") {
      await pool.query(
        `
          INSERT INTO timeline_events (
            submission_id,
            quote_id,
            event_type,
            event_label,
            event_payload_json,
            created_by
          )
          SELECT
            s.submission_id,
            q.quote_id,
            'bind.sent',
            'Bind confirmation sent',
            $2,
            'system'
          FROM bind_requests br
          JOIN quotes q ON q.quote_id = br.quote_id
          JOIN submissions s ON s.submission_id = q.submission_id
          WHERE br.hellosign_request_id = $1
          LIMIT 1
        `,
        [docId, { event_id: eventId, payload, environment }],
      );
      return res.status(200).json({ ok: true });
    }

    if (eventType === "Viewed") {
      // Mark bind request viewed if still awaiting signature.
      const { rowCount } = await pool.query(
        `
          UPDATE bind_requests
          SET status = 'viewed', viewed_at = NOW(), updated_at = NOW()
          WHERE hellosign_request_id = $1
            AND status = 'awaiting_signature'
        `,
        [docId],
      );

      // Record timeline event regardless of whether we transitioned,
      // because viewed events are “nice to have” but should still be audit logged.
      await pool.query(
        `
          INSERT INTO timeline_events (
            submission_id,
            event_type,
            event_label,
            event_payload_json,
            created_by
          )
          SELECT
            s.submission_id,
            'bind.viewed',
            'Bind confirmation viewed',
            $2,
            'system'
          FROM bind_requests br
          JOIN quotes q ON q.quote_id = br.quote_id
          JOIN submissions s ON s.submission_id = q.submission_id
          WHERE br.hellosign_request_id = $1
          LIMIT 1
        `,
        [docId, { event_id: eventId, payload, environment }],
      );

      return res.status(200).json({ ok: true, transitioned: rowCount > 0 });
    }

    // Completed: trust BoldSign — finalize immediately (properties API can lag vs webhook).
    if (eventType === "Completed") {
      try {
        const result = await processBoldSignDocumentCompleted(docId, {
          eventId,
          payload,
          source: "webhook",
        });
        if (result.outcome === "missing") {
          return res.status(200).json({ ok: true, missing: true });
        }
        if (result.outcome === "cancelled") {
          return res.status(200).json({ ok: true, ignored: "cancelled" });
        }
        if (result.outcome === "already_signed") {
          return res.status(200).json({ ok: true, ignored: "already_signed" });
        }
        return res.status(200).json({ ok: true });
      } catch (err) {
        console.error("[boldsign webhook] Completed handler error:", err);
        throw err;
      }
    }

    // Signed: per-signer; use properties + idempotent finalize (safe if Completed also fires).
    if (eventType === "Signed") {
      try {
        const result = await tryFinalizeBoldSignFromDocumentId(docId, {
          eventId,
          payload,
          source: "webhook",
        });
        if (result.outcome === "missing") {
          return res.status(200).json({ ok: true, missing: true });
        }
        if (result.outcome === "cancelled") {
          return res.status(200).json({ ok: true, ignored: "cancelled" });
        }
        if (result.outcome === "already_signed") {
          return res.status(200).json({ ok: true, ignored: "already_signed" });
        }
        if (result.outcome === "not_ready") {
          return res.status(200).json({ ok: true, ignored: "not_ready", eventType });
        }
        return res.status(200).json({ ok: true });
      } catch (err) {
        console.error("[boldsign webhook] Signed handler error:", err);
        throw err;
      }
    }

    // Unknown / unhandled events
    return res.status(200).json({ ok: true, ignored: true, eventType });
  } catch (err) {
    console.error("[boldsign webhook] error:", err);
    // Still 200 to avoid retry storms during initial integration.
    return res.status(200).json({ ok: true });
  }
});

export default router;


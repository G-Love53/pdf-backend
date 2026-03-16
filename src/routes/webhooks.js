import express from "express";
import { getPool } from "../db.js";
import { downloadSignedDocument } from "../services/hellosignService.js";
import { uploadBuffer } from "../services/r2Service.js";
import { createPolicy } from "../services/policyService.js";
import {
  sendBindConfirmationEmail,
  sendWelcomeEmail,
} from "../services/bindEmailService.js";

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
          JOIN quotes q ON q.id = br.quote_id
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
          JOIN quotes q ON q.id = br.quote_id
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
              s.submission_id,
              s.submission_public_id,
              s.segment,
              s.client_id,
              c.primary_email,
              c.first_name,
              c.last_name,
              c.primary_phone
            FROM bind_requests br
            JOIN quotes q ON q.id = br.quote_id
            JOIN submissions s ON s.submission_id = q.submission_id
            JOIN clients c ON c.client_id = s.client_id
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
            row.id,
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
            id: row.id,
            carrier_name: row.carrier_name,
            policy_type: row.policy_type,
            annual_premium: row.annual_premium,
            effective_date: row.effective_date,
            expiration_date: row.expiration_date,
          },
          bindRequest,
          extraction: null,
          txClient: client,
          boundBy: "system",
        });

        // Cascade status updates
        await client.query(
          `
            UPDATE quote_packets
            SET status = 'bound', updated_at = NOW()
            WHERE quote_id = $1
          `,
          [row.quote_id],
        );

        await client.query(
          `
            UPDATE quotes
            SET status = 'bound', updated_at = NOW()
            WHERE id = $1
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

export default router;


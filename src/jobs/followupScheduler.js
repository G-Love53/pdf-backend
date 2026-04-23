import pg from "pg";
import { sendWithGmail } from "../email.js";

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl:
    process.env.PGSSLMODE !== "disable"
      ? { rejectUnauthorized: false }
      : undefined,
});

const BAR_AGENT_EMAIL = "quote@barinsurancedirect.com";

function normalizeSegment(raw) {
  const v = String(raw || "")
    .trim()
    .toLowerCase();
  if (!v) return "bar";
  if (v === "roofing") return "roofer";
  return v;
}

function parseEmailList(value) {
  return String(value || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

function unique(list) {
  return Array.from(new Set(list));
}

function resolveCarrierFollowupRecipients(segment) {
  const seg = normalizeSegment(segment);
  const upper = seg.toUpperCase();
  const env = process.env;

  const recipients = unique([
    ...parseEmailList(env[`UW_EMAIL_${upper}`]),
    ...parseEmailList(env[`CARRIER_EMAIL_${upper}`]),
    ...parseEmailList(env[`GMAIL_USER_${upper}`]),
    ...parseEmailList(env.CARRIER_EMAIL),
  ]);

  if (recipients.length) return recipients;

  // Safety fallback keeps behavior alive if segment env is missing.
  return [BAR_AGENT_EMAIL];
}

async function carrierFollowups() {
  // 48h carrier follow-up: find outreach with no reply and no previous follow-up
  const { rows } = await pool.query(
    `
      SELECT
        q.quote_id,
        q.submission_id,
        q.carrier_name,
        s.segment,
        s.submission_public_id
      FROM quotes q
      JOIN submissions s ON s.submission_id = q.submission_id
      WHERE
        q.status IN ('matched','match_review')
        AND s.status NOT IN ('closed_lost','rejected','bound','issued')
        AND q.created_at <= NOW() - INTERVAL '48 hours'
        AND NOT EXISTS (
          SELECT 1 FROM timeline_events te
          WHERE te.quote_id = q.quote_id
            AND te.event_type = 'carrier.reply_received'
        )
        AND NOT EXISTS (
          SELECT 1 FROM timeline_events te
          WHERE te.quote_id = q.quote_id
            AND te.event_type = 'carrier.followup_sent'
        )
    `,
  );

  for (const row of rows) {
    const subject = `[CID][Carrier][Followup] ${row.submission_public_id || ""} — ${row.carrier_name}`;
    const textLines = [
      `Follow-up on quote request ${row.submission_public_id || ""}.`,
      "",
      `Carrier: ${row.carrier_name}`,
      "",
      "No carrier reply has been detected after 48 hours.",
      "Please review and nudge the carrier as needed.",
    ];

    await sendWithGmail({
      to: resolveCarrierFollowupRecipients(row.segment),
      subject,
      text: textLines.join("\n"),
      segment: normalizeSegment(row.segment),
    });

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
        VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [
        row.submission_id,
        row.quote_id,
        "carrier.followup_sent",
        "Carrier follow-up email sent to agent",
        { carrier_name: row.carrier_name },
        "system",
      ],
    );
  }

  // 7-day hard no-response marker
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
        q.submission_id,
        q.quote_id,
        'carrier.no_response',
        'Carrier did not respond after follow-up',
        jsonb_build_object('carrier_name', q.carrier_name),
        'system'
      FROM quotes q
      JOIN submissions s ON s.submission_id = q.submission_id
      WHERE
        q.status IN ('matched','match_review')
        AND s.status NOT IN ('closed_lost','rejected','bound','issued')
        AND EXISTS (
          SELECT 1 FROM timeline_events te
          WHERE te.quote_id = q.quote_id
            AND te.event_type = 'carrier.followup_sent'
            AND te.created_at <= NOW() - INTERVAL '5 days'
        )
        AND NOT EXISTS (
          SELECT 1 FROM timeline_events te
          WHERE te.quote_id = q.quote_id
            AND te.event_type = 'carrier.reply_received'
        )
        AND NOT EXISTS (
          SELECT 1 FROM timeline_events te
          WHERE te.quote_id = q.quote_id
            AND te.event_type = 'carrier.no_response'
        )
    `,
  );
}

async function clientFollowups() {
  // Day 3 and day 7 client follow-ups after packet.sent
  const { rows } = await pool.query(
    `
      SELECT
        qp.packet_id AS packet_id,
        qp.quote_id,
        qp.sent_at,
        q.submission_id,
        s.segment,
        s.submission_public_id,
        c.primary_email
      FROM quote_packets qp
      JOIN quotes q ON q.quote_id = qp.quote_id
      JOIN submissions s ON s.submission_id = q.submission_id
      JOIN clients c ON c.client_id = s.client_id
      WHERE
        qp.status = 'sent'
        AND s.status NOT IN ('closed_lost','rejected','bound','issued')
        AND c.primary_email IS NOT NULL
    `,
  );

  for (const row of rows) {
    const ageDays =
      (Date.now() - new Date(row.sent_at).getTime()) / (1000 * 60 * 60 * 24);

    if (ageDays >= 3 && ageDays < 5) {
      // Day 3 follow-up if not already sent
      const res = await pool.query(
        `
          SELECT 1 FROM timeline_events
          WHERE submission_id = $1
            AND event_type = 'client.followup_day3_sent'
          LIMIT 1
        `,
        [row.submission_id],
      );
      if (res.rowCount === 0) {
        const subject = `[CID][Client][Followup] ${row.submission_public_id || ""} — Packet sent 3 days ago`;
        const textLines = [
          "Just checking in — did you get a chance to review the quote packet we sent?",
          "",
          "If you have any questions or want to walk through the options, just reply to this email.",
        ];

        await sendWithGmail({
          to: [row.primary_email],
          subject,
          text: textLines.join("\n"),
          segment: row.segment || "bar",
        });

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
            VALUES ($1, $2, $3, $4, $5, $6)
          `,
          [
            row.submission_id,
            row.quote_id,
            "client.followup_day3_sent",
            "Client day-3 follow-up sent",
            { packet_id: row.packet_id },
            "system",
          ],
        );
      }
    } else if (ageDays >= 7 && ageDays < 10) {
      // Day 7 follow-up if not already sent
      const res = await pool.query(
        `
          SELECT 1 FROM timeline_events
          WHERE submission_id = $1
            AND event_type = 'client.followup_day7_sent'
          LIMIT 1
        `,
        [row.submission_id],
      );
      if (res.rowCount === 0) {
        const subject = `[CID][Client][Followup] ${row.submission_public_id || ""} — Quote still available`;
        const textLines = [
          "Your quote is still available if you'd like to move forward.",
          "",
          "Reply to this email and we can finalize coverage or answer any last questions.",
        ];

        await sendWithGmail({
          to: [row.primary_email],
          subject,
          text: textLines.join("\n"),
          segment: row.segment || "bar",
        });

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
            VALUES ($1, $2, $3, $4, $5, $6)
          `,
          [
            row.submission_id,
            row.quote_id,
            "client.followup_day7_sent",
            "Client day-7 follow-up sent",
            { packet_id: row.packet_id },
            "system",
          ],
        );
      }
    }
  }
}

async function expireSubmissions() {
  // Stale intake cleanup: mark old non-terminal submissions closed_lost (submission_status has no "expired" in 001).
  await pool.query(
    `
      UPDATE submissions s
      SET status = 'closed_lost'
      WHERE
        s.status NOT IN ('closed_lost','rejected','bound','issued')
        AND s.created_at <= NOW() - INTERVAL '30 days'
        AND NOT EXISTS (
          SELECT 1 FROM policies p
          WHERE p.submission_id = s.submission_id
        )
        AND NOT EXISTS (
          SELECT 1 FROM bind_requests br
          WHERE br.quote_id IN (
            SELECT q.quote_id FROM quotes q WHERE q.submission_id = s.submission_id
          )
            AND br.status IN ('awaiting_signature','signed')
        )
    `,
  );
}

export async function runFollowupScheduler() {
  await carrierFollowups();
  await clientFollowups();
  await expireSubmissions();
}


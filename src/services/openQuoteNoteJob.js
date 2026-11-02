/**
 * Sends the one open-page note. Skips anyone who already has a price.
 * The ready-to-bind job owns that case. Does not call a carrier.
 */

import { getPool } from "../db.js";
import { sendWithGmail } from "../email.js";
import { CONNECTQUOTE_MARKETING_READY } from "../config/connectQuoteLinks.js";
import {
  buildOpenQuoteNoteEmail,
  decideOpenQuoteNote,
  normalizeVisitEmail,
  openQuoteReturnUrl,
} from "./openQuoteNote.js";

const PRICE_EVENTS = [
  "coterie.bindable_quote",
  "coterie.session",
  "guard.quoted",
  "coterie.policy.bound",
  "guard.policy.created",
];

const CLAIM_STALE_MS = 20 * 60 * 1000;

async function ensureTable(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS cq_open_notes (
      id BIGSERIAL PRIMARY KEY,
      email TEXT NOT NULL,
      segment TEXT,
      session_id UUID,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      sent_at TIMESTAMPTZ
    )
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS cq_open_notes_email_idx
      ON cq_open_notes (email)
  `);
}

async function personHasQuote(pool, { email, sessionId, engagedAt, segments }) {
  const bySession = await pool.query(
    `
      SELECT 1
      FROM cq_events
      WHERE session_id = $1
        AND event IN ('quote_requested', 'quote_returned', 'bind_clicked')
      LIMIT 1
    `,
    [sessionId],
  );
  if (bySession.rows.length) return true;

  const byApplication = await pool.query(
    `
      SELECT 1
      FROM clients c
      JOIN submissions s ON s.client_id = c.client_id
      WHERE lower(c.primary_email) = $1
        AND s.segment::text = ANY($2::text[])
        AND (
          s.submitted_at >= $3::timestamptz
          OR EXISTS (
            SELECT 1 FROM timeline_events te
            WHERE te.submission_id = s.submission_id
              AND te.event_type = ANY($4::text[])
              AND te.created_at >= $3::timestamptz
          )
          OR EXISTS (
            SELECT 1 FROM timeline_events te
            WHERE te.submission_id = s.submission_id
              AND te.event_type = ANY($4::text[])
              AND te.created_at > NOW() - INTERVAL '7 days'
              AND NOT EXISTS (
                SELECT 1 FROM policies p WHERE p.submission_id = s.submission_id
              )
          )
        )
      LIMIT 1
    `,
    [email, segments, engagedAt, PRICE_EVENTS],
  );
  return byApplication.rows.length > 0;
}

async function claim(pool, { email, segment, sessionId }) {
  const existing = await pool.query(
    `SELECT id, sent_at, created_at FROM cq_open_notes WHERE email = $1`,
    [email],
  );
  const row = existing.rows[0];
  if (row?.sent_at) return null;
  if (row && Date.now() - new Date(row.created_at).getTime() < CLAIM_STALE_MS) return null;
  if (row) return row.id;

  const inserted = await pool.query(
    `
      INSERT INTO cq_open_notes (email, segment, session_id)
      VALUES ($1, $2, $3)
      ON CONFLICT (email) DO NOTHING
      RETURNING id
    `,
    [email, segment, sessionId],
  );
  return inserted.rows[0]?.id || null;
}

export async function runOpenQuoteNote(opts = {}) {
  const pool = opts.pool || getPool();
  const now = opts.now instanceof Date ? opts.now : new Date();
  const sendMail = opts.sendMail || sendWithGmail;
  if (!pool) return { scanned: 0, sent: 0, skipped: 0 };

  await ensureTable(pool);
  const segments = [...CONNECTQUOTE_MARKETING_READY];
  const { rows } = await pool.query(
    `
      SELECT DISTINCT ON (lower(e.meta->>'email'))
        e.session_id,
        e.segment,
        e.ch,
        e.cid,
        e.st,
        lower(e.meta->>'email') AS email,
        e.created_at
      FROM cq_events e
      WHERE e.event = 'engaged'
        AND e.suspect_bot = false
        AND e.created_at <= NOW() - INTERVAL '1 hour'
        AND e.created_at > NOW() - INTERVAL '24 hours'
        AND e.segment = ANY($1::text[])
        AND COALESCE(e.meta->>'email', '') <> ''
      ORDER BY lower(e.meta->>'email'), e.created_at ASC
      LIMIT 100
    `,
    [segments],
  );

  let sent = 0;
  let skipped = 0;
  for (const row of rows) {
    const email = normalizeVisitEmail(row.email);
    try {
      const hasQuote = email
        ? await personHasQuote(pool, {
            email,
            sessionId: row.session_id,
            engagedAt: row.created_at,
            segments,
          })
        : false;
      const decision = decideOpenQuoteNote({
        segment: row.segment,
        email,
        engagedAt: row.created_at,
        now,
        alreadySent: false,
        hasQuote,
      });
      if (!decision.send || !email) {
        skipped += 1;
        continue;
      }

      const prior = await pool.query(
        `SELECT sent_at FROM cq_open_notes WHERE email = $1 AND sent_at IS NOT NULL`,
        [email],
      );
      if (prior.rows.length) {
        skipped += 1;
        continue;
      }

      const claimId = await claim(pool, {
        email,
        segment: row.segment,
        sessionId: row.session_id,
      });
      if (!claimId) {
        skipped += 1;
        continue;
      }

      const returnUrl = openQuoteReturnUrl({
        segment: row.segment,
        email,
        ch: row.ch,
        cid: row.cid,
        seq: row.st,
      });
      const message = buildOpenQuoteNoteEmail({ returnUrl });
      await sendMail({
        to: email,
        subject: message.subject,
        html: message.html,
        text: message.text,
        segment: null,
        fromOverride: message.from.from,
        replyToOverride: message.from.replyTo,
        headers: { "X-CID-Origin": "connectquote-open-note" },
      });
      await pool.query(`UPDATE cq_open_notes SET sent_at = now() WHERE id = $1`, [claimId]);
      sent += 1;
      console.log(`[openQuoteNote] sent ${row.segment}`);
    } catch (err) {
      skipped += 1;
      await pool.query(
        `DELETE FROM cq_open_notes WHERE email = $1 AND sent_at IS NULL`,
        [email],
      ).catch(() => {});
      console.error(`[openQuoteNote] skip ${row.segment}:`, err?.message || err);
    }
  }

  return { scanned: rows.length, sent, skipped };
}

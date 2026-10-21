/**
 * Sends the ConnectQuote ready-to-bind note and loads the return page.
 * Reads saved quote sessions only. Does not call Coterie or GUARD.
 */

import { getPool } from "../db.js";
import { sendWithGmail } from "../email.js";
import { CONNECTQUOTE_MARKETING_READY } from "../config/connectQuoteLinks.js";
import {
  READY_TO_BIND_CODE_TTL_MS,
  buildBindCodeEmail,
  buildCoverageLines,
  codesMatch,
  createResumeToken,
  decideReadyToBind,
  describeStartDate,
  hashBindCode,
  isResumeToken,
  maskEmail,
  newBindCode,
  pickBusinessName,
  pickSubmissionEmail,
  prepareLeaveBehind,
  readyToBindReturnUrl,
  readyToBindSender,
  renderReadyToBindPdf,
  renderReturnPage,
  tradeLabel,
} from "./readyToBindLeaveBehind.js";

const CANDIDATE_EVENTS = [
  "coterie.bindable_quote",
  "coterie.session",
  "guard.session",
  "guard.quoted",
  "connectquote.ready_to_bind.sent",
];

const LOAD_EVENTS = [
  ...CANDIDATE_EVENTS,
  "coterie.policy.bound",
  "guard.policy.created",
  "connectquote.ready_to_bind.day1",
  "connectquote.ready_to_bind.day3",
  "connectquote.ready_to_bind.expiry",
  "connectquote.ready_to_bind.link",
  "connectquote.ready_to_bind.code",
  "connectquote.ready_to_bind.verified",
];

const ACTION_EVENT = {
  initial: "connectquote.ready_to_bind.sent",
  day1: "connectquote.ready_to_bind.day1",
  day3: "connectquote.ready_to_bind.day3",
  expiry: "connectquote.ready_to_bind.expiry",
};

function payloadOf(row) {
  const raw = row?.event_payload_json;
  if (!raw) return {};
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  return raw;
}

function latest(events, type) {
  let found = null;
  for (const event of events) {
    if (event.event_type === type) found = event;
  }
  return found;
}

function maxTime(values) {
  let max = null;
  for (const value of values) {
    if (!value) continue;
    const time = new Date(value).getTime();
    if (!Number.isFinite(time)) continue;
    if (max == null || time > max) max = time;
  }
  return max == null ? null : new Date(max);
}

function formOf(row) {
  const raw = row?.raw_submission_json;
  return raw && typeof raw === "object" ? raw : {};
}

function coverageBounds(events, policies) {
  let packageBound = events.some((event) => event.event_type === "coterie.policy.bound");
  let wcBound = events.some((event) => event.event_type === "guard.policy.created");
  for (const policy of policies) {
    const type = String(policy.policy_type || "");
    const carrier = String(policy.carrier_name || "");
    if (/wc|worker/i.test(type) || /guard/i.test(carrier)) wcBound = true;
    else packageBound = true;
  }
  return { packageBound, wcBound };
}

function priorFrom(events) {
  const first = (type) => events.find((event) => event.event_type === type)?.created_at || null;
  return {
    initialAt: first("connectquote.ready_to_bind.sent"),
    day1At: first("connectquote.ready_to_bind.day1"),
    day3At: first("connectquote.ready_to_bind.day3"),
    expiryAt: first("connectquote.ready_to_bind.expiry"),
  };
}

export function snapshotFromRecords(row, events, policies, now = new Date()) {
  const form = formOf(row);
  const { packageBound, wcBound } = coverageBounds(events, policies);
  const session = latest(events, "coterie.session");
  const quoted = latest(events, "coterie.bindable_quote");
  const sessionBody = payloadOf(session);
  const quotedBody = payloadOf(quoted);
  const quoteSummary = sessionBody.quoteSummary || quotedBody.quoteSummary || quotedBody;
  const coterie = session || quoted
    ? {
        offeredAt: maxTime([session?.created_at, quoted?.created_at]),
        premium: quoteSummary.premium,
        policyType: quoteSummary.policyType,
        isSuccess: quoteSummary.isSuccess,
        bound: packageBound,
        payload: quoteSummary,
        contactEmail: sessionBody.contactEmail || null,
      }
    : null;

  const guardEvent = latest(events, "guard.session");
  const guardBody = payloadOf(guardEvent);
  const guard = guardEvent
    ? {
        ...guardBody,
        offeredAt: guardEvent.created_at,
        bound: wcBound,
        payload: guardBody,
      }
    : null;

  const email = pickSubmissionEmail({
    sessionEmail: sessionBody.contactEmail,
    form,
    clientEmail: row.primary_email,
  });
  const businessName = pickBusinessName({
    businessName: row.business_name,
    form,
  });
  const businessClass = form.business_class || form.businessClass || null;
  const link = latest(events, "connectquote.ready_to_bind.link");
  const token = payloadOf(link).token || null;

  return {
    submissionId: row.submission_id,
    clientId: row.client_id || null,
    segment: row.segment,
    businessName,
    trade: tradeLabel(row.segment, businessClass),
    email,
    phone: row.primary_phone || form.contact_phone || form.phone || null,
    coterie,
    guard,
    now,
    prior: priorFrom(events),
    token,
    startDate: form.policy_start_date || form.policyStartDate || null,
    events,
  };
}

async function insertEvent(pool, { clientId, submissionId, type, label, payload }) {
  await pool.query(
    `
      INSERT INTO timeline_events (
        client_id, submission_id, event_type, event_label, event_payload_json, created_by
      )
      VALUES ($1, $2, $3, $4, $5::jsonb, 'system')
    `,
    [clientId, submissionId, type, label, JSON.stringify(payload || {})],
  );
}

async function loadGrouped(pool, rows) {
  const ids = rows.map((row) => row.submission_id);
  if (!ids.length) return new Map();
  const events = await pool.query(
    `
      SELECT submission_id, event_type, event_payload_json, created_at
      FROM timeline_events
      WHERE submission_id = ANY($1::uuid[])
        AND event_type = ANY($2::text[])
      ORDER BY created_at ASC
    `,
    [ids, LOAD_EVENTS],
  );
  const policies = await pool.query(
    `
      SELECT submission_id, policy_type, carrier_name
      FROM policies
      WHERE submission_id = ANY($1::uuid[])
    `,
    [ids],
  );
  const grouped = new Map();
  for (const row of rows) {
    grouped.set(row.submission_id, { events: [], policies: [] });
  }
  for (const event of events.rows) {
    grouped.get(event.submission_id)?.events.push(event);
  }
  for (const policy of policies.rows) {
    grouped.get(policy.submission_id)?.policies.push(policy);
  }
  return grouped;
}

export async function runReadyToBindLeaveBehind(opts = {}) {
  const pool = opts.pool || getPool();
  const now = opts.now instanceof Date ? opts.now : new Date();
  const sendMail = opts.sendMail || sendWithGmail;
  if (!pool) return { scanned: 0, sent: 0, skipped: 0 };

  const segments = [...CONNECTQUOTE_MARKETING_READY];
  const { rows } = await pool.query(
    `
      SELECT
        s.submission_id,
        s.submission_public_id,
        s.segment,
        s.raw_submission_json,
        s.client_id,
        b.business_name,
        c.primary_email,
        c.primary_phone
      FROM submissions s
      LEFT JOIN businesses b ON b.business_id = s.business_id
      LEFT JOIN clients c ON c.client_id = s.client_id
      WHERE s.segment::text = ANY($1::text[])
        AND s.status NOT IN ('closed_lost', 'rejected')
        AND EXISTS (
          SELECT 1
          FROM timeline_events te
          WHERE te.submission_id = s.submission_id
            AND te.event_type = ANY($2::text[])
            AND te.created_at > NOW() - INTERVAL '60 days'
        )
      ORDER BY s.submitted_at DESC
      LIMIT 200
    `,
    [segments, CANDIDATE_EVENTS],
  );

  const grouped = await loadGrouped(pool, rows);
  let sent = 0;
  let skipped = 0;

  for (const row of rows) {
    const bag = grouped.get(row.submission_id) || { events: [], policies: [] };
    try {
      const snap = snapshotFromRecords(row, bag.events, bag.policies, now);
      const gate = decideReadyToBind({
        segment: snap.segment,
        lines: buildCoverageLines(snap),
        email: snap.email,
        now,
        prior: snap.prior,
      });
      if (!gate.action) {
        skipped += 1;
        continue;
      }

      let token = snap.token;
      if (!token || !isResumeToken(token)) {
        token = createResumeToken();
        await insertEvent(pool, {
          clientId: snap.clientId,
          submissionId: snap.submissionId,
          type: "connectquote.ready_to_bind.link",
          label: "Ready to bind return link",
          payload: { token },
        });
      }

      const returnUrl = readyToBindReturnUrl(token);
      const prepared = prepareLeaveBehind({ ...snap, returnUrl });
      const email = prepared.email;
      if (!email) {
        skipped += 1;
        continue;
      }
      const pdf = await renderReadyToBindPdf({
        businessName: snap.businessName,
        trade: snap.trade,
        quoteDate: prepared.quoteDate,
        lines: prepared.decision.openLines,
        returnUrl,
        kind: prepared.decision.action,
      });
      const sender = readyToBindSender();
      await sendMail({
        to: snap.email,
        subject: email.subject,
        html: email.html,
        text: email.text,
        attachments: [{ filename: "Quote-summary.pdf", buffer: pdf }],
        segment: null,
        fromOverride: sender.from,
        replyToOverride: sender.replyTo,
        headers: { "X-CID-Origin": "connectquote-ready-to-bind" },
      });
      await insertEvent(pool, {
        clientId: snap.clientId,
        submissionId: snap.submissionId,
        type: ACTION_EVENT[prepared.decision.action],
        label: "Ready to bind note sent",
        payload: {
          action: prepared.decision.action,
          lines: prepared.decision.openLines.map((line) => ({
            coverageName: line.coverageName,
            premium: line.premium,
            validThrough: line.validThrough,
          })),
        },
      });
      sent += 1;
      console.log(
        `[readyToBind] ${prepared.decision.action} ${row.submission_public_id || row.submission_id}`,
      );
    } catch (err) {
      skipped += 1;
      console.error(
        `[readyToBind] skip ${row.submission_public_id || row.submission_id}:`,
        err?.message || err,
      );
    }
  }

  return { scanned: rows.length, sent, skipped };
}

async function loadTokenContext(pool, token) {
  if (!isResumeToken(token)) return null;
  const found = await pool.query(
    `
      SELECT submission_id
      FROM timeline_events
      WHERE event_type = 'connectquote.ready_to_bind.link'
        AND event_payload_json->>'token' = $1
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [token],
  );
  if (!found.rows.length) return null;
  const submissionId = found.rows[0].submission_id;
  const sub = await pool.query(
    `
      SELECT
        s.submission_id,
        s.submission_public_id,
        s.segment,
        s.raw_submission_json,
        s.client_id,
        b.business_name,
        c.primary_email,
        c.primary_phone
      FROM submissions s
      LEFT JOIN businesses b ON b.business_id = s.business_id
      LEFT JOIN clients c ON c.client_id = s.client_id
      WHERE s.submission_id = $1
      LIMIT 1
    `,
    [submissionId],
  );
  if (!sub.rows.length) return null;
  const grouped = await loadGrouped(pool, sub.rows);
  const bag = grouped.get(submissionId) || { events: [], policies: [] };
  return {
    row: sub.rows[0],
    snap: snapshotFromRecords(sub.rows[0], bag.events, bag.policies, new Date()),
  };
}

function proofIsLive(events, proof, now) {
  if (!proof || !isResumeToken(proof)) return false;
  const verified = latest(events, "connectquote.ready_to_bind.verified");
  if (!verified) return false;
  const body = payloadOf(verified);
  if (body.proof !== proof) return false;
  const expires = new Date(body.expiresAt).getTime();
  return Number.isFinite(expires) && expires > now.getTime();
}

function pageModel(ctx, { verified, codeSent, codeError }) {
  const snap = ctx.snap;
  const lines = buildCoverageLines(snap);
  const quoteDate =
    snap.coterie?.offeredAt || snap.guard?.offeredAt || new Date();
  const start = describeStartDate({
    startDate: snap.startDate,
    now: new Date(),
    priceUpdated: false,
  });
  return {
    html: renderReturnPage({
      businessName: snap.businessName,
      trade: snap.trade,
      quoteDate,
      lines,
      maskedEmail: maskEmail(snap.email),
      verified,
      codeSent,
      codeError,
      startDateNote: start.note,
      token: snap.token,
    }),
  };
}

export async function readReadyToBindPage(token, opts = {}) {
  const pool = opts.pool || getPool();
  if (!pool) return { status: 503, html: "Quote links are unavailable." };
  const ctx = await loadTokenContext(pool, token);
  if (!ctx) return { status: 404, html: "This quote link is not valid." };
  const verified = proofIsLive(ctx.snap.events, opts.proof, new Date());
  return { status: 200, ...pageModel(ctx, { verified, codeSent: false, codeError: null }) };
}

export async function sendReadyToBindCode(token, opts = {}) {
  const pool = opts.pool || getPool();
  const sendMail = opts.sendMail || sendWithGmail;
  if (!pool) return { status: 503, html: "Quote links are unavailable." };
  const ctx = await loadTokenContext(pool, token);
  if (!ctx) return { status: 404, html: "This quote link is not valid." };
  const snap = ctx.snap;
  const lines = buildCoverageLines(snap).filter((line) => line.status === "open");
  if (!lines.length) {
    return { status: 200, ...pageModel(ctx, { verified: false, codeSent: false, codeError: null }) };
  }
  if (!snap.email) {
    return {
      status: 200,
      ...pageModel(ctx, {
        verified: false,
        codeSent: false,
        codeError: "This quote has no email to send a code to.",
      }),
    };
  }

  const lastCode = latest(snap.events, "connectquote.ready_to_bind.code");
  if (lastCode) {
    const age = Date.now() - new Date(lastCode.created_at).getTime();
    if (age >= 0 && age < 60 * 1000) {
      return {
        status: 200,
        ...pageModel(ctx, {
          verified: false,
          codeSent: true,
          codeError: null,
        }),
      };
    }
  }

  const code = opts.code || newBindCode();
  const expiresAt = new Date(Date.now() + READY_TO_BIND_CODE_TTL_MS).toISOString();
  const mail = buildBindCodeEmail({ businessName: snap.businessName, code });
  const sender = readyToBindSender();
  await sendMail({
    to: snap.email,
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
    segment: null,
    fromOverride: sender.from,
    replyToOverride: sender.replyTo,
    headers: { "X-CID-Origin": "connectquote-ready-to-bind" },
  });
  await insertEvent(pool, {
    clientId: snap.clientId,
    submissionId: snap.submissionId,
    type: "connectquote.ready_to_bind.code",
    label: "Ready to bind code sent",
    payload: {
      codeHash: hashBindCode(token, code),
      expiresAt,
    },
  });
  return {
    status: 200,
    ...pageModel(ctx, { verified: false, codeSent: true, codeError: null }),
  };
}

export async function verifyReadyToBindCode(token, code, opts = {}) {
  const pool = opts.pool || getPool();
  if (!pool) return { status: 503, html: "Quote links are unavailable." };
  const ctx = await loadTokenContext(pool, token);
  if (!ctx) return { status: 404, html: "This quote link is not valid." };
  const lastCode = latest(ctx.snap.events, "connectquote.ready_to_bind.code");
  const body = payloadOf(lastCode);
  const expires = new Date(body.expiresAt || 0).getTime();
  const computed = hashBindCode(token, code);
  const fresh = Number.isFinite(expires) && expires > Date.now();
  if (!lastCode || !fresh || !codesMatch(body.codeHash, computed)) {
    return {
      status: 200,
      ...pageModel(ctx, {
        verified: false,
        codeSent: true,
        codeError: "That code doesn't match or it expired. Request a new one.",
      }),
    };
  }
  const proof = createResumeToken();
  const proofExpires = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  await insertEvent(pool, {
    clientId: ctx.snap.clientId,
    submissionId: ctx.snap.submissionId,
    type: "connectquote.ready_to_bind.verified",
    label: "Ready to bind code confirmed",
    payload: { proof, expiresAt: proofExpires },
  });
  return { status: 303, proof };
}

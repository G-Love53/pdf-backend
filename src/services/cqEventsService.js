import { getPool } from "../db.js";
import { CONNECTQUOTE_MARKETING_READY } from "../config/connectQuoteLinks.js";
import {
  parseSequenceStep,
  readChannelFromParams,
} from "../outreach/attributionParams.js";

const ALLOWED_SEGMENTS = new Set([
  ...CONNECTQUOTE_MARKETING_READY,
  "bar",
  "roofer",
]);

const ALLOWED_EVENTS = new Set([
  "page_view",
  "engaged",
  "step_complete",
  "disqualified",
  "quote_requested",
  "quote_returned",
  "quote_error",
  "bind_clicked",
  "exit",
]);

const SCANNER_UA_PATTERNS = [
  /proofpoint/i,
  /mimecast/i,
  /barracuda/i,
  /messagelabs/i,
  /fireeye/i,
  /urlscan/i,
  /headlesschrome/i,
  /phantomjs/i,
  /selenium/i,
  /puppeteer/i,
  /googlebot/i,
  /bingpreview/i,
  /facebookexternalhit/i,
  /slackbot/i,
  /curl\//i,
  /wget\//i,
  /python-requests/i,
  /go-http-client/i,
];

const sessionRate = new Map();
const RATE_WINDOW_MS = 60_000;
const RATE_MAX_PER_SESSION = 120;

function isScannerUserAgent(ua) {
  const s = String(ua || "");
  if (!s) return false;
  return SCANNER_UA_PATTERNS.some((re) => re.test(s));
}

function normalizeSegment(raw) {
  const s = String(raw || "").trim().toLowerCase();
  return ALLOWED_SEGMENTS.has(s) ? s : null;
}

function checkSessionRate(sessionId) {
  const key = String(sessionId || "");
  if (!key) return false;
  const now = Date.now();
  let entry = sessionRate.get(key);
  if (!entry || now - entry.start > RATE_WINDOW_MS) {
    entry = { start: now, count: 0 };
    sessionRate.set(key, entry);
  }
  entry.count += 1;
  if (sessionRate.size > 5000) {
    for (const [k, v] of sessionRate) {
      if (now - v.start > RATE_WINDOW_MS) sessionRate.delete(k);
    }
  }
  return entry.count <= RATE_MAX_PER_SESSION;
}

async function isRapidDuplicateCidView(pool, { cid, segment }) {
  if (!cid) return false;
  const { rows } = await pool.query(
    `SELECT 1 FROM cq_events
     WHERE cid = $1 AND segment = $2 AND event = 'page_view'
       AND created_at > now() - interval '2 seconds'
     LIMIT 1`,
    [cid, segment],
  );
  return rows.length > 0;
}

/** Mark page_view rows with no engaged event within 60s (background hygiene). */
export async function markStalePageViewsWithoutEngaged() {
  const pool = getPool();
  if (!pool) return { updated: 0 };

  const { rowCount } = await pool.query(
    `UPDATE cq_events pv
     SET suspect_bot = true
     WHERE pv.event = 'page_view'
       AND pv.suspect_bot = false
       AND pv.created_at < now() - interval '60 seconds'
       AND pv.created_at > now() - interval '7 days'
       AND NOT EXISTS (
         SELECT 1 FROM cq_events e
         WHERE e.session_id = pv.session_id AND e.event = 'engaged'
       )`,
  );
  return { updated: rowCount || 0 };
}

/**
 * @param {Record<string, unknown>} body
 * @param {{ userAgent?: string, referrer?: string }} headers
 */
export async function recordCqEvent(body, headers = {}) {
  const pool = getPool();
  if (!pool) {
    return { ok: false, status: 503, error: "DATABASE_UNAVAILABLE" };
  }

  const segment = normalizeSegment(body.segment);
  if (!segment) {
    return { ok: false, status: 400, error: "INVALID_SEGMENT" };
  }

  const event = String(body.event || "").trim();
  if (!ALLOWED_EVENTS.has(event)) {
    return { ok: false, status: 400, error: "INVALID_EVENT" };
  }

  const sessionId = String(body.session_id || "").trim();
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      sessionId,
    )
  ) {
    return { ok: false, status: 400, error: "INVALID_SESSION_ID" };
  }

  if (!checkSessionRate(sessionId)) {
    return { ok: false, status: 429, error: "RATE_LIMITED" };
  }

  const userAgent = String(body.user_agent || headers.userAgent || "").slice(0, 512);
  const referrer = String(body.referrer || headers.referrer || "").slice(0, 1024);
  const cid = body.cid != null ? String(body.cid).slice(0, 128) : null;
  const ch = body.ch != null ? String(body.ch).slice(0, 128) : null;
  const src = body.src != null ? String(body.src).slice(0, 128) : null;
  const state = body.state != null ? String(body.state).slice(0, 8) : null;
  const step = body.step != null ? String(body.step).slice(0, 64) : null;
  const st = parseSequenceStep(body.st);
  const isMobile = body.is_mobile === true || body.is_mobile === "true";

  let meta = body.meta;
  if (meta != null && typeof meta !== "object") {
    meta = null;
  }
  if (body.submission_public_id && meta && !meta.submission_public_id) {
    meta = { ...meta, submission_public_id: String(body.submission_public_id).slice(0, 64) };
  } else if (body.submission_public_id && !meta) {
    meta = { submission_public_id: String(body.submission_public_id).slice(0, 64) };
  }

  let suspectBot = isScannerUserAgent(userAgent);
  if (event === "page_view" && cid && !suspectBot) {
    suspectBot = await isRapidDuplicateCidView(pool, { cid, segment });
  }

  await pool.query(
    `INSERT INTO cq_events (
      session_id, cid, src, ch, st, segment, state, event, step, meta,
      user_agent, referrer, is_mobile, suspect_bot
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
    [
      sessionId,
      cid,
      src,
      ch,
      st,
      segment,
      state,
      event,
      step,
      meta ? JSON.stringify(meta) : null,
      userAgent || null,
      referrer || null,
      isMobile,
      suspectBot,
    ],
  );

  return { ok: true, status: 204, suspect_bot: suspectBot };
}

/** Parse attribution from URL-style body fields (server-side helpers for tests). */
export function attributionFromQuery(params) {
  const p =
    params instanceof URLSearchParams
      ? params
      : new URLSearchParams(params || {});
  return {
    ch: p.get("ch") || readChannelFromParams(p) || null,
    src: p.get("src") || readChannelFromParams(p) || null,
    cid: p.get("cid") || null,
    st: parseSequenceStep(p.get("seq")),
  };
}

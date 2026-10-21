/**
 * ConnectQuote “ready to bind” leave-behind.
 * One email and one return link per submission. Each bindable coverage is a line.
 * Bar and roofer are long-form and are skipped. Carrier names stay off the customer copy.
 * This module does not call a carrier and does not send mail.
 */

import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { PDFDocument, PDFString, StandardFonts, rgb } from "pdf-lib";
import { CONNECTQUOTE_MARKETING_READY } from "../config/connectQuoteLinks.js";
import { isGuardInstantBindable } from "./guardService.js";
import { resolveRegistryEntry } from "../config/coterieRegistry.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const READY_TO_BIND_HOUR_MS = 60 * 60 * 1000;
export const READY_TO_BIND_DAY_MS = 24 * READY_TO_BIND_HOUR_MS;
/** Initial note only. Stops a first deploy from mailing every old open quote. */
export const READY_TO_BIND_MAX_INITIAL_AGE_MS = 7 * READY_TO_BIND_DAY_MS;
export const READY_TO_BIND_EXPIRY_LEAD_MS = 3 * READY_TO_BIND_DAY_MS;
export const READY_TO_BIND_CODE_TTL_MS = 15 * 60 * 1000;

export const LOGO_PATH = path.join(
  __dirname,
  "../assets/brand/cid-logo-full-color.png",
);

const NAVY = rgb(11 / 255, 58 / 255, 91 / 255);
const ORANGE = rgb(245 / 255, 130 / 255, 32 / 255);
const INK = rgb(0.12, 0.14, 0.16);
const MUTED = rgb(0.33, 0.36, 0.4);

const COVERAGE_BOP = "Business Owners Policy";
const COVERAGE_GL = "General Liability";
const COVERAGE_WC = "Workers' Compensation";

/** Quote-validity keys only. Policy term dates are not a valid-through. */
const VALID_THROUGH_KEYS = [
  "validThrough",
  "valid_through",
  "quoteValidThrough",
  "quoteExpirationDate",
  "quoteExpiresAt",
  "quoteExpires",
  "proposalExpirationDate",
  "proposalValidUntil",
];

const SUPPORT_EMAIL = "support@commercialinsurance-direct.com";

export function readyToBindSender() {
  const email = String(
    process.env.READY_TO_BIND_FROM_EMAIL ||
      process.env.CID_SUPPORT_EMAIL ||
      SUPPORT_EMAIL,
  ).trim();
  return {
    email,
    from: `Commercial Insurance Direct <${email}>`,
    replyTo: email,
  };
}

export function isLeaveBehindSegment(segment) {
  const key = String(segment || "")
    .trim()
    .toLowerCase();
  if (!key || key === "bar" || key === "roofer" || key === "roofing") return false;
  return CONNECTQUOTE_MARKETING_READY.has(key);
}

export function createResumeToken() {
  return crypto.randomBytes(32).toString("base64url");
}

export function isResumeToken(token) {
  return /^[A-Za-z0-9_-]{32,128}$/.test(String(token || ""));
}

export function readyToBindReturnUrl(token) {
  const base = String(
    process.env.PUBLIC_API_BASE_URL ||
      process.env.CID_API_BASE_URL ||
      "https://cid-pdf-api.onrender.com",
  ).replace(/\/$/, "");
  return `${base}/q/${encodeURIComponent(String(token || ""))}`;
}

export function hashBindCode(token, code) {
  return crypto
    .createHash("sha256")
    .update(`${token}:${String(code || "").trim()}`)
    .digest("hex");
}

export function newBindCode() {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
}

export function codesMatch(storedHex, computedHex) {
  const a = Buffer.from(String(storedHex || ""), "hex");
  const b = Buffer.from(String(computedHex || ""), "hex");
  if (a.length === 0 || a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function asDate(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** ISO date (YYYY-MM-DD) or US date. Does not invent a date from a timestamp alone. */
export function parseDateOnly(value) {
  if (value == null || value === "") return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return value.toISOString().slice(0, 10);
  }
  const s = String(value).trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const us = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (us) {
    return `${us[3]}-${us[1].padStart(2, "0")}-${us[2].padStart(2, "0")}`;
  }
  return null;
}

export function formatLongDate(isoDate) {
  const iso = parseDateOnly(isoDate);
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  return dt.toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function formatPremium(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return null;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(n);
}

export function maskEmail(email) {
  const raw = String(email || "").trim();
  const at = raw.indexOf("@");
  if (at <= 0) return "the email on your quote";
  return `${raw.slice(0, 1)}***${raw.slice(at)}`;
}

function pickValidThroughFromObject(obj) {
  if (!obj || typeof obj !== "object") return null;
  for (const key of VALID_THROUGH_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(obj, key)) continue;
    const iso = parseDateOnly(obj[key]);
    if (iso) return iso;
  }
  return null;
}

/**
 * A date counts only when the carrier payload has a quote-validity field.
 * effectiveDate, decisionDate, and policy expiration are not used.
 */
export function pickValidThrough(payload) {
  if (!payload || typeof payload !== "object") return null;
  const nests = [
    payload,
    payload.quoteSummary,
    payload.raw,
    payload.raw?.quote,
    payload.raw?.quote?.quotes?.[0],
    payload.quote,
    payload.quote?.quotes?.[0],
  ];
  for (const obj of nests) {
    const found = pickValidThroughFromObject(obj);
    if (found) return found;
  }
  return null;
}

function resolveValidThrough(source) {
  if (!source || typeof source !== "object") return null;
  if (Object.prototype.hasOwnProperty.call(source, "validThrough")) {
    return parseDateOnly(source.validThrough);
  }
  return pickValidThrough(source.payload || source.quoteSummary || null);
}

function packageCoverageName(policyType) {
  const t = String(policyType || "")
    .trim()
    .toUpperCase();
  if (t === "GL" || t.includes("GENERAL")) return COVERAGE_GL;
  if (t === "WC" || t.includes("WORKER")) return COVERAGE_WC;
  return COVERAGE_BOP;
}

function guardPurpose(guard) {
  return String(guard?.purpose || "")
    .trim()
    .toUpperCase();
}

function guardIsIndication(guard) {
  if (!guard) return false;
  if (guard.indication === true) return true;
  return guardPurpose(guard) === "NBQ";
}

/**
 * Full WC quote only. An indication is not a line, even with a premium.
 * A bound WC policy is a line marked bound (GUARD bills that bind itself).
 */
export function guardQuoteIsOpenBindable(guard) {
  if (!guard || typeof guard !== "object") return false;
  if (guard.bound === true) return false;
  if (guardIsIndication(guard)) return false;
  const purpose = guardPurpose(guard);
  if (purpose && purpose !== "NBS") return false;
  if (!purpose && guard.bindable !== true) return false;
  return isGuardInstantBindable({
    policyStatusCd: guard.policyStatusCd,
    uwDecision: guard.uwDecision,
  });
}

function coterieIsQuoted(coterie) {
  if (!coterie || typeof coterie !== "object") return false;
  if (coterie.isSuccess === false) return false;
  const premium = coterie.premium ?? coterie.quoteSummary?.premium;
  return premium != null && premium !== "" && Number.isFinite(Number(premium));
}

function lineFrom(partial) {
  const offeredAt = asDate(partial.offeredAt);
  const premium = Number(partial.premium);
  return {
    key: partial.key,
    coverageName: partial.coverageName,
    premium: Number.isFinite(premium) ? premium : null,
    premiumLabel: formatPremium(premium),
    validThrough: partial.validThrough || null,
    status: partial.status === "bound" ? "bound" : "open",
    offeredAt,
  };
}

export function buildCoverageLines(input = {}) {
  const lines = [];
  const coterie = input.coterie;
  if (coterieIsQuoted(coterie)) {
    const premium = coterie.premium ?? coterie.quoteSummary?.premium;
    const policyType =
      coterie.policyType || coterie.quoteSummary?.policyType || "BOP";
    lines.push(
      lineFrom({
        key: "package",
        coverageName: packageCoverageName(policyType),
        premium,
        validThrough: resolveValidThrough(coterie),
        status: coterie.bound ? "bound" : "open",
        offeredAt: coterie.offeredAt,
      }),
    );
  }

  const guard = input.guard;
  const guardOpen = guardQuoteIsOpenBindable(guard);
  const guardBound = guard?.bound === true && !guardIsIndication(guard);
  if (guard && (guardOpen || guardBound || (guard.bound === true && !guardIsIndication(guard)))) {
    const premium = guard.premium;
    if (guardOpen || guard.bound === true) {
      lines.push(
        lineFrom({
          key: "wc",
          coverageName: COVERAGE_WC,
          premium,
          validThrough: resolveValidThrough(guard),
          status: guard.bound ? "bound" : "open",
          offeredAt: guard.offeredAt,
        }),
      );
    }
  }

  return lines;
}

function maxDate(values) {
  let max = null;
  for (const value of values) {
    const d = asDate(value);
    if (!d) continue;
    if (!max || d.getTime() > max.getTime()) max = d;
  }
  return max;
}

function earliestIso(lines) {
  let best = null;
  for (const line of lines) {
    if (!line.validThrough) continue;
    if (!best || line.validThrough < best) best = line.validThrough;
  }
  return best;
}

/**
 * @returns {{ action: null|"initial"|"day1"|"day3"|"expiry", reason?: string, openLines: object[] }}
 */
export function decideReadyToBind({
  segment,
  lines = [],
  email,
  now,
  prior = {},
}) {
  const openLines = lines.filter((line) => line.status === "open" && line.premiumLabel);
  if (!isLeaveBehindSegment(segment)) {
    return { action: null, reason: "segment", openLines: [] };
  }
  if (!String(email || "").includes("@")) {
    return { action: null, reason: "no_email", openLines };
  }
  if (!openLines.length) {
    return { action: null, reason: "nothing_open", openLines: [] };
  }

  const nowMs = asDate(now)?.getTime() ?? Date.now();
  const initialAt = asDate(prior.initialAt);
  const day1At = asDate(prior.day1At);
  const day3At = asDate(prior.day3At);
  const expiryAt = asDate(prior.expiryAt);

  if (!initialAt) {
    const lastAt = maxDate(lines.map((line) => line.offeredAt));
    if (!lastAt) return { action: null, reason: "no_clock", openLines };
    const age = nowMs - lastAt.getTime();
    if (age < READY_TO_BIND_HOUR_MS) {
      return { action: null, reason: "within_hour", openLines };
    }
    if (age > READY_TO_BIND_MAX_INITIAL_AGE_MS) {
      return { action: null, reason: "too_old", openLines };
    }
    return { action: "initial", openLines };
  }

  const sinceInitial = nowMs - initialAt.getTime();
  if (!day1At && sinceInitial >= READY_TO_BIND_DAY_MS && sinceInitial < 3 * READY_TO_BIND_DAY_MS) {
    return { action: "day1", openLines };
  }
  if (!day3At && sinceInitial >= 3 * READY_TO_BIND_DAY_MS) {
    return { action: "day3", openLines };
  }

  const soonest = earliestIso(openLines);
  if (soonest && !expiryAt && sinceInitial >= 12 * READY_TO_BIND_HOUR_MS) {
    const expiryMs = Date.parse(`${soonest}T00:00:00Z`);
    if (
      Number.isFinite(expiryMs) &&
      nowMs >= expiryMs - READY_TO_BIND_EXPIRY_LEAD_MS &&
      nowMs < expiryMs
    ) {
      return { action: "expiry", openLines };
    }
  }

  return { action: null, reason: "waiting", openLines };
}

export function formatCoverageLine(line) {
  const price = line.premiumLabel || formatPremium(line.premium) || "";
  const base = `${line.coverageName} — ${price}`;
  if (!line.validThrough) return base;
  const pretty = formatLongDate(line.validThrough);
  if (!pretty) return base;
  return `${base} · valid through ${pretty}`;
}

function footerLines(quoteDate) {
  const shown = formatLongDate(quoteDate) || formatLongDate(new Date());
  return [
    `Quote summary, not a binder. Coverage is not in force until bound and paid. Pricing shown as of ${shown}.`,
    "Insurance offered through All Access Insurance LLC dba CID Insurance Services · CO License #6784587. Commercial Insurance Direct, Inc. is a technology platform and is not an insurer. Coverage is subject to underwriting approval, policy terms, conditions, and exclusions.",
    "Commercial Insurance Direct · 9200 West Cross Drive #515, Littleton, CO 80123",
  ];
}

function expirySentence(lines) {
  const dated = (lines || []).filter((line) => line.validThrough);
  if (!dated.length) return null;
  if (dated.length === 1) {
    return `A reminder: ${dated[0].coverageName} is valid through ${formatLongDate(dated[0].validThrough)}.`;
  }
  return `A reminder: these prices are valid through ${formatLongDate(earliestIso(dated))}.`;
}

function safeHttpUrl(url) {
  try {
    const parsed = new URL(String(url || ""));
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

export function buildReadyToBindEmail({
  businessName,
  quoteDate,
  lines,
  returnUrl,
  kind = "initial",
}) {
  const name = String(businessName || "your business").trim() || "your business";
  const url = safeHttpUrl(returnUrl);
  const subject = `Your quote for ${name} — one step left`;
  const openLines = (lines || []).filter((line) => line.status !== "bound");
  const lineText = openLines.map(formatCoverageLine);
  const reminder = kind === "expiry" ? expirySentence(openLines) : null;
  const foot = footerLines(quoteDate);

  const textParts = [
    `The quote for ${name} is ready to bind.`,
    "",
    ...lineText,
    "",
  ];
  if (reminder) textParts.push(reminder, "");
  if (url) {
    textParts.push(`FINISH AND BIND → ${url}`, "");
  }
  textParts.push(
    "The link picks up right where you left off, on any device. Your pricing is re-checked when you return, and coverage isn't in force until you bind.",
    "",
    "Questions on the pricing or the coverage? Reply to this email and we'll help.",
    "",
    "Forward this email if someone else signs off.",
    "",
    "— Commercial Insurance Direct",
    "",
    ...foot,
  );

  const lineHtml = lineText
    .map(
      (line) =>
        `<p style="margin:0 0 8px 0;font-size:16px;line-height:1.45;color:#1f2933;">${escapeHtml(line)}</p>`,
    )
    .join("");
  const button = url
    ? `<p style="margin:22px 0;"><a href="${escapeHtml(url)}" style="display:inline-block;background:#f58220;color:#ffffff;text-decoration:none;font-weight:700;letter-spacing:0.04em;padding:12px 18px;border-radius:4px;">FINISH AND BIND</a></p>`
    : "";
  const reminderHtml = reminder
    ? `<p style="margin:0 0 14px 0;font-size:16px;line-height:1.5;color:#1f2933;">${escapeHtml(reminder)}</p>`
    : "";
  const footHtml = foot
    .map(
      (line) =>
        `<p style="margin:0 0 8px 0;font-size:12px;line-height:1.45;color:#667085;">${escapeHtml(line)}</p>`,
    )
    .join("");

  const html = `<!DOCTYPE html>
<html>
<body style="margin:0;padding:24px;background:#f4f7fb;font-family:Arial,Helvetica,sans-serif;color:#1f2933;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;padding:28px 28px 20px 28px;">
    <p style="margin:0 0 16px 0;font-size:18px;line-height:1.45;color:#0b3a5b;">The quote for ${escapeHtml(name)} is ready to bind.</p>
    ${lineHtml}
    ${reminderHtml}
    ${button}
    <p style="margin:0 0 14px 0;font-size:15px;line-height:1.5;">The link picks up right where you left off, on any device. Your pricing is re-checked when you return, and coverage isn't in force until you bind.</p>
    <p style="margin:0 0 14px 0;font-size:15px;line-height:1.5;">Questions on the pricing or the coverage? Reply to this email and we'll help.</p>
    <p style="margin:0 0 14px 0;font-size:15px;line-height:1.5;">Forward this email if someone else signs off.</p>
    <p style="margin:18px 0 0 0;font-size:15px;line-height:1.4;">— Commercial Insurance Direct</p>
  </div>
  <div style="max-width:560px;margin:12px auto 0 auto;padding:0 8px 12px 8px;">
    ${footHtml}
  </div>
</body>
</html>`;

  return { subject, html, text: textParts.join("\n") };
}

export function buildBindCodeEmail({ businessName, code }) {
  const name = String(businessName || "your business").trim() || "your business";
  const digits = String(code || "").trim();
  const subject = `Your code to bind the quote for ${name}`;
  const text = [
    `Your code is ${digits}.`,
    "",
    "It expires in 15 minutes. Enter it on the quote page to finish binding.",
    "This code is not in the quote summary.",
    "",
    "— Gerry",
    "Commercial Insurance Direct",
  ].join("\n");
  const html = `<!DOCTYPE html>
<html>
<body style="font-family:Arial,Helvetica,sans-serif;color:#1f2933;">
  <p>Your code is <strong>${escapeHtml(digits)}</strong>.</p>
  <p>It expires in 15 minutes. Enter it on the quote page to finish binding.</p>
  <p>This code is not in the quote summary.</p>
  <p>— Gerry<br>Commercial Insurance Direct</p>
</body>
</html>`;
  return { subject, html, text };
}

/**
 * Start-date copy. priceUpdated is true only when a real refresh returned a new price.
 * Nothing in this service calls a carrier to refresh.
 */
export function describeStartDate({ startDate, now = new Date(), priceUpdated = false }) {
  const iso = parseDateOnly(startDate);
  if (!iso) return { startDatePassed: false, priceUpdated: false, note: null };
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Denver",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(asDate(now) || new Date());
  if (iso >= today) return { startDatePassed: false, priceUpdated: false, note: null };
  if (priceUpdated) {
    return {
      startDatePassed: true,
      priceUpdated: true,
      note: "The start date on this quote has passed, and the price was updated.",
    };
  }
  return {
    startDatePassed: true,
    priceUpdated: false,
    note: "The start date on this quote has passed.",
  };
}

export function renderReturnPage({
  businessName,
  trade,
  quoteDate,
  lines = [],
  maskedEmail,
  verified = false,
  codeSent = false,
  codeError = null,
  startDateNote = null,
  token,
}) {
  const name = String(businessName || "your business").trim() || "your business";
  const foot = footerLines(quoteDate);
  const rows = lines
    .map((line) => {
      const state = line.status === "bound" ? "Bound" : "Open";
      const detail =
        line.status === "bound" ? line.coverageName : formatCoverageLine(line);
      return `<li style="margin:0 0 10px 0;font-size:16px;line-height:1.45;"><span style="color:#0b3a5b;font-weight:700;">${escapeHtml(state)}</span> — ${escapeHtml(detail)}</li>`;
    })
    .join("");
  const open = lines.filter((line) => line.status === "open");
  const action = token && open.length
    ? verified
      ? `<p style="margin:16px 0;padding:12px 14px;background:#eef6ea;border-radius:4px;">Code confirmed. Finish the open coverage below. Coverage is not in force until you bind and pay.</p>`
      : `<form method="post" action="/q/${escapeHtml(token)}/code" style="margin:18px 0 8px 0;">
          <button type="submit" style="background:#f58220;color:#fff;border:0;font-weight:700;letter-spacing:0.04em;padding:12px 18px;border-radius:4px;cursor:pointer;">FINISH AND BIND</button>
        </form>
        <p style="margin:0 0 12px 0;font-size:14px;color:#3d4a57;">We'll send a short code to ${escapeHtml(maskedEmail || "the email on your quote")}. The code is not in the quote summary.</p>
        ${codeSent ? `<p style="margin:0 0 8px 0;">Code sent. Enter it here.</p>` : ""}
        ${codeError ? `<p style="margin:0 0 8px 0;color:#8a2b2b;">${escapeHtml(codeError)}</p>` : ""}
        <form method="post" action="/q/${escapeHtml(token)}/verify">
          <input name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" style="font-size:18px;padding:8px 10px;width:8em;" />
          <button type="submit" style="margin-left:8px;padding:8px 12px;">Confirm code</button>
        </form>`
    : open.length
      ? ""
      : `<p style="margin:16px 0;">Nothing on this quote is still open to bind.</p>`;
  const tradeHtml = trade
    ? `<p style="margin:4px 0 0 0;color:#526070;">${escapeHtml(trade)}</p>`
    : "";
  const dateHtml = quoteDate
    ? `<p style="margin:8px 0 0 0;color:#526070;">Quote date ${escapeHtml(formatLongDate(quoteDate))}</p>`
    : "";
  const startHtml = startDateNote
    ? `<p style="margin:14px 0 0 0;">${escapeHtml(startDateNote)}</p>`
    : "";

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex" />
  <title>Quote ready to bind</title>
</head>
<body style="margin:0;padding:24px;background:#f4f7fb;font-family:Arial,Helvetica,sans-serif;color:#1f2933;">
  <div style="max-width:640px;margin:0 auto;background:#fff;padding:28px;">
    <img src="/q-assets/cid-logo.png" alt="Commercial Insurance Direct" style="width:240px;height:auto;" />
    <h1 style="margin:18px 0 0 0;font-size:26px;color:#0b3a5b;font-weight:700;">${escapeHtml(name)}</h1>
    ${tradeHtml}
    ${dateHtml}
    <p style="margin:18px 0 10px 0;font-size:17px;">The quote for ${escapeHtml(name)} is ready to bind.</p>
    <ul style="padding-left:18px;margin:0 0 8px 0;">${rows}</ul>
    ${startHtml}
    <p style="margin:14px 0 0 0;font-size:15px;line-height:1.5;">The link picks up right where you left off, on any device. Your pricing is re-checked when you return, and coverage isn't in force until you bind.</p>
    ${action}
  </div>
  <div style="max-width:640px;margin:14px auto 0 auto;font-size:12px;line-height:1.45;color:#667085;">
    ${foot.map((line) => `<p style="margin:0 0 8px 0;">${escapeHtml(line)}</p>`).join("")}
  </div>
</body>
</html>`;
}

function wrapLines(font, text, size, maxWidth) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  const lines = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= maxWidth) {
      current = next;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

function addLink(page, url, x, y, w, h) {
  const doc = page.doc;
  const annot = doc.context.register(
    doc.context.obj({
      Type: "Annot",
      Subtype: "Link",
      Rect: [x, y, x + w, y + h],
      Border: [0, 0, 0],
      A: {
        Type: "Action",
        S: "URI",
        URI: PDFString.of(url),
      },
    }),
  );
  page.node.addAnnot(annot);
}

export async function renderReadyToBindPdf({
  businessName,
  trade,
  quoteDate,
  lines,
  returnUrl,
  kind = "initial",
}) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const logoBytes = fs.readFileSync(LOGO_PATH);
  const logo = await doc.embedPng(logoBytes);

  const pageWidth = 612;
  const pageHeight = 792;
  const margin = 48;
  const maxWidth = pageWidth - margin * 2;
  const bottom = 46;
  let page = doc.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;

  const newPage = () => {
    page = doc.addPage([pageWidth, pageHeight]);
    y = pageHeight - margin;
  };
  const need = (height) => {
    if (y - height < bottom) newPage();
  };

  const logoW = 230;
  const logoH = (logo.height / logo.width) * logoW;
  need(logoH + 8);
  page.drawImage(logo, { x: margin, y: y - logoH, width: logoW, height: logoH });
  y -= logoH + 18;

  const name = String(businessName || "your business").trim() || "your business";
  const drawWrapped = (text, size, face, color, gapAfter) => {
    const parts = wrapLines(face, text, size, maxWidth);
    need(parts.length * (size + 3) + gapAfter);
    for (const part of parts) {
      page.drawText(part, { x: margin, y: y - size, size, font: face, color });
      y -= size + 3;
    }
    y -= gapAfter;
  };

  drawWrapped(name, 20, fontBold, NAVY, 2);
  if (trade) drawWrapped(String(trade), 11, font, MUTED, 2);
  if (quoteDate) {
    drawWrapped(`Quote date ${formatLongDate(quoteDate)}`, 11, font, MUTED, 8);
  }
  drawWrapped(`The quote for ${name} is ready to bind.`, 13, font, INK, 8);

  const openLines = (lines || []).filter((line) => line.status !== "bound");
  for (const line of openLines) {
    drawWrapped(formatCoverageLine(line), 13, fontBold, NAVY, 4);
  }

  if (kind === "expiry") {
    const reminder = expirySentence(openLines);
    if (reminder) drawWrapped(reminder, 11, font, INK, 6);
  }

  const url = safeHttpUrl(returnUrl);
  if (url) {
    const label = "FINISH AND BIND";
    const labelSize = 12;
    const labelW = fontBold.widthOfTextAtSize(label, labelSize);
    const buttonW = labelW + 28;
    const buttonH = 28;
    need(buttonH + 16);
    y -= 8;
    page.drawRectangle({
      x: margin,
      y: y - buttonH,
      width: buttonW,
      height: buttonH,
      color: ORANGE,
    });
    page.drawText(label, {
      x: margin + 14,
      y: y - 19,
      size: labelSize,
      font: fontBold,
      color: rgb(1, 1, 1),
    });
    addLink(page, url, margin, y - buttonH, buttonW, buttonH);
    y -= buttonH + 12;
    const urlSize = 9;
    const urlLines = wrapLines(font, url, urlSize, maxWidth);
    need(urlLines.length * 12 + 8);
    for (const part of urlLines) {
      const w = font.widthOfTextAtSize(part, urlSize);
      page.drawText(part, {
        x: margin,
        y: y - urlSize,
        size: urlSize,
        font,
        color: NAVY,
      });
      addLink(page, url, margin, y - urlSize - 2, Math.max(w, 8), urlSize + 4);
      y -= urlSize + 3;
    }
    y -= 8;
  }

  drawWrapped(
    "The link picks up right where you left off, on any device. Your pricing is re-checked when you return, and coverage isn't in force until you bind.",
    10,
    font,
    INK,
    6,
  );
  drawWrapped(
    "Questions on the pricing or the coverage? Reply to this email and we'll help.",
    10,
    font,
    INK,
    6,
  );
  drawWrapped(
    "Send this page along if someone else signs off.",
    10,
    font,
    INK,
    8,
  );
  drawWrapped("— Commercial Insurance Direct", 11, fontBold, NAVY, 10);

  for (const line of footerLines(quoteDate)) {
    drawWrapped(line, 8, font, MUTED, 3);
  }

  return Buffer.from(await doc.save());
}

export function prepareLeaveBehind(input = {}) {
  const lines = buildCoverageLines(input);
  const decision = decideReadyToBind({
    segment: input.segment,
    lines,
    email: input.email,
    now: input.now,
    prior: input.prior || {},
  });
  const quoteDate =
    input.quoteDate ||
    maxDate((decision.openLines.length ? decision.openLines : lines).map((line) => line.offeredAt));
  const email =
    decision.action && input.returnUrl
      ? buildReadyToBindEmail({
          businessName: input.businessName,
          quoteDate,
          lines: decision.openLines,
          returnUrl: input.returnUrl,
          kind: decision.action,
        })
      : null;
  return { lines, decision, email, quoteDate };
}

export function tradeLabel(segment, businessClass) {
  const entry = resolveRegistryEntry(segment, businessClass);
  return entry?.label || null;
}

export function pickSubmissionEmail({ sessionEmail, form = {}, clientEmail }) {
  const candidates = [
    sessionEmail,
    form.contact_email,
    form.email,
    form.applicant_email,
    clientEmail,
  ];
  for (const value of candidates) {
    const email = String(value || "").trim();
    if (email.includes("@")) return email;
  }
  return null;
}

export function pickBusinessName({ businessName, form = {} }) {
  const candidates = [
    businessName,
    form.business_name,
    form.insured_name,
    form.legalBusinessName,
    form.premises_name,
  ];
  for (const value of candidates) {
    const name = String(value || "").trim();
    if (name) return name;
  }
  return "your business";
}

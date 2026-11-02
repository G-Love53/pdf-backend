/**
 * One note when someone opens a ConnectQuote page and leaves before a price.
 * A bindable price belongs to the ready-to-bind note. This module does not send mail.
 */

import { buildConnectQuoteUrl } from "../config/connectQuoteLinks.js";
import { SEGMENT_BRANDING } from "../config/segmentBranding.js";
import { normalizeDisplayName } from "../../marketing/normalizeDisplayName.js";
import { validateOutreachEmail } from "../outreach/outreachEmailValidation.js";
import { isLeaveBehindSegment, readyToBindSender } from "./readyToBindLeaveBehind.js";

export const OPEN_NOTE_MIN_MS = 60 * 60 * 1000;
export const OPEN_NOTE_MAX_MS = 24 * 60 * 60 * 1000;

const LICENSE =
  "Insurance offered through All Access Insurance LLC dba CID Insurance Services · CO License #6784587. Commercial Insurance Direct, Inc. is a technology platform and is not an insurer. Coverage is subject to underwriting approval, policy terms, conditions, and exclusions.";
const ADDRESS =
  "Commercial Insurance Direct · 9200 West Cross Drive #515, Littleton, CO 80123";

export function normalizeVisitEmail(raw) {
  const check = validateOutreachEmail(raw);
  if (!check.ok) return null;
  return String(raw).trim().toLowerCase().slice(0, 254);
}

export function normalizeVisitName(raw) {
  const cleaned = normalizeDisplayName(raw);
  return cleaned ? cleaned.slice(0, 45) : null;
}

export function segmentBrandName(segment) {
  const brand = SEGMENT_BRANDING[String(segment || "").toLowerCase()];
  const name = String(brand?.segmentBrandName || "").trim();
  return name || null;
}

/**
 * @returns {{ send: boolean, reason?: string }}
 */
export function decideOpenQuoteNote({
  segment,
  email,
  engagedAt,
  now = new Date(),
  alreadySent = false,
  hasQuote = false,
}) {
  if (!isLeaveBehindSegment(segment)) return { send: false, reason: "segment" };
  if (!normalizeVisitEmail(email)) return { send: false, reason: "email" };
  if (alreadySent) return { send: false, reason: "already_sent" };
  if (hasQuote) return { send: false, reason: "has_quote" };

  const start = engagedAt instanceof Date ? engagedAt.getTime() : Date.parse(engagedAt);
  const nowMs = now instanceof Date ? now.getTime() : Date.parse(now);
  if (!Number.isFinite(start) || !Number.isFinite(nowMs)) {
    return { send: false, reason: "clock" };
  }
  const age = nowMs - start;
  if (age < OPEN_NOTE_MIN_MS) return { send: false, reason: "within_hour" };
  if (age > OPEN_NOTE_MAX_MS) return { send: false, reason: "too_old" };
  return { send: true };
}

export function openQuoteReturnUrl({ segment, email, ch, cid, seq }) {
  const query = {};
  const normalized = normalizeVisitEmail(email);
  if (normalized) query.em = normalized;
  const step = Number(seq);
  if (Number.isInteger(step) && step >= 1 && step <= 9) query.seq = String(step);
  return buildConnectQuoteUrl(segment, {
    src: ch || undefined,
    cid: cid || undefined,
    query,
  });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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

export function buildOpenQuoteNoteEmail({ returnUrl, displayName, segment }) {
  const url = safeHttpUrl(returnUrl);
  const name = normalizeVisitName(displayName);
  const brand = segmentBrandName(segment) || "the quote page";
  const hello = name ? `Hi ${name},` : "Hi,";
  const stopped = `You stopped by ${brand} a little while ago and left before the price came back.`;
  const obligation =
    "No obligation on it — the quote runs under a minute, and nothing binds until you decide to.";
  const ask = "If you have a question, just reply to this email.";
  const subject = "You left before the price came back";
  const textParts = [hello, "", stopped, "", obligation, ""];
  if (url) textParts.push(`SEE MY QUOTE → ${url}`, "");
  textParts.push(ask, "", LICENSE, ADDRESS);

  const paragraphs = [hello, stopped, obligation, ask]
    .map(
      (line) =>
        `<p style="margin:0 0 14px 0;font-size:16px;line-height:1.5;color:#1f2933;">${escapeHtml(line)}</p>`,
    )
    .join("");
  const button = url
    ? `<p style="margin:8px 0 18px 0;"><a href="${escapeHtml(url)}" style="display:inline-block;background:#f58220;color:#ffffff;text-decoration:none;font-weight:700;letter-spacing:0.04em;padding:12px 18px;border-radius:4px;">SEE MY QUOTE</a></p>`
    : "";
  const html = `<!DOCTYPE html>
<html>
<body style="margin:0;padding:24px;background:#f4f7fb;font-family:Arial,Helvetica,sans-serif;color:#1f2933;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;padding:28px 28px 20px 28px;">
    ${paragraphs}
    ${button}
  </div>
  <div style="max-width:560px;margin:12px auto 0 auto;padding:0 8px 12px 8px;">
    <p style="margin:0 0 8px 0;font-size:12px;line-height:1.45;color:#667085;">${escapeHtml(LICENSE)}</p>
    <p style="margin:0 0 8px 0;font-size:12px;line-height:1.45;color:#667085;">${escapeHtml(ADDRESS)}</p>
  </div>
</body>
</html>`;

  return { subject, html, text: textParts.join("\n"), from: readyToBindSender() };
}

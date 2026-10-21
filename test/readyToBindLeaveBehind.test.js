import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import { PDFDocument } from "pdf-lib";
import pdfParse from "pdf-parse";
import { CONNECTQUOTE_MARKETING_READY } from "../src/config/connectQuoteLinks.js";
import {
  READY_TO_BIND_HOUR_MS,
  buildBindCodeEmail,
  buildCoverageLines,
  describeStartDate,
  guardQuoteIsOpenBindable,
  isLeaveBehindSegment,
  prepareLeaveBehind,
  renderReadyToBindPdf,
  renderReturnPage,
} from "../src/services/readyToBindLeaveBehind.js";

const HOUR = READY_TO_BIND_HOUR_MS;
const T0 = new Date("2026-10-21T15:00:00.000Z");
const RETURN_URL =
  "https://cid-pdf-api.onrender.com/q/readybindtokenreadybindtokenreadybind12";

function at(ms) {
  return new Date(T0.getTime() + ms);
}

function coterie(overrides = {}) {
  return {
    offeredAt: T0,
    premium: 1840,
    policyType: "BOP",
    isSuccess: true,
    bound: false,
    ...overrides,
  };
}

function guardQuote(overrides = {}) {
  return {
    purpose: "NBS",
    policyStatusCd: "QuotedNotBound",
    uwDecision: "Accept",
    premium: 2100,
    offeredAt: T0,
    bound: false,
    ...overrides,
  };
}

function input(overrides = {}) {
  return {
    segment: "hvac",
    businessName: "Peak Heating LLC",
    trade: "HVAC contracting",
    email: "owner@example.com",
    now: at(2 * HOUR),
    returnUrl: RETURN_URL,
    quoteDate: "2026-10-21",
    coterie: coterie(),
    guard: null,
    ...overrides,
  };
}

function urlsIn(html) {
  return [...String(html).matchAll(/https?:\/\/[^"'\s<]+/g)].map((match) => match[0]);
}

function visible(html) {
  return String(html).replace(/&#39;/g, "'").replace(/&amp;/g, "&");
}

function assertNoCarrier(text, label) {
  assert.doesNotMatch(text, /coterie/i, `${label} mentions Coterie`);
  assert.doesNotMatch(text, /\bGUARD\b/, `${label} mentions GUARD`);
  assert.doesNotMatch(text, /berkley/i, `${label} mentions Berkley`);
}

async function pdfText(buffer) {
  const parsed = await pdfParse(buffer);
  return parsed.text;
}

test("every ConnectQuote segment is eligible, bar and roofer are not", () => {
  for (const segment of CONNECTQUOTE_MARKETING_READY) {
    assert.equal(isLeaveBehindSegment(segment), true, segment);
    const prepared = prepareLeaveBehind(input({ segment, trade: null }));
    assert.equal(prepared.decision.action, "initial", segment);
  }
  for (const segment of ["bar", "roofer"]) {
    assert.equal(isLeaveBehindSegment(segment), false);
    const prepared = prepareLeaveBehind(
      input({ segment, businessName: "Long Form LLC" }),
    );
    assert.equal(prepared.decision.action, null);
    assert.equal(prepared.decision.reason, "segment");
    assert.equal(prepared.email, null);
  }
});

test("Coterie-only submission has one line and no workers comp", async () => {
  const prepared = prepareLeaveBehind(input());
  assert.equal(prepared.decision.action, "initial");
  assert.equal(prepared.decision.openLines.length, 1);
  assert.equal(prepared.decision.openLines[0].coverageName, "Business Owners Policy");
  assert.match(prepared.email.html, /Business Owners Policy/);
  assert.match(prepared.email.html, /\$1,840\.00/);
  assert.doesNotMatch(prepared.email.html, /Workers/);
  assert.doesNotMatch(prepared.email.text, /Workers/);

  const pdf = await renderReadyToBindPdf({
    businessName: "Peak Heating LLC",
    trade: "HVAC contracting",
    quoteDate: prepared.quoteDate,
    lines: prepared.decision.openLines,
    returnUrl: RETURN_URL,
  });
  const text = await pdfText(pdf);
  assert.match(text, /Business Owners Policy/);
  assert.match(text, /\$1,840\.00/);
  assert.doesNotMatch(text, /Workers/);
  const doc = await PDFDocument.load(pdf);
  assert.equal(doc.getPageCount(), 1);
});

test("both bindable and unbound uses both lines and one URL", async () => {
  const tooSoon = prepareLeaveBehind(
    input({
      segment: "electrical",
      businessName: "Summit Electric LLC",
      trade: "Electrical contracting",
      now: at(65 * 60 * 1000),
      coterie: coterie({ policyType: "GL", premium: 900, offeredAt: T0 }),
      guard: guardQuote({ offeredAt: at(10 * 60 * 1000), premium: 2100 }),
    }),
  );
  assert.equal(tooSoon.decision.reason, "within_hour");

  const prepared = prepareLeaveBehind(
    input({
      segment: "electrical",
      businessName: "Summit Electric LLC",
      trade: "Electrical contracting",
      now: at(70 * 60 * 1000),
      coterie: coterie({ policyType: "GL", premium: 900, offeredAt: T0 }),
      guard: guardQuote({ offeredAt: at(10 * 60 * 1000), premium: 2100 }),
    }),
  );
  assert.equal(prepared.decision.action, "initial");
  assert.equal(prepared.decision.openLines.length, 2);
  assert.match(visible(prepared.email.html), /General Liability/);
  assert.match(visible(prepared.email.html), /Workers' Compensation/);
  assert.match(prepared.email.subject, /Summit Electric LLC/);
  const found = urlsIn(prepared.email.html);
  assert.ok(found.length >= 1);
  assert.ok(found.every((url) => url === RETURN_URL));
  assert.equal(urlsIn(prepared.email.text).every((url) => url === RETURN_URL), true);

  const pdf = await renderReadyToBindPdf({
    businessName: "Summit Electric LLC",
    trade: "Electrical contracting",
    quoteDate: prepared.quoteDate,
    lines: prepared.decision.openLines,
    returnUrl: RETURN_URL,
  });
  const text = await pdfText(pdf);
  assert.match(text, /General Liability/);
  assert.match(text, /Workers' Compensation/);
  assert.match(text, new RegExp(RETURN_URL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  const doc = await PDFDocument.load(pdf);
  assert.equal(doc.getPageCount(), 1);
  const annots = doc.getPages()[0].node.Annots();
  assert.ok(annots && annots.size() >= 1);
});

test("one bound and one open lists only the open line in the note", async () => {
  const prepared = prepareLeaveBehind(
    input({
      segment: "plumber",
      businessName: "Clearwater Plumbing LLC",
      trade: "Plumbing contracting",
      coterie: coterie({
        policyType: "BOP",
        premium: 1111.11,
        bound: true,
      }),
      guard: guardQuote({ premium: 2222.22, bound: false }),
    }),
  );
  assert.equal(prepared.decision.action, "initial");
  assert.equal(prepared.decision.openLines.length, 1);
  assert.equal(prepared.decision.openLines[0].coverageName, "Workers' Compensation");
  assert.match(visible(prepared.email.html), /Workers' Compensation/);
  assert.match(prepared.email.html, /\$2,222\.22/);
  assert.doesNotMatch(prepared.email.html, /Business Owners Policy/);
  assert.doesNotMatch(prepared.email.html, /1,111\.11/);
  assert.equal(urlsIn(prepared.email.html).every((url) => url === RETURN_URL), true);

  const page = renderReturnPage({
    businessName: "Clearwater Plumbing LLC",
    trade: "Plumbing contracting",
    quoteDate: prepared.quoteDate,
    lines: prepared.lines,
    maskedEmail: "o***@example.com",
    token: "readybindtokenreadybindtokenreadybind12",
  });
  assert.match(visible(page), /Business Owners Policy/);
  assert.match(visible(page), /Workers' Compensation/);
  assert.match(page, /Bound/);
  assert.match(page, /Open/);
  assert.match(page, /\$2,222\.22/);
  assert.doesNotMatch(page, /1,111\.11/);

  const pdf = await renderReadyToBindPdf({
    businessName: "Clearwater Plumbing LLC",
    trade: "Plumbing contracting",
    quoteDate: prepared.quoteDate,
    lines: prepared.decision.openLines,
    returnUrl: RETURN_URL,
  });
  const text = await pdfText(pdf);
  assert.match(text, /Workers' Compensation/);
  assert.doesNotMatch(text, /Business Owners Policy/);
});

test("indication-only workers comp does not send", () => {
  const indication = guardQuote({
    purpose: "NBQ",
    indication: true,
    policyStatusCd: "QuotedNotBound",
    uwDecision: "Accept",
    premium: 640,
  });
  assert.equal(guardQuoteIsOpenBindable(indication), false);
  const prepared = prepareLeaveBehind(
    input({
      segment: "pet",
      businessName: "Happy Paws LLC",
      trade: "Pet grooming",
      coterie: null,
      guard: indication,
    }),
  );
  assert.equal(prepared.lines.length, 0);
  assert.equal(prepared.decision.action, null);
  assert.equal(prepared.email, null);

  const referred = prepareLeaveBehind(
    input({
      segment: "fitness",
      businessName: "Studio North LLC",
      coterie: null,
      guard: guardQuote({ uwDecision: "Refer" }),
    }),
  );
  assert.equal(referred.lines.length, 0);
  assert.equal(referred.decision.action, null);
});

test("bind within the hour does not send", () => {
  const stillOpen = prepareLeaveBehind(
    input({
      now: at(30 * 60 * 1000),
      coterie: coterie({ bound: false }),
    }),
  );
  assert.equal(stillOpen.decision.action, null);
  assert.equal(stillOpen.decision.reason, "within_hour");
  assert.equal(stillOpen.email, null);

  const boundDuringHour = prepareLeaveBehind(
    input({
      now: at(2 * HOUR),
      coterie: coterie({ bound: true, premium: 1840 }),
    }),
  );
  assert.equal(boundDuringHour.decision.action, null);
  assert.equal(boundDuringHour.decision.reason, "nothing_open");
  assert.equal(boundDuringHour.email, null);
});

test("missing validThrough omits the clause, a real quote date keeps it", async () => {
  const missing = prepareLeaveBehind(
    input({
      coterie: coterie({
        payload: {
          effectiveDate: "2026-10-21",
          expirationDate: "2027-10-21",
          raw: { quote: { expirationDate: "2027-10-21", decisionDate: "2026-10-21" } },
        },
      }),
    }),
  );
  const missingLine = missing.decision.openLines[0];
  assert.equal(missingLine.validThrough, null);
  assert.doesNotMatch(missing.email.html, /valid through/i);
  assert.doesNotMatch(missing.email.text, /valid through/i);
  const missingPdf = await pdfText(
    await renderReadyToBindPdf({
      businessName: "Peak Heating LLC",
      trade: "HVAC contracting",
      quoteDate: missing.quoteDate,
      lines: missing.decision.openLines,
      returnUrl: RETURN_URL,
    }),
  );
  assert.doesNotMatch(missingPdf, /valid through/i);

  const dated = prepareLeaveBehind(
    input({
      segment: "painter",
      businessName: "Bright Walls LLC",
      coterie: coterie({
        policyType: "GL",
        premium: 760,
        payload: { quoteExpirationDate: "2026-11-04" },
      }),
    }),
  );
  assert.equal(dated.decision.openLines[0].validThrough, "2026-11-04");
  assert.match(dated.email.html, /General Liability — \$760\.00 · valid through November 4, 2026/);
  assert.doesNotMatch(dated.email.html, /Workers/);
  const datedPdf = await pdfText(
    await renderReadyToBindPdf({
      businessName: "Bright Walls LLC",
      quoteDate: dated.quoteDate,
      lines: dated.decision.openLines,
      returnUrl: RETURN_URL,
    }),
  );
  assert.match(datedPdf, /valid through November 4, 2026/);
});

test("customer html and pdf text do not name the carrier", async () => {
  const prepared = prepareLeaveBehind(
    input({
      segment: "beauty",
      businessName: "Lakeside Salon LLC",
      trade: "Hair salon",
      coterie: coterie({ policyType: "BOP", premium: 1320 }),
      guard: guardQuote({ premium: 980, offeredAt: T0 }),
    }),
  );
  const page = renderReturnPage({
    businessName: "Lakeside Salon LLC",
    trade: "Hair salon",
    quoteDate: prepared.quoteDate,
    lines: prepared.lines,
    maskedEmail: "o***@example.com",
    token: "readybindtokenreadybindtokenreadybind12",
  });
  const pdf = await renderReadyToBindPdf({
    businessName: "Lakeside Salon LLC",
    trade: "Hair salon",
    quoteDate: prepared.quoteDate,
    lines: prepared.decision.openLines,
    returnUrl: RETURN_URL,
  });
  const text = await pdfText(pdf);
  const codeMail = buildBindCodeEmail({
    businessName: "Lakeside Salon LLC",
    code: "918273",
  });
  for (const [label, body] of [
    ["email", prepared.email.html],
    ["text", prepared.email.text],
    ["page", page],
    ["pdf", text],
    ["code-email", codeMail.html],
  ]) {
    assertNoCarrier(body, label);
  }
  assert.match(codeMail.html, /918273/);
  assert.doesNotMatch(prepared.email.html, /918273/);
  assert.doesNotMatch(text, /918273/);
  assert.doesNotMatch(page, /918273/);
});

test("day 1 follow-up is only the line still open", () => {
  const open = prepareLeaveBehind(
    input({
      segment: "cleaning",
      businessName: "Sparkle Clean LLC",
      now: at(2 * HOUR + 36 * HOUR),
      prior: { initialAt: at(2 * HOUR) },
      coterie: coterie({ bound: true, premium: 500 }),
      guard: guardQuote({ premium: 800, bound: false }),
    }),
  );
  assert.equal(open.decision.action, "day1");
  assert.equal(open.decision.openLines.length, 1);
  assert.match(visible(open.email.html), /Workers' Compensation/);
  assert.doesNotMatch(open.email.html, /Business Owners Policy/);

  const bothBound = prepareLeaveBehind(
    input({
      segment: "cleaning",
      businessName: "Sparkle Clean LLC",
      now: at(2 * HOUR + 36 * HOUR),
      prior: { initialAt: at(2 * HOUR) },
      coterie: coterie({ bound: true }),
      guard: guardQuote({ bound: true }),
    }),
  );
  assert.equal(bothBound.decision.action, null);
  assert.equal(bothBound.decision.reason, "nothing_open");
});

test("start date copy can say the price was updated only when a refresh did", () => {
  const passed = describeStartDate({
    startDate: "2026-10-01",
    now: new Date("2026-10-21T18:00:00.000Z"),
    priceUpdated: false,
  });
  assert.equal(passed.startDatePassed, true);
  assert.match(passed.note, /start date on this quote has passed/);
  assert.doesNotMatch(passed.note, /price was updated/);

  const refreshed = describeStartDate({
    startDate: "2026-10-01",
    now: new Date("2026-10-21T18:00:00.000Z"),
    priceUpdated: true,
  });
  assert.match(refreshed.note, /start date on this quote has passed, and the price was updated/);

  const page = renderReturnPage({
    businessName: "Peak Heating LLC",
    quoteDate: "2026-10-21",
    lines: buildCoverageLines(input()),
    startDateNote: refreshed.note,
    maskedEmail: "o***@example.com",
    token: "readybindtokenreadybindtokenreadybind12",
  });
  assert.match(page, /price was updated/);
});

test("sample pdf is a non-empty file", async () => {
  const prepared = prepareLeaveBehind(
    input({
      segment: "electrical",
      businessName: "Summit Electric LLC",
      trade: "Electrical contracting",
      coterie: coterie({ policyType: "BOP", premium: 1640 }),
      guard: guardQuote({ premium: 2210 }),
    }),
  );
  const pdf = await renderReadyToBindPdf({
    businessName: "Summit Electric LLC",
    trade: "Electrical contracting",
    quoteDate: prepared.quoteDate,
    lines: prepared.decision.openLines,
    returnUrl: RETURN_URL,
  });
  assert.ok(pdf.length > 1000);
  assert.equal(pdf.subarray(0, 5).toString("utf8"), "%PDF-");
  const samplePath = "/tmp/cid-ready-to-bind-sample.pdf";
  fs.writeFileSync(samplePath, pdf);
  const saved = fs.statSync(samplePath);
  assert.ok(saved.size > 1000);
});

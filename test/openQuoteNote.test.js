import test from "node:test";
import assert from "node:assert/strict";
import {
  buildOpenQuoteNoteEmail,
  decideOpenQuoteNote,
  openQuoteReturnUrl,
} from "../src/services/openQuoteNote.js";

const HOUR = 60 * 60 * 1000;
const now = new Date("2026-11-02T16:00:00Z");

function atAge(ms) {
  return new Date(now.getTime() - ms);
}

test("sends one hour after an open, before a price", () => {
  const decision = decideOpenQuoteNote({
    segment: "electrical",
    email: "owner@shop.test",
    engagedAt: atAge(HOUR + 60_000),
    now,
  });
  assert.equal(decision.send, true);
});

test("waits out the hour", () => {
  const decision = decideOpenQuoteNote({
    segment: "plumber",
    email: "owner@shop.test",
    engagedAt: atAge(30 * 60 * 1000),
    now,
  });
  assert.equal(decision.send, false);
  assert.equal(decision.reason, "within_hour");
});

test("does not send once a quote exists", () => {
  const decision = decideOpenQuoteNote({
    segment: "beauty",
    email: "owner@shop.test",
    engagedAt: atAge(2 * HOUR),
    now,
    hasQuote: true,
  });
  assert.equal(decision.send, false);
  assert.equal(decision.reason, "has_quote");
});

test("does not send a second note", () => {
  const decision = decideOpenQuoteNote({
    segment: "pet",
    email: "owner@shop.test",
    engagedAt: atAge(2 * HOUR),
    now,
    alreadySent: true,
  });
  assert.equal(decision.reason, "already_sent");
});

test("skips a visit that is no longer the same day", () => {
  const decision = decideOpenQuoteNote({
    segment: "fitness",
    email: "owner@shop.test",
    engagedAt: atAge(25 * HOUR),
    now,
  });
  assert.equal(decision.reason, "too_old");
});

test("skips bar and a missing address", () => {
  assert.equal(
    decideOpenQuoteNote({
      segment: "bar",
      email: "owner@shop.test",
      engagedAt: atAge(2 * HOUR),
      now,
    }).reason,
    "segment",
  );
  assert.equal(
    decideOpenQuoteNote({
      segment: "cleaning",
      email: "not-an-email",
      engagedAt: atAge(2 * HOUR),
      now,
    }).reason,
    "email",
  );
});

test("the note uses the business name and the segment brand", () => {
  const url = openQuoteReturnUrl({
    segment: "electrical",
    email: "Owner@Shop.test",
    ch: "instantly-co-electrical",
    cid: "electrical-co-2026-10",
    seq: 1,
  });
  const message = buildOpenQuoteNoteEmail({
    returnUrl: url,
    displayName: "Peak Electric LLC",
    segment: "electrical",
  });
  assert.equal(message.subject, "You left before the price came back");
  assert.match(message.text, /^Hi Peak Electric,/);
  assert.match(message.text, /stopped by Electrical Insurance Direct/);
  assert.match(message.text, /left before the price came back/);
  assert.match(message.text, /No obligation on it/);
  assert.match(message.text, /nothing binds until you decide/);
  assert.match(message.text, /If you have a question, just reply to this email/);
  assert.match(message.text, /CID Insurance Services/);
  assert.match(message.text, /6784587/);
  assert.equal(message.text.includes("FINISH AND BIND"), false);
  assert.equal(message.text.includes("one step left"), false);
  assert.match(url, /electricalinsurancedirect\.com\/connectquote\.html/);
  assert.match(url, /em=owner%40shop\.test/);
  assert.match(message.html, /SEE MY QUOTE/);
  assert.equal(message.from.replyTo, "support@commercialinsurance-direct.com");
});

test("a missing business name still greets", () => {
  const message = buildOpenQuoteNoteEmail({
    returnUrl: "https://plumberinsurancedirect.com/connectquote.html",
    displayName: "",
    segment: "plumber",
  });
  assert.match(message.text, /^Hi,/);
  assert.match(message.text, /Plumber Insurance Direct/);
});

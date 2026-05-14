/**
 * Segment Gmail inboxes for operator/carrier traffic.
 * Keep in sync with CID migrations and Gmail poller expectations.
 * Bar uses singular quote@ (historical mailbox naming).
 *
 * The poller skips a segment when its `GMAIL_REFRESH_TOKEN_*` is missing or rejected
 * (OAuth); other segments still run — see `gmailPoller.js`.
 */
export const GMAIL_POLLER_SEGMENTS = [
  {
    segment: "bar",
    email: "quote@barinsurancedirect.com",
    label: "carrier-quotes",
  },
  {
    segment: "roofer",
    email: "quotes@roofingcontractorinsurancedirect.com",
    label: "carrier-quotes",
  },
  {
    segment: "plumber",
    email: "quotes@plumberinsurancedirect.com",
    label: "carrier-quotes",
  },
  {
    segment: "hvac",
    email: "quotes@hvacinsurancedirect.com",
    label: "carrier-quotes",
  },
  {
    segment: "fitness",
    email: "quotes@fitnessinsurancedirect.com",
    label: "carrier-quotes",
  },
];

/**
 * @param {string} [segment] - submissions.segment / segment_type
 * @returns {string|null}
 */
export function getSegmentAgentInboxEmail(segment) {
  const s = String(segment || "").toLowerCase().trim();
  const row = GMAIL_POLLER_SEGMENTS.find((x) => x.segment === s);
  return row?.email ?? null;
}

/** Default ACORD producer block (agency) — not applicant contact. Phone matches operator collateral. */
const SEGMENT_PRODUCER_PHONE = "(303) 932-1700";

/**
 * @param {string} [segment]
 * @returns {{ email: string | null, phone: string } | null}
 */
export function getSegmentProducerDefaults(segment) {
  const email = getSegmentAgentInboxEmail(segment);
  if (!email) return null;
  return { email, phone: SEGMENT_PRODUCER_PHONE };
}

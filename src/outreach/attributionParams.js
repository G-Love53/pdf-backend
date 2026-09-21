/**
 * ConnectQuote URL attribution — channel + campaign.
 *
 * Use `ch` AND `src` with the same value on outbound links. Safari Link Tracking
 * Protection and some click trackers strip `src` (known tracking name); `cid`
 * and custom `ch` usually survive. Intake reads ch → src → utm_source.
 */

export const CHANNEL_QUERY_KEYS = ["ch", "src", "utm_source"];
export const CAMPAIGN_QUERY_KEY = "cid";
/** Email sequence step (1–3). URL param `seq` — not `st`, which is state (CO). */
export const SEQUENCE_QUERY_KEY = "seq";

/** @param {string | null | undefined} raw */
export function parseSequenceStep(raw) {
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 9) return null;
  return n;
}

/** @param {URLSearchParams} params */
export function readChannelFromParams(params) {
  for (const key of CHANNEL_QUERY_KEYS) {
    const v = params.get(key);
    if (v) return v;
  }
  return "";
}

/** @param {URLSearchParams} params @param {{ channel?: string, campaign?: string, seq?: number | null }} opts */
export function setAttributionParams(params, { channel, campaign, seq }) {
  if (channel) {
    params.set("ch", channel);
    params.set("src", channel);
  }
  if (campaign) params.set(CAMPAIGN_QUERY_KEY, campaign);
  const step = parseSequenceStep(seq);
  if (step != null) params.set(SEQUENCE_QUERY_KEY, String(step));
}

/** @param {URLSearchParams} params */
export function readSequenceFromParams(params) {
  return parseSequenceStep(params.get(SEQUENCE_QUERY_KEY));
}

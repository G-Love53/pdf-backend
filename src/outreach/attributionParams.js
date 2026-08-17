/**
 * ConnectQuote URL attribution — channel + campaign.
 *
 * Use `ch` AND `src` with the same value on outbound links. Safari Link Tracking
 * Protection and some click trackers strip `src` (known tracking name); `cid`
 * and custom `ch` usually survive. Intake reads ch → src → utm_source.
 */

export const CHANNEL_QUERY_KEYS = ["ch", "src", "utm_source"];
export const CAMPAIGN_QUERY_KEY = "cid";

/** @param {URLSearchParams} params */
export function readChannelFromParams(params) {
  for (const key of CHANNEL_QUERY_KEYS) {
    const v = params.get(key);
    if (v) return v;
  }
  return "";
}

/** @param {URLSearchParams} params @param {{ channel?: string, campaign?: string }} opts */
export function setAttributionParams(params, { channel, campaign }) {
  if (channel) {
    params.set("ch", channel);
    params.set("src", channel);
  }
  if (campaign) params.set(CAMPAIGN_QUERY_KEY, campaign);
}

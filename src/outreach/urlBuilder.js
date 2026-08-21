import { URLSearchParams } from "node:url";
import { setAttributionParams } from "./attributionParams.js";
import { normalizeUsPhone } from "./normalizeUsPhone.js";
import { validateOutreachEmail } from "./outreachEmailValidation.js";
import { resolveUsZip } from "./parseUsZip.js";
import {
  SEGMENT_DOMAINS,
  buildConnectQuoteUrl,
  isConnectQuoteMarketingReady,
  isConnectQuoteSegment,
} from "../config/connectQuoteLinks.js";

export {
  SEGMENT_DOMAINS,
  buildConnectQuoteUrl,
  isConnectQuoteMarketingReady,
  isConnectQuoteSegment,
};

// URL parameter mapping (short keys to save URL length)
export const URL_PARAM_MAP = {
  business_name: "bn",
  first_name: "fn",
  last_name: "ln",
  email: "em",
  phone: "ph",
  address: "ad",
  city: "ct",
  state: "st",
  zip: "zp",
};

export function buildPrefilledUrl(contact, segment, campaignTag, opts = {}) {
  const key = String(segment || "").toLowerCase();

  if (isConnectQuoteMarketingReady(key)) {
    const params = new URLSearchParams();
    for (const [field, param] of Object.entries(URL_PARAM_MAP)) {
      let raw = contact[field];
      if (!raw) continue;
      if (field === "phone") {
        const value = normalizeUsPhone(raw);
        if (value) params.set(param, value);
        continue;
      }
      if (field === "email") {
        const check = validateOutreachEmail(String(raw));
        if (check.ok) params.set(param, String(raw).trim().toLowerCase());
        continue;
      }
      if (field === "zip") {
        const value = resolveUsZip({
          address: contact.address,
          zip: raw,
          state: contact.state,
        });
        if (value) params.set(param, value);
        continue;
      }
      params.set(param, String(raw));
    }
    setAttributionParams(params, {
      channel: opts.src || "instantly",
      campaign: campaignTag,
    });
    if (opts.businessClass) {
      params.set("bc", opts.businessClass);
    }
    const domain = SEGMENT_DOMAINS[key];
    return `${domain}/connectquote.html?${params.toString()}`;
  }

  const domain = SEGMENT_DOMAINS[key];
  if (!domain) {
    throw new Error(`No domain configured for segment: ${segment}`);
  }

  const params = new URLSearchParams();

  for (const [field, param] of Object.entries(URL_PARAM_MAP)) {
    const raw = contact[field];
    if (!raw) continue;
    if (field === "phone") {
      const value = normalizeUsPhone(raw);
      if (value) params.set(param, value);
      continue;
    }
    if (field === "email") {
      const check = validateOutreachEmail(String(raw));
      if (check.ok) params.set(param, String(raw).trim().toLowerCase());
      continue;
    }
    if (field === "zip") {
      const value = resolveUsZip({
        address: contact.address,
        zip: raw,
        state: contact.state,
      });
      if (value) params.set(param, value);
      continue;
    }
    params.set(param, String(raw));
  }

  setAttributionParams(params, {
    channel: opts.src || "instantly",
    campaign: campaignTag,
  });

  return `${domain}/quote?${params.toString()}`;
}

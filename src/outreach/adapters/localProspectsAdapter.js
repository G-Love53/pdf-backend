import { normalizeUsPhone } from "../normalizeUsPhone.js";
import { resolveUsZip } from "../parseUsZip.js";

function pick(row, ...keys) {
  for (const k of keys) {
    const v = row[k];
    if (v != null && String(v).trim() !== "") return String(v).trim();
  }
  return "";
}

function parseStreet(full) {
  const s = String(full || "").trim();
  if (!s) return "";
  const m = s.match(/^(.+?),\s*[^,]+,\s*[A-Z]{2}\s*\d{5}/i);
  return m ? m[1].trim() : s.split(",")[0]?.trim() || s;
}

function parseZip(full, rowZip, state) {
  return resolveUsZip({ address: full, zip: rowZip, state }) || null;
}

/**
 * Normalize LP advanced CSV row or JSON lead to canonical contact shape.
 */
export function normalize(record, opts = {}) {
  const email = pick(record, "email", "Email").toLowerCase();
  const companyName = pick(
    record,
    "companyName",
    "Company Name",
    "business_name",
    "Business Name",
    "name",
    "Name",
  );
  const category = pick(record, "category", "Category");
  const keyword = opts.keyword || pick(record, "keyword", "Keyword", "search_keyword");
  const fullAddress = pick(record, "address", "Address", "contact.address", "street");
  const city = pick(record, "city", "City", "contact.city");
  const state = pick(record, "state", "State", "state_code", "contact.state_code", "contact.state");
  const zip = parseZip(fullAddress, pick(record, "zip", "Zip", "postal_code", "contact.zip"), state);
  const phoneRaw = pick(
    record,
    "phone",
    "Phone",
    "mobile_number",
    "Mobile Number",
    "mobile_phone",
    "Mobile Phone",
  );
  const owner = pick(record, "owner", "Owner", "owner_name", "Owner Name");
  const ownerParts = owner.split(/\s+/).filter(Boolean);
  const placeId = pick(record, "place_id", "Place ID", "google_place_id");
  const googleCid = pick(record, "google_cid", "Google CID", "cid", "CID");

  return {
    email: email || null,
    business_name: companyName || null,
    first_name: pick(record, "firstName", "First Name", "first_name") || ownerParts[0] || null,
    last_name:
      pick(record, "lastName", "Last Name", "last_name") ||
      (ownerParts.length > 1 ? ownerParts.slice(1).join(" ") : null),
    phone: normalizeUsPhone(phoneRaw) || null,
    address: parseStreet(fullAddress),
    city: city || null,
    state: state || null,
    zip: zip || null,
    website: pick(record, "website", "Website") || null,
    category: category || null,
    keyword: keyword || null,
    place_id: placeId || null,
    google_cid: googleCid || null,
    listing_id: placeId || googleCid || null,
    data_source: "localprospects",
    source_id: placeId || googleCid || pick(record, "source_id") || null,
  };
}

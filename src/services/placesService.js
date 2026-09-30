import {
  googlePlacesApiKey,
  isGooglePlacesConfigured,
  isPlacesAllowedState,
  placesAllowedStates,
} from "../config/placesConfig.js";

const AUTOCOMPLETE_URL =
  "https://places.googleapis.com/v1/places:autocomplete";

function componentOf(parts, type) {
  const c = (parts || []).find((p) => (p.types || []).includes(type));
  if (!c) return { long: "", short: "" };
  return {
    long: String(c.longText || c.longName || "").trim(),
    short: String(c.shortText || c.shortName || "").trim(),
  };
}

function parseAddress(details) {
  const parts = details?.addressComponents || [];
  const streetNumber = componentOf(parts, "street_number");
  const route = componentOf(parts, "route");
  const locality =
    componentOf(parts, "locality").long ||
    componentOf(parts, "sublocality").long ||
    componentOf(parts, "postal_town").long;
  const state = componentOf(parts, "administrative_area_level_1");
  const zip = componentOf(parts, "postal_code");
  const street = [streetNumber.long, route.long].filter(Boolean).join(" ").trim();
  return {
    street: street || String(details?.formattedAddress || "").split(",")[0] || "",
    city: locality || "",
    state: (state.short || state.long || "").toUpperCase().slice(0, 2),
    zip: (zip.short || zip.long || "").replace(/\D/g, "").slice(0, 5),
  };
}

export function getPlacesPublicConfig() {
  return {
    ok: true,
    enabled: isGooglePlacesConfigured(),
    states: placesAllowedStates(),
  };
}

export async function placesAutocomplete({ input, sessionToken } = {}) {
  if (!isGooglePlacesConfigured()) {
    return {
      ok: false,
      status: 503,
      error: "PLACES_NOT_CONFIGURED",
      message: "Address lookup is not enabled on this service.",
    };
  }
  const q = String(input || "").trim().slice(0, 120);
  if (q.length < 3) {
    return { ok: true, suggestions: [] };
  }

  const res = await fetch(AUTOCOMPLETE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": googlePlacesApiKey(),
      "X-Goog-FieldMask":
        "suggestions.placePrediction.placeId,suggestions.placePrediction.text",
    },
    body: JSON.stringify({
      input: q,
      languageCode: "en",
      includedRegionCodes: ["us"],
      ...(sessionToken ? { sessionToken } : {}),
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error("[places autocomplete]", res.status, data?.error?.message || data);
    return {
      ok: false,
      status: 502,
      error: "PLACES_AUTOCOMPLETE_FAILED",
      message: "Address lookup is temporarily unavailable.",
    };
  }

  const suggestions = (data.suggestions || [])
    .map((s) => {
      const p = s.placePrediction || {};
      const text = p.text?.text || p.text || "";
      return {
        placeId: p.placeId || (p.place || "").replace(/^places\//, ""),
        text: String(text),
      };
    })
    .filter((s) => s.placeId && s.text)
    .slice(0, 8);

  return { ok: true, suggestions };
}

export async function placesDetails({ placeId, sessionToken } = {}) {
  if (!isGooglePlacesConfigured()) {
    return {
      ok: false,
      status: 503,
      error: "PLACES_NOT_CONFIGURED",
      message: "Address lookup is not enabled on this service.",
    };
  }
  const id = String(placeId || "")
    .replace(/^places\//, "")
    .trim();
  if (!id) {
    return { ok: false, status: 400, error: "PLACE_ID_REQUIRED" };
  }

  const params = new URLSearchParams({ languageCode: "en" });
  if (sessionToken) params.set("sessionToken", sessionToken);
  const url = `https://places.googleapis.com/v1/places/${encodeURIComponent(id)}?${params}`;
  const res = await fetch(url, {
    headers: {
      "X-Goog-Api-Key": googlePlacesApiKey(),
      "X-Goog-FieldMask": "addressComponents,formattedAddress",
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error("[places details]", res.status, data?.error?.message || data);
    return {
      ok: false,
      status: 502,
      error: "PLACES_DETAILS_FAILED",
      message: "Could not load that address.",
    };
  }

  const address = parseAddress(data);
  if (!address.street || !address.state || !address.zip) {
    return {
      ok: false,
      status: 422,
      error: "ADDRESS_INCOMPLETE",
      message: "Pick a full street address with city, state, and ZIP.",
    };
  }
  if (!isPlacesAllowedState(address.state)) {
    return {
      ok: false,
      status: 422,
      error: "STATE_NOT_IN_ROLLOUT",
      message: `That address is in ${address.state}. We currently look up addresses in ${placesAllowedStates().join(", ")}.`,
      address,
    };
  }

  return { ok: true, address };
}

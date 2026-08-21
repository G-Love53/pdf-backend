const DEFAULT_BASE = "https://localprospects.ai/api/v1";

/** LP dashboard export defaults — always use both dropdowns before download. */
export const LP_CAMPAIGN_EXPORT = {
  /** CSV format dropdown: Advanced (full enrichment + Email 1–5, phones, pages). */
  format: "advanced",
  /** Filter dropdown: With emails. */
  hasEmail: true,
};

const US_STATE_NAMES = {
  AL: "Alabama",
  AK: "Alaska",
  AZ: "Arizona",
  AR: "Arkansas",
  CA: "California",
  CO: "Colorado",
  CT: "Connecticut",
  DE: "Delaware",
  FL: "Florida",
  GA: "Georgia",
  HI: "Hawaii",
  ID: "Idaho",
  IL: "Illinois",
  IN: "Indiana",
  IA: "Iowa",
  KS: "Kansas",
  KY: "Kentucky",
  LA: "Louisiana",
  ME: "Maine",
  MD: "Maryland",
  MA: "Massachusetts",
  MI: "Michigan",
  MN: "Minnesota",
  MS: "Mississippi",
  MO: "Missouri",
  MT: "Montana",
  NE: "Nebraska",
  NV: "Nevada",
  NH: "New Hampshire",
  NJ: "New Jersey",
  NM: "New Mexico",
  NY: "New York",
  NC: "North Carolina",
  ND: "North Dakota",
  OH: "Ohio",
  OK: "Oklahoma",
  OR: "Oregon",
  PA: "Pennsylvania",
  RI: "Rhode Island",
  SC: "South Carolina",
  SD: "South Dakota",
  TN: "Tennessee",
  TX: "Texas",
  UT: "Utah",
  VT: "Vermont",
  VA: "Virginia",
  WA: "Washington",
  WV: "West Virginia",
  WI: "Wisconsin",
  WY: "Wyoming",
};

export class LocalProspectsClient {
  /**
   * @param {{ apiKey?: string, baseUrl?: string, fetchFn?: typeof fetch }} opts
   */
  constructor(opts = {}) {
    this.apiKey = opts.apiKey || process.env.LOCALPROSPECTS_API_KEY || "";
    this.baseUrl = (opts.baseUrl || process.env.LOCALPROSPECTS_API_BASE || DEFAULT_BASE).replace(/\/$/, "");
    this.fetchFn = opts.fetchFn || fetch;
  }

  requireKey() {
    if (!this.apiKey) {
      throw new Error(
        "LOCALPROSPECTS_API_KEY is not set. Add it to pdf-backend/.env (never commit).",
      );
    }
  }

  async request(method, path, { body, query } = {}) {
    this.requireKey();
    const url = new URL(`${this.baseUrl}${path.startsWith("/") ? path : `/${path}`}`);
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v != null && v !== "") url.searchParams.set(k, String(v));
      }
    }
    const res = await this.fetchFn(url.toString(), {
      method,
      headers: {
        "x-api-key": this.apiKey,
        Accept: "application/json, text/csv, */*",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    if (!res.ok) {
      let detail = text;
      try {
        detail = JSON.parse(text);
      } catch {
        /* keep text */
      }
      const err = new Error(`LocalProspects ${method} ${path} → ${res.status}`);
      err.status = res.status;
      err.detail = detail;
      throw err;
    }
    const contentType = res.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      try {
        return JSON.parse(text);
      } catch {
        return text;
      }
    }
    return text;
  }

  async searchLocations(q) {
    return this.request("GET", "/locations", { query: { q } });
  }

  async browseCampaignLocations(query = {}) {
    return this.request("GET", "/campaign-locations", { query });
  }

  /**
   * Resolve US state → region location_code for campaign scope.include.
   */
  async resolveStateRegionCode(stateAbbr) {
    const abbr = String(stateAbbr || "").trim().toUpperCase();
    const name = US_STATE_NAMES[abbr];
    if (!name) throw new Error(`Unknown state: ${stateAbbr}`);

    const candidates = [];

    for (const q of [name, `${name}, US`, `${name} US`, abbr]) {
      try {
        const res = await this.browseCampaignLocations({ q });
        const rows = res?.locations || res?.results || res?.data || [];
        if (Array.isArray(rows)) candidates.push(...rows);
      } catch {
        /* try next */
      }
      try {
        const res = await this.searchLocations(q);
        const rows = res?.locations || [];
        if (Array.isArray(rows)) candidates.push(...rows);
      } catch {
        /* try next */
      }
    }

    const nameLower = name.toLowerCase();
    const isUsState = (loc) => {
      const type = String(loc.location_type || loc.type || "").toLowerCase();
      const country = String(loc.country_iso_code || loc.country || "").toUpperCase();
      return (type === "state" || type === "region") && (!country || country === "US");
    };

    const match =
      candidates.find((loc) => {
        if (!isUsState(loc)) return false;
        const search = String(loc.search_name || loc.name || "").toLowerCase();
        const locName = String(loc.location_name || loc.full_name || loc.name || "").toLowerCase();
        return search === nameLower || search === abbr.toLowerCase() || locName.startsWith(`${nameLower},`);
      }) ||
      candidates.find((loc) => {
        const type = String(loc.location_type || loc.type || "").toLowerCase();
        const fn = String(loc.full_name || loc.location_name || loc.name || "").toLowerCase();
        return (
          (type === "state" || type === "region") &&
          (fn === `${nameLower}, united states` ||
            fn.startsWith(`${nameLower},`) ||
            fn.includes(`${nameLower},united states`))
        );
      });

    if (!match?.location_code) {
      throw new Error(
        `Could not resolve region location_code for ${abbr}. Browse GET /campaign-locations?q=${encodeURIComponent(name)} in dashboard and pass --region-code manually.`,
      );
    }

    return {
      location_code: match.location_code,
      full_name: match.full_name || match.location_name || match.name || name,
      type: match.location_type || match.type || "State",
    };
  }

  previewCampaign(body) {
    return this.request("POST", "/campaigns/preview", { body });
  }

  createCampaign(body) {
    return this.request("POST", "/campaigns", { body });
  }

  getCampaign(id) {
    return this.request("GET", `/campaigns/${id}`);
  }

  /** Unwrap GET /campaigns/:id response → { status, stats, ...campaign fields }. */
  normalizeCampaignPayload(payload) {
    const root = payload || {};
    const camp = root.campaign && typeof root.campaign === "object" ? root.campaign : root;
    const stats = root.stats || camp.stats || {};
    return { ...camp, stats, _raw: root };
  }

  campaignStatus(payload) {
    const camp = this.normalizeCampaignPayload(payload);
    return String(camp.status || camp.state || "").toLowerCase();
  }

  startCampaign(id) {
    return this.request("POST", `/campaigns/${id}/actions/start`, { body: {} });
  }

  resumeCampaign(id) {
    return this.request("POST", `/campaigns/${id}/actions/resume`, { body: {} });
  }

  /**
   * Download campaign CSV using LP dashboard defaults:
   * - format **advanced** (full enrichment CSV)
   * - filter **With emails** (`has_email=true`)
   */
  exportCampaignCsv(id, format = LP_CAMPAIGN_EXPORT.format, opts = {}) {
    const resolvedFormat = format || LP_CAMPAIGN_EXPORT.format;
    const hasEmail = opts.hasEmail ?? LP_CAMPAIGN_EXPORT.hasEmail;
    const query = { format: resolvedFormat };
    if (hasEmail) query.has_email = true;
    return this.request("GET", `/campaigns/${id}/export`, { query });
  }

  async waitForCampaign(id, { pollMs = 8000, timeoutMs = 6 * 60 * 60 * 1000, onTick } = {}) {
    const start = Date.now();
    let lastStatus = "";
    let lastProgress = -1;

    while (Date.now() - start < timeoutMs) {
      const raw = await this.getCampaign(id);
      const camp = this.normalizeCampaignPayload(raw);
      const status = this.campaignStatus(raw);
      const progress = camp.stats?.progress_percent ?? camp.stats?.locations_completed ?? null;

      if (status !== lastStatus || progress !== lastProgress) {
        lastStatus = status;
        lastProgress = progress;
        if (onTick) onTick(camp, { status, raw });
      }

      if (["completed", "complete", "done", "stopped", "stopped_complete"].includes(status)) {
        return camp;
      }
      if (["failed", "error", "cancelled", "canceled"].includes(status)) {
        const err = new Error(`Campaign ${id} ended with status: ${status}`);
        err.campaign = camp;
        throw err;
      }
      if (["paused", "attention_needed", "attention-needed", "low_balance"].includes(status)) {
        if (onTick) onTick(camp, { paused: true, status, raw });
      }

      await new Promise((r) => setTimeout(r, pollMs));
    }

    throw new Error(`Campaign ${id} timed out after ${timeoutMs}ms`);
  }
}

export { US_STATE_NAMES };

import { resolveRegistryEntry, listBusinessClasses } from "./coterieRegistry.js";

/** States where Coterie caps GL occurrence at $1M for contractor classes. */
export const COTERIE_CONTRACTOR_GL_CAP_STATES = new Set([
  "NY",
  "TX",
  "CO",
  "CA",
  "FL",
]);

const CONTRACTOR_SEGMENTS = new Set(["electrical", "plumber", "hvac"]);

/** Coterie bindable fields exposed on ConnectQuote (investor / real-quote mode). */
export const COTERIE_EXTENDED_FIELDS = {
  gross_annual_sales: {
    name: "gross_annual_sales",
    label: "Gross annual sales / revenue",
    type: "number",
    format: "currency",
    coterieKey: "grossAnnualSales",
    section: "rating",
    min: 1000,
    step: 1,
    prefillParam: "sales",
  },
  annual_payroll: {
    name: "annual_payroll",
    label: "Annual payroll",
    type: "number",
    format: "currency",
    coterieKey: "annualPayroll",
    section: "rating",
    min: 1000,
    step: 1,
    prefillParam: "payroll",
  },
  business_start_month: {
    name: "business_start_month",
    label: "Month business started",
    type: "month",
    coterieKey: "businessStartDate",
    section: "rating",
    prefillParam: "bsm",
    legacyYearPrefillParam: "ys",
  },
  location_type: {
    name: "location_type",
    label: "Occupancy / location type",
    type: "select",
    coterieKey: "locationType",
    section: "bop",
    options: [
      { value: "BuildingLeased", label: "Leased commercial space" },
      { value: "BuildingOwned", label: "Owned building" },
      { value: "Home", label: "Home-based business" },
    ],
    default: "BuildingLeased",
    defaultPreselect: true,
    prefillParam: "occ",
  },
  bpp_deductible: {
    name: "bpp_deductible",
    label: "Property deductible (BPP)",
    type: "select",
    coterieKey: "bppDeductible",
    section: "bop",
    options: [
      { value: "500", label: "$500" },
      { value: "1000", label: "$1,000" },
      { value: "2500", label: "$2,500" },
      { value: "5000", label: "$5,000" },
    ],
    default: "1000",
    prefillParam: "bpp",
  },
  building_limit: {
    name: "building_limit",
    label: "Building limit (owned property)",
    type: "number",
    format: "currency",
    coterieKey: "buildingLimit",
    section: "bop",
    min: 25000,
    max: 1000000,
    showWhenLocationType: "BuildingOwned",
    prefillParam: "bldg",
  },
  bpp_limit: {
    name: "bpp_limit",
    label: "Business personal property (tools, equipment, inventory)",
    type: "number",
    format: "currency",
    coterieKey: "bppLimit",
    section: "bop",
    min: 5000,
    max: 500000,
    prefillParam: "bpp_lim",
  },
  gl_limit: {
    name: "gl_limit",
    label: "GL each occurrence limit",
    type: "select",
    coterieKey: "glLimit",
    section: "gl",
    options: [
      { value: "300000", label: "$300,000" },
      { value: "500000", label: "$500,000" },
      { value: "1000000", label: "$1,000,000" },
      { value: "2000000", label: "$2,000,000" },
    ],
    default: "1000000",
    defaultPreselect: true,
    prefillParam: "gl",
  },
  gl_aggregate_limit: {
    name: "gl_aggregate_limit",
    label: "GL general aggregate limit",
    type: "select",
    coterieKey: "glAggregateLimit",
    section: "gl",
    options: [
      { value: "2000000", label: "$2,000,000" },
      { value: "4000000", label: "$4,000,000" },
    ],
    default: "2000000",
    defaultPreselect: true,
    prefillParam: "gla",
  },
  policy_start_date: {
    name: "policy_start_date",
    label: "Policy start date",
    type: "date",
    coterieKey: "policyStartDate",
    section: "policy",
    default: null,
    prefillParam: "start",
  },
};

export function isContractorGlCapState(state) {
  const st = String(state || "").trim().toUpperCase();
  return COTERIE_CONTRACTOR_GL_CAP_STATES.has(st);
}

export function filterGlLimitOptions(segment, state) {
  const options = [...COTERIE_EXTENDED_FIELDS.gl_limit.options];
  if (!CONTRACTOR_SEGMENTS.has(String(segment || "").toLowerCase())) {
    return options;
  }
  if (!isContractorGlCapState(state)) return options;
  return options.filter((o) => Number(o.value) <= 1000000);
}

export function filterGlAggregateOptions(segment, state, glLimitValue) {
  const options = [...COTERIE_EXTENDED_FIELDS.gl_aggregate_limit.options];
  const glLimit = Number(glLimitValue || 1000000);
  let filtered = options;
  if (
    CONTRACTOR_SEGMENTS.has(String(segment || "").toLowerCase()) &&
    isContractorGlCapState(state)
  ) {
    filtered = filtered.filter((o) => Number(o.value) <= 2000000);
  }
  return filtered.filter((o) => Number(o.value) >= glLimit * 2);
}

function isNonOwner(isOwner) {
  return (
    isOwner === false ||
    isOwner === "no" ||
    String(isOwner).toLowerCase() === "false"
  );
}

/** Plain-language blurbs for the ? help on coverage toggles. */
export const COVERAGE_HELP = {
  BOP:
    "Businessowners Policy — general liability plus coverage for your business property (tools, equipment, inventory) and often business income if you have to close temporarily. Typical choice for contractors and studio owners with a physical location.",
  GL:
    "General liability only — covers third-party bodily injury and property damage from your operations (e.g. a customer slips, or your work damages someone else's property). Does not cover your own building, tools, or stock.",
};

function enrichInstantOption(option) {
  const help = option.help || COVERAGE_HELP[option.id] || null;
  return help ? { ...option, help } : { ...option };
}

function resolveInstantSelection(entry, instantOptions) {
  const configured = entry?.coverage?.owner?.selection;
  if (configured === "one" || configured === "many") {
    return configured;
  }
  const ids = instantOptions.map((c) => c.id);
  /** BOP and GL are separate Coterie products — bind one, not both (except pilates-style combos). */
  if (ids.includes("BOP") && ids.includes("GL")) {
    return "one";
  }
  return instantOptions.length > 1 ? "many" : "one";
}

/** Coverage toggles + extras for a registry row. */
export function getCoverageOptions(entry, { isOwner = true } = {}) {
  if (!entry || entry.prohibited) {
    return { instant: [], extras: [] };
  }

  const nonOwner = isNonOwner(isOwner);

  if (nonOwner) {
    const types = entry.employeeApplicationTypes || ["GL"];
    const instant = types.map((id) =>
      enrichInstantOption({
        id,
        label:
          id === "BOP"
            ? "Businessowners Policy (BOP)"
            : "General liability (GL)",
        defaultOn: true,
        required: true,
      }),
    );
    return {
      instant,
      instantSelection: "one",
      extras: entry.extras?.employee || entry.extras?.nonOwner || [],
    };
  }

  const configured = entry.coverage?.owner?.options;
  if (configured?.length) {
    const instant = configured.map(enrichInstantOption);
    return {
      instant,
      instantSelection: resolveInstantSelection(entry, instant),
      extras: entry.coverage?.owner?.extras || entry.extras?.owner || [],
    };
  }

  const defaults = entry.defaultApplicationTypes || ["BOP"];
  const instant = defaults.map((id) =>
    enrichInstantOption({
      id,
      label:
        id === "BOP"
          ? "Businessowners Policy (BOP)"
          : "General liability (GL)",
      defaultOn: true,
      required: defaults.length === 1,
    }),
  );
  return {
    instant,
    instantSelection: resolveInstantSelection(entry, instant),
    extras: entry.extras?.owner || [],
  };
}

export function resolveIntakeSchema(
  segment,
  businessClassKey,
  { isOwner = true, state = null } = {},
) {
  const entry = resolveRegistryEntry(segment, businessClassKey);
  const coverage = getCoverageOptions(entry, { isOwner });
  const nonOwner = isNonOwner(isOwner);

  const instantIds = coverage.instant.map((c) => c.id);
  const hasBop = instantIds.includes("BOP") && !nonOwner;
  const hasGl = instantIds.includes("GL");
  /** Coterie bindable requires payroll/sales/age for GL-only paths too (yoga, trainer). */
  const needsRating = hasGl || hasBop;

  const fields = [];
  if (needsRating) {
    fields.push(
      COTERIE_EXTENDED_FIELDS.gross_annual_sales,
      COTERIE_EXTENDED_FIELDS.annual_payroll,
      COTERIE_EXTENDED_FIELDS.business_start_month,
    );
  }
  if (hasBop) {
    fields.push(
      COTERIE_EXTENDED_FIELDS.location_type,
      COTERIE_EXTENDED_FIELDS.bpp_deductible,
      COTERIE_EXTENDED_FIELDS.bpp_limit,
      COTERIE_EXTENDED_FIELDS.building_limit,
    );
  }
  if (hasGl) {
    const glLimitField = {
      ...COTERIE_EXTENDED_FIELDS.gl_limit,
      options: filterGlLimitOptions(segment, state),
    };
    const defaultGl =
      glLimitField.options.find((o) => o.value === glLimitField.default)?.value ||
      glLimitField.options[glLimitField.options.length - 1]?.value ||
      "1000000";
    glLimitField.default = defaultGl;
    fields.push(
      glLimitField,
      {
        ...COTERIE_EXTENDED_FIELDS.gl_aggregate_limit,
        options: filterGlAggregateOptions(segment, state, defaultGl),
      },
    );
  }
  fields.push(COTERIE_EXTENDED_FIELDS.policy_start_date);

  return {
    segment,
    businessClass: entry?.key || businessClassKey,
    businessClassLabel: entry?.label || businessClassKey,
    isOwner: !nonOwner,
    ownerOnly: !!entry?.ownerOnly,
    coverage,
    fields,
    sections: {
      rating: needsRating,
      bop: hasBop,
      gl: hasGl,
      policy: true,
    },
  };
}

export function listIntakeSchemasForSegment(segment) {
  return listBusinessClasses(segment)
    .filter((c) => !c.prohibited && c.akHash)
    .map((c) => ({
      key: c.key,
      label: c.label,
      owner: resolveIntakeSchema(segment, c.key, { isOwner: true }),
      nonOwner: resolveIntakeSchema(segment, c.key, { isOwner: false }),
    }));
}

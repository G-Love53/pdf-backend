import { resolveRegistryEntry, listBusinessClasses } from "./coterieRegistry.js";

/** Coterie bindable fields exposed on ConnectQuote (investor / real-quote mode). */
export const COTERIE_EXTENDED_FIELDS = {
  gross_annual_sales: {
    name: "gross_annual_sales",
    label: "Gross annual sales / revenue",
    type: "select",
    coterieKey: "grossAnnualSales",
    section: "bop",
    options: [
      { value: "75000", label: "Under $100,000" },
      { value: "150000", label: "$100,000 – $250,000" },
      { value: "350000", label: "$250,000 – $500,000" },
      { value: "750000", label: "$500,000 – $1M" },
      { value: "1500000", label: "Over $1M" },
    ],
    default: "150000",
    prefillParam: "sales",
  },
  annual_payroll: {
    name: "annual_payroll",
    label: "Annual payroll",
    type: "select",
    coterieKey: "annualPayroll",
    section: "bop",
    options: [
      { value: "25000", label: "Under $50,000" },
      { value: "75000", label: "$50,000 – $100,000" },
      { value: "150000", label: "$100,000 – $250,000" },
      { value: "350000", label: "$250,000 – $500,000" },
      { value: "750000", label: "Over $500,000" },
    ],
    default: "75000",
    prefillParam: "payroll",
  },
  business_age_years: {
    name: "business_age_years",
    label: "Years in business",
    type: "select",
    coterieKey: "businessAgeInMonths",
    section: "bop",
    options: [
      { value: "6", label: "Less than 1 year" },
      { value: "18", label: "1 – 2 years" },
      { value: "36", label: "2 – 5 years" },
      { value: "84", label: "5 – 10 years" },
      { value: "120", label: "10+ years" },
    ],
    default: "36",
    prefillParam: "age",
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
  gl_limit: {
    name: "gl_limit",
    label: "GL each occurrence limit",
    type: "select",
    coterieKey: "glLimit",
    section: "gl",
    options: [
      { value: "1000000", label: "$1,000,000" },
      { value: "2000000", label: "$2,000,000" },
    ],
    default: "1000000",
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

function isNonOwner(isOwner) {
  return (
    isOwner === false ||
    isOwner === "no" ||
    String(isOwner).toLowerCase() === "false"
  );
}

/** Coverage toggles + extras for a registry row. */
export function getCoverageOptions(entry, { isOwner = true } = {}) {
  if (!entry || entry.prohibited) {
    return { instant: [], extras: [] };
  }

  const nonOwner = isNonOwner(isOwner);

  if (nonOwner) {
    const types = entry.employeeApplicationTypes || ["GL"];
    return {
      instant: types.map((id) => ({
        id,
        label:
          id === "BOP"
            ? "Businessowners Policy (BOP)"
            : "General liability (GL)",
        defaultOn: true,
        required: true,
      })),
      extras: entry.extras?.employee || entry.extras?.nonOwner || [],
    };
  }

  const configured = entry.coverage?.owner?.options;
  if (configured?.length) {
    return {
      instant: configured,
      extras: entry.coverage?.owner?.extras || entry.extras?.owner || [],
    };
  }

  const defaults = entry.defaultApplicationTypes || ["BOP"];
  return {
    instant: defaults.map((id, i) => ({
      id,
      label:
        id === "BOP"
          ? "Businessowners Policy (BOP)"
          : "General liability (GL)",
      defaultOn: true,
      required: defaults.length === 1,
    })),
    extras: entry.extras?.owner || [],
  };
}

export function resolveIntakeSchema(segment, businessClassKey, { isOwner = true } = {}) {
  const entry = resolveRegistryEntry(segment, businessClassKey);
  const coverage = getCoverageOptions(entry, { isOwner });
  const nonOwner = isNonOwner(isOwner);

  const instantIds = coverage.instant.map((c) => c.id);

  const fields = [];
  if (instantIds.includes("BOP") && !nonOwner) {
    fields.push(
      COTERIE_EXTENDED_FIELDS.gross_annual_sales,
      COTERIE_EXTENDED_FIELDS.annual_payroll,
      COTERIE_EXTENDED_FIELDS.business_age_years,
      COTERIE_EXTENDED_FIELDS.bpp_deductible,
    );
  }
  if (instantIds.includes("GL")) {
    fields.push(
      COTERIE_EXTENDED_FIELDS.gl_limit,
      COTERIE_EXTENDED_FIELDS.gl_aggregate_limit,
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
      bop: instantIds.includes("BOP") && !nonOwner,
      gl: instantIds.includes("GL"),
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

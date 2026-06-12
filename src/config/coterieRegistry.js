/**
 * ConnectQuote registry — segment group + business-class dropdown.
 * Source: Coterie AKHash workbook (local ops copy).
 */

export const COTERIE_BUSINESS_CLASSES = {
  electrical: [
    {
      key: "electric_contracting",
      label: "Electrical contracting (primary work)",
      akHash: "1520d13449f07456570fa1048b4bd7c4",
      defaultApplicationTypes: ["BOP"],
      ownerOnly: true,
    },
    {
      key: "solar",
      label: "Solar installation (not eligible for instant quote)",
      akHash: null,
      prohibited: true,
    },
  ],
  fitness: [
    {
      key: "yoga_studio",
      label: "Yoga studio",
      akHash: "dc8a2c208bfed26ce3cc102f929bf557",
      /** Workbook: BOP off / GL off — GL-only instant; PL via traditional if needed. */
      defaultApplicationTypes: ["GL"],
      employeeApplicationTypes: ["GL"],
    },
    {
      key: "pilates_studio",
      label: "Pilates / mind-body studio",
      akHash: "96811230e7feec657c12dc32b6910a60",
      defaultApplicationTypes: ["BOP", "GL"],
      employeeApplicationTypes: ["GL"],
    },
    {
      key: "personal_trainer",
      label: "Personal trainer / fitness instructor",
      akHash: "39c33b2f8fe71a4716f92728aba92278",
      defaultApplicationTypes: ["GL"],
      employeeApplicationTypes: ["GL"],
    },
  ],
};

export function listBusinessClasses(segment) {
  return COTERIE_BUSINESS_CLASSES[segment] || [];
}

export function resolveRegistryEntry(segment, businessClassKey) {
  const list = listBusinessClasses(segment);
  const key = String(businessClassKey || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
  return list.find((row) => row.key === key) || null;
}

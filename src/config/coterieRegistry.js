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

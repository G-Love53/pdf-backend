const SEGMENT_BRANDING = {
  bar: {
    segmentColor: "#c8a44e",
    segmentIcon: "B",
    segmentBrandName: "Bar Insurance Direct",
    segmentDomain: "barinsurancedirect.com",
    segmentDisplayName: "Bar & Restaurant",
    logoPath: null,
  },
  roofer: {
    segmentColor: "#e87a2e",
    segmentIcon: "R",
    segmentBrandName: "Roofing Contractor Insurance Direct",
    segmentDomain: "roofingcontractorinsurancedirect.com",
    segmentDisplayName: "Roofing Contractor",
    logoPath: null,
  },
  plumber: {
    segmentColor: "#3b82f6",
    segmentIcon: "P",
    segmentBrandName: "Plumber Insurance Direct",
    segmentDomain: "plumberinsurancedirect.com",
    segmentDisplayName: "Plumber",
    logoPath: null,
  },
  hvac: {
    segmentColor: "#0ea5a5",
    segmentIcon: "H",
    segmentBrandName: "HVAC Insurance Direct",
    segmentDomain: "hvacinsurancedirect.com",
    segmentDisplayName: "HVAC Contractor",
    logoPath: null,
  },
  fitness: {
    segmentColor: "#16a34a",
    segmentIcon: "F",
    segmentBrandName: "Fitness Insurance Direct",
    segmentDomain: "fitnessinsurancedirect.com",
    segmentDisplayName: "Fitness Facility",
    logoPath: null,
  },
};

export function getSegmentBranding(segment) {
  return SEGMENT_BRANDING[String(segment || "bar").toLowerCase()] || SEGMENT_BRANDING.bar;
}

export { SEGMENT_BRANDING };


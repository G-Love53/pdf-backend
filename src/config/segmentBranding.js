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
    segmentColor: "#ea580c",
    segmentIcon: "P",
    segmentBrandName: "Plumber Insurance Direct",
    segmentDomain: "plumberinsurancedirect.com",
    segmentDisplayName: "Plumber",
    logoPath: null,
  },
  hvac: {
    segmentColor: "#ea580c",
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
  electrical: {
    segmentColor: "#eab308",
    segmentIcon: "E",
    segmentBrandName: "Electrical Insurance Direct",
    segmentDomain: "electricalinsurancedirect.com",
    segmentDisplayName: "Electrical Contractor",
    logoPath: null,
  },
  beauty: {
    segmentColor: "#ea580c",
    segmentIcon: "B",
    segmentBrandName: "Beauty Insurance Direct",
    segmentDomain: "beautyinsurancedirect.com",
    segmentDisplayName: "Beauty & Personal Care",
    logoPath: null,
  },
  cleaning: {
    segmentColor: "#ea580c",
    segmentIcon: "C",
    segmentBrandName: "Cleaning Insurance Direct",
    segmentDomain: "cleaninginsurancedirect.com",
    segmentDisplayName: "Cleaning Services",
    logoPath: null,
  },
  pet: {
    segmentColor: "#ea580c",
    segmentIcon: "P",
    segmentBrandName: "Pet Service Insurance Direct",
    segmentDomain: "petserviceinsurancedirect.com",
    segmentDisplayName: "Pet Services",
    logoPath: null,
  },
  painter: {
    segmentColor: "#ff8c1a",
    segmentIcon: "N",
    segmentBrandName: "Painter Insurance Direct",
    segmentDomain: "painterinsurancedirect.com",
    segmentDisplayName: "Painting Contractor",
    logoPath: null,
  },
};

export function getSegmentBranding(segment) {
  return SEGMENT_BRANDING[String(segment || "bar").toLowerCase()] || SEGMENT_BRANDING.bar;
}

export { SEGMENT_BRANDING };


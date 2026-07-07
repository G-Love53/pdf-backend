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
      coverage: {
        owner: {
          selection: "one",
          options: [
            {
              id: "BOP",
              label: "Businessowners Policy (BOP)",
              defaultOn: true,
              required: true,
            },
            {
              id: "GL",
              label: "General liability only",
              defaultOn: false,
            },
          ],
        },
      },
    },
    {
      key: "solar",
      label: "Solar installation (not eligible for instant quote)",
      akHash: null,
      prohibited: true,
    },
  ],
  plumber: [
    {
      key: "plumbing_contractor",
      label: "Plumbing contracting (primary work)",
      akHash: "b977fc92dc7b5436e7a79c5df4f7d9f9",
      defaultApplicationTypes: ["BOP"],
      ownerOnly: true,
      appetiteKnockouts: [
        {
          id: "new_construction",
          question: "New building or ground-up construction?",
        },
        {
          id: "underground_6ft",
          question: "Work more than 6 feet underground?",
        },
        { id: "medical_gas", question: "Medical gas line work?" },
        {
          id: "gc_or_paper",
          question:
            "General contractor, developer, construction PM, or paper contractor (100% subcontracted)?",
        },
        {
          id: "subs_over_50",
          question: "Subcontractor cost more than 50% of annual revenue?",
        },
        { id: "equipment_rental", question: "Equipment rental to others?" },
        {
          id: "exterior_3_story",
          question: "Exterior work over 3 stories?",
        },
        { id: "airport_work", question: "Work performed on airport premises?" },
      ],
      coverage: {
        owner: {
          selection: "one",
          options: [
            {
              id: "BOP",
              label: "Businessowners Policy (BOP)",
              defaultOn: true,
              required: true,
            },
            {
              id: "GL",
              label: "General liability only",
              defaultOn: false,
            },
          ],
        },
      },
    },
  ],
  hvac: [
    {
      key: "hvac_contractor",
      label: "HVAC contracting (primary work)",
      akHash: "3cdfc10ad6660692a3f77f6a4e3825b4",
      defaultApplicationTypes: ["BOP"],
      ownerOnly: true,
      coverage: {
        owner: {
          selection: "one",
          options: [
            {
              id: "BOP",
              label: "Businessowners Policy (BOP)",
              defaultOn: true,
              required: true,
            },
            {
              id: "GL",
              label: "General liability only",
              defaultOn: false,
            },
          ],
        },
      },
    },
  ],
  fitness: [
    {
      key: "yoga_studio",
      label: "Yoga studio",
      akHash: "dc8a2c208bfed26ce3cc102f929bf557",
      defaultApplicationTypes: ["GL"],
      employeeApplicationTypes: ["GL"],
      coverage: {
        owner: {
          options: [
            {
              id: "GL",
              label: "General liability (GL)",
              defaultOn: true,
              required: true,
            },
          ],
        },
      },
    },
    {
      key: "pilates_studio",
      label: "Pilates / mind-body studio",
      akHash: "96811230e7feec657c12dc32b6910a60",
      defaultApplicationTypes: ["BOP"],
      employeeApplicationTypes: ["GL"],
      coverage: {
        owner: {
          selection: "many",
          options: [
            {
              id: "BOP",
              label: "Businessowners Policy (BOP)",
              defaultOn: true,
            },
            {
              id: "GL",
              label: "General liability (GL)",
              defaultOn: false,
            },
          ],
        },
      },
    },
    {
      key: "personal_trainer",
      label: "Personal trainer / fitness instructor",
      akHash: "39c33b2f8fe71a4716f92728aba92278",
      defaultApplicationTypes: ["GL"],
      employeeApplicationTypes: ["GL"],
      coverage: {
        owner: {
          options: [
            {
              id: "GL",
              label: "General liability (GL)",
              defaultOn: true,
              required: true,
            },
          ],
        },
      },
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

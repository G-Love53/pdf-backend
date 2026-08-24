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
  beauty: [
    {
      key: "hair_salon",
      label: "Hair salon / beauty shop",
      akHash: "b50d64f01419e62603cccb1e17249c5e",
      defaultApplicationTypes: ["BOP"],
      employeeApplicationTypes: ["GL"],
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
      key: "barber_shop",
      label: "Barber shop",
      akHash: "94d267f1d06212835761d6fbf6c67619",
      defaultApplicationTypes: ["BOP"],
      employeeApplicationTypes: ["GL"],
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
      key: "nail_salon",
      label: "Nail salon",
      akHash: "2e98be8563bdf7ec2dcfff196d8eb8d9",
      defaultApplicationTypes: ["BOP"],
      employeeApplicationTypes: ["GL"],
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
      key: "esthetician",
      label: "Esthetician / skin care",
      akHash: "1c42c5afe9ed0e7d75a7dd041fe7dcb0",
      defaultApplicationTypes: ["BOP"],
      employeeApplicationTypes: ["GL"],
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
  cleaning: [
    {
      key: "home_cleaning",
      label: "Home / residential cleaning",
      akHash: "bf7a1d00b682b407747c005f3d6eb644",
      defaultApplicationTypes: ["BOP"],
      employeeApplicationTypes: ["GL"],
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
      key: "carpet_cleaning",
      label: "Carpet / upholstery cleaning",
      akHash: "250f33d275377510389ad2c9e24863e4",
      defaultApplicationTypes: ["BOP"],
      employeeApplicationTypes: ["GL"],
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
  painter: [
    {
      key: "painting_contractor",
      label: "Painting contracting (except roof — primary work)",
      akHash: "b8a05e6eaa436028e5348ad732317156",
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
      key: "roof_painting",
      label: "Roof painting / coating (not eligible for instant quote)",
      akHash: null,
      prohibited: true,
    },
  ],
  pet: [
    {
      key: "pet_grooming",
      label: "Pet grooming",
      akHash: "84f0c9c2999638e1533a06a41415f2be",
      defaultApplicationTypes: ["BOP"],
      employeeApplicationTypes: ["GL"],
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
      key: "pet_sitting",
      label: "Pet sitting / boarding",
      akHash: "7ac0ae0270657fecf5ed809b28ef15a2",
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

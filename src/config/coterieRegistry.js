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
          options: [
            {
              id: "BOP",
              label: "Businessowners Policy (BOP)",
              defaultOn: true,
              required: true,
            },
            {
              id: "GL",
              label: "General liability (add-on)",
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
          extras: [
            {
              id: "PL",
              label: "Professional liability",
              instant: false,
              message:
                "Professional liability is not on Coterie instant bind for yoga yet — use our full application for PL quotes.",
            },
          ],
        },
      },
      extras: {
        nonOwner: [
          {
            id: "PL",
            label: "Professional liability",
            instant: false,
            message:
              "Professional liability is not on Coterie instant bind for yoga yet — use our full application for PL quotes.",
          },
        ],
      },
    },
    {
      key: "pilates_studio",
      label: "Pilates / mind-body studio",
      akHash: "96811230e7feec657c12dc32b6910a60",
      defaultApplicationTypes: ["BOP", "GL"],
      employeeApplicationTypes: ["GL"],
      coverage: {
        owner: {
          options: [
            {
              id: "BOP",
              label: "Businessowners Policy (BOP)",
              defaultOn: true,
            },
            {
              id: "GL",
              label: "General liability (GL)",
              defaultOn: true,
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

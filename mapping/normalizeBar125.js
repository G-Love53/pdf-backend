// segments/bar/normalizeBar125.js
const money = s => (typeof s === 'string' ? Number(s.replace(/[^0-9.\-]+/g,'')) || 0 : Number(s) || 0);
const yn = v => (v === 'Yes' ? true : v === 'No' ? false : undefined);
const chk = v => v === 'Yes';

export function normalizeBar125(form) {
  // --- Named insured & location
  const namedInsured = {
    legalName: form.applicant_name || '',
    mailAddress1: form.premise_address || '',
    city: form.premise_city || '',
    state: form.premise_state || '',
    zip: form.premise_zip || ''
  };

  const food = money(form.food_sales);
  const alcohol = money(form.alcohol_sales);
  const total = money(form.total_sales) || (food + alcohol);

  // --- Solid Fuel & ops rollup → build ONE printable string for Page 2 “Description of Primary Operations”
  const opsChunks = [];

  // Basic labeling (fine dining / counter)
  if (yn(form.fine_dining) === true) opsChunks.push('Fine dining');
  if (yn(form.counter_service) === true) opsChunks.push('Counter service');

  // Hours
  if (form.closing_time) opsChunks.push(`Closes ${form.closing_time}`);

  // Alcohol / cannabis
  if (yn(form.alcohol_manufactured) !== undefined) {
    opsChunks.push(yn(form.alcohol_manufactured) ? 'Brews/distills on-site' : 'No on-site manufacturing');
    if (yn(form.percent_consumed) !== undefined) {
      opsChunks.push(yn(form.percent_consumed) ? '>25% consumed on premises' : '≤25% consumed on premises');
    }
  }
  if (yn(form.infused_with_cannabis) !== undefined) {
    opsChunks.push(yn(form.infused_with_cannabis) ? 'Cannabis-infused items present' : 'No cannabis infusion');
  }

  // Cooking level
  const cooking = [];
  if (chk(form.cooking_level_full)) cooking.push('Full cooking');
  if (chk(form.cooking_level_limited)) cooking.push('Limited cooking');
  if (chk(form.cooking_level_non)) cooking.push('No cooking');
  if (cooking.length) opsChunks.push(`Cooking: ${cooking.join(', ')}`);

  // 🔥 Solid fuel (Smoker/Grill) summary — this is what UWs scan for
  if (yn(form.solid_fuel) !== undefined) {
    const parts = [];
    parts.push(yn(form.solid_fuel) ? 'Solid fuel cooking (smoker/grill) within 10 ft' : 'No solid fuel cooking');
    if (yn(form.solid_fuel)) {
      if (yn(form.professionally_installed) !== undefined) {
        parts.push(yn(form.professionally_installed) ? 'professionally installed' : 'not professionally installed');
      }
      if (yn(form.regularly_maintained) !== undefined) {
        const maint = [];
        maint.push(yn(form.regularly_maintained) ? 'regular maintenance' : 'no regular maintenance');
        if (chk(form.cleaned_scraped_weekly)) maint.push('cleaned/scraped weekly');
        if (chk(form.vent_cleaned_monthly)) maint.push('vent cleaned monthly');
        if (chk(form.ashes_removed_daily)) maint.push('ashes removed daily');
        parts.push(maint.join('; '));
      }
      if (yn(form.storage_10_feet) !== undefined) {
        parts.push(yn(form.storage_10_feet) ? 'fuel stored >10 ft away' : 'fuel stored ≤10 ft');
      }
      if (yn(form.hood_ul300) !== undefined) {
        parts.push(yn(form.hood_ul300) ? 'hood + UL300 present' : 'no UL300');
      }
      if (yn(form.fire_extinguisher_20_feet) !== undefined) {
        parts.push(yn(form.fire_extinguisher_20_feet) ? 'Class K / 2A within 20 ft' : 'no Class K / 2A within 20 ft');
      }
      if (yn(form.non_UL300) === true) parts.push('non-UL300 surfaces present');
    }
    opsChunks.push(parts.join('; '));
  }

  // Entertainment / recreational add-ons
  if (yn(form.entertainment_other) === true && form.entertainment_details) {
    opsChunks.push(`Entertainment: ${form.entertainment_details}`);
  }
  if (yn(form.recreational_activites) === true && form.recreational_details) {
    opsChunks.push(`Activities: ${form.recreational_details}`);
  }

  const primaryOps = opsChunks.filter(Boolean).join(' • ');

  return {
    schemaVersion: '1.0.0',
    namedInsured,
    contacts: { primary: { email: form.contact_email || '' } },
    effectiveDate: form.effective_date || '',
    businessPhone: form.business_phone || '',
    website: form.premises_website || '',
    business: {
      entityType: chk(form.org_type_llc) ? 'LLC'
              : chk(form.org_type_corporation) ? 'CORPORATION'
              : chk(form.org_type_individual) ? 'INDIVIDUAL'
              : undefined,
      description: primaryOps             // <— feed Page 2 “Description of Primary Operations”
    },
    locations: [{
      address1: namedInsured.mailAddress1,
      city: namedInsured.city, state: namedInsured.state, zip: namedInsured.zip,
      revenue: total || undefined,
      occupiedArea: form.square_footage || '',
      sprinklered: yn(form.automatic_sprinkler),
      fullTimeEmployees: form.num_employees ? Number(form.num_employees) || '' : ''
    }],
    // LOB defaults for bars (Page 1)
    commercialGeneralLiability: true,
    liquorLiability: true,
    commercialProperty: true,
    umbrella: true,
    sales: { food, alcohol, total }
  };
}

function cleanPhone(raw) {
  if (!raw) return null;
  const digits = String(raw).replace(/\D+/g, '');
  return digits || null;
}

export function normalize(apolloContact) {
  return {
    email: apolloContact.email || null,
    business_name: apolloContact.organization?.name || null,
    segment: null, // set by campaign config, not Apollo data
    first_name: apolloContact.first_name || null,
    last_name: apolloContact.last_name || null,
    phone: cleanPhone(apolloContact.phone_numbers?.[0]?.sanitized_number),
    address: apolloContact.organization?.street_address || null,
    city: apolloContact.organization?.city || null,
    state: apolloContact.organization?.state || null,
    zip: apolloContact.organization?.postal_code || null,
    data_source: 'apollo',
    source_id: apolloContact.id || null,
    website: apolloContact.organization?.website_url || null,
    employee_count: apolloContact.organization?.estimated_num_employees ?? null,
    annual_revenue: apolloContact.organization?.annual_revenue ?? null,
    license_number: null,
    license_expiry: null,
    years_in_business: null,
  };
}


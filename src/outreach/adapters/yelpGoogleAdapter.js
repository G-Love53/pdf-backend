function cleanPhone(raw) {
  if (!raw) return null;
  const digits = String(raw).replace(/\D+/g, '');
  return digits || null;
}

export function normalize(record) {
  return {
    email: record.email || null, // often missing from directory listings
    business_name: record.name || null,
    segment: null,
    first_name: null,
    last_name: null,
    phone: cleanPhone(record.phone),
    address: record.address || null,
    city: record.city || null,
    state: record.state || null,
    zip: record.zip || null,
    data_source: record.source || 'directory',
    source_id: record.place_id || record.yelp_id || null,
    website: record.website || null,
    employee_count: null,
    annual_revenue: null,
    license_number: null,
    license_expiry: null,
    years_in_business: null,
  };
}


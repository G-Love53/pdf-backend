const DEFAULT_COLUMN_MAP = {
  email: ['email', 'email_address', 'e-mail', 'contact_email'],
  business_name: ['business_name', 'company', 'company_name', 'business', 'dba'],
  first_name: ['first_name', 'first', 'fname', 'contact_first'],
  last_name: ['last_name', 'last', 'lname', 'contact_last'],
  phone: ['phone', 'phone_number', 'telephone', 'mobile'],
  address: ['address', 'street', 'street_address', 'address1'],
  city: ['city', 'town'],
  state: ['state', 'st', 'province'],
  zip: ['zip', 'zipcode', 'zip_code', 'postal_code'],
};

function cleanPhone(raw) {
  if (!raw) return null;
  const digits = String(raw).replace(/\D+/g, '');
  return digits || null;
}

export function normalize(record, columnMap = DEFAULT_COLUMN_MAP) {
  const resolved = {};

  for (const [field, possibleColumns] of Object.entries(columnMap)) {
    for (const col of possibleColumns) {
      if (record[col] !== undefined && record[col] !== null && record[col] !== '') {
        resolved[field] = record[col];
        break;
      }
    }
  }

  return {
    email: resolved.email || null,
    business_name: resolved.business_name || null,
    segment: null,
    first_name: resolved.first_name || null,
    last_name: resolved.last_name || null,
    phone: cleanPhone(resolved.phone),
    address: resolved.address || null,
    city: resolved.city || null,
    state: resolved.state || null,
    zip: resolved.zip || null,
    data_source: 'manual',
    source_id: null,
    website: null,
    employee_count: null,
    annual_revenue: null,
    license_number: null,
    license_expiry: null,
    years_in_business: null,
  };
}


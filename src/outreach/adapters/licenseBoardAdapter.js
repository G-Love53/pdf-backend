function cleanPhone(raw) {
  if (!raw) return null;
  const digits = String(raw).replace(/\D+/g, '');
  return digits || null;
}

function parseNameFirst(fullName) {
  if (!fullName) return null;
  const parts = String(fullName).trim().split(/\s+/);
  return parts[0] || null;
}

function parseNameLast(fullName) {
  if (!fullName) return null;
  const parts = String(fullName).trim().split(/\s+/);
  if (parts.length < 2) return null;
  return parts[parts.length - 1];
}

export function normalize(record) {
  return {
    email: record.email || null, // often missing — may need enrichment
    business_name: record.business_name || record.dba || null,
    segment: null, // set by campaign config
    first_name: record.first_name || parseNameFirst(record.full_name) || null,
    last_name: record.last_name || parseNameLast(record.full_name) || null,
    phone: cleanPhone(record.phone),
    address: record.address || null,
    city: record.city || null,
    state: record.state || null,
    zip: record.zip || null,
    data_source: 'license_board',
    source_id: record.license_number || null,
    website: null,
    employee_count: null,
    annual_revenue: null,
    license_number: record.license_number || null,
    license_expiry: record.expiration_date || null,
    years_in_business: null,
  };
}


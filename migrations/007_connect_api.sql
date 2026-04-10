-- Connect API bridge: identity mapping + carrier KB + COI/claims for cid-postgres
-- Run against Render DATABASE_URL (cid-postgres).

-- -----------------------------------------------------------------------------
-- 1) Map Supabase auth user UUID → clients row (lazy backfill from Connect headers)
-- -----------------------------------------------------------------------------
ALTER TABLE clients ADD COLUMN IF NOT EXISTS famous_user_id UUID;
CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_famous_user_id
  ON clients (famous_user_id)
  WHERE famous_user_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 2) Carriers + knowledge (chat / upsell grounding)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS carriers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(200) NOT NULL,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS carrier_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  carrier_slug VARCHAR(50) NOT NULL REFERENCES carriers (slug),
  category VARCHAR(50) NOT NULL,
  filename VARCHAR(500) NOT NULL,
  r2_path VARCHAR(1000) NOT NULL,
  file_type VARCHAR(20) NOT NULL,
  segments TEXT[] DEFAULT '{}',
  status VARCHAR(20) DEFAULT 'uploaded',
  page_count INTEGER,
  uploaded_by VARCHAR(200),
  uploaded_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS carrier_knowledge (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  carrier_slug VARCHAR(50) NOT NULL REFERENCES carriers (slug),
  document_id UUID REFERENCES carrier_documents (id),
  category VARCHAR(50) NOT NULL,
  topic VARCHAR(500) NOT NULL,
  content TEXT NOT NULL,
  segment VARCHAR(20),
  tags TEXT[] DEFAULT '{}',
  source_label VARCHAR(500),
  is_published BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_carrier_knowledge_search
  ON carrier_knowledge
  USING gin (to_tsvector('english', topic || ' ' || content));

CREATE INDEX IF NOT EXISTS idx_carrier_knowledge_carrier ON carrier_knowledge (carrier_slug);
CREATE INDEX IF NOT EXISTS idx_carrier_knowledge_segment ON carrier_knowledge (segment);
CREATE INDEX IF NOT EXISTS idx_carrier_knowledge_category ON carrier_knowledge (category);
CREATE INDEX IF NOT EXISTS idx_carrier_knowledge_published ON carrier_knowledge (is_published);

CREATE TABLE IF NOT EXISTS carrier_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  carrier_slug VARCHAR(50) NOT NULL REFERENCES carriers (slug),
  role VARCHAR(100) NOT NULL,
  name VARCHAR(200),
  email VARCHAR(200),
  phone VARCHAR(50),
  department VARCHAR(200),
  segments TEXT[] DEFAULT '{}',
  notes TEXT,
  active BOOLEAN DEFAULT true,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 3) COI + claims (Connect → cid-postgres; segment backends may still be notified separately)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS coi_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients (client_id) ON DELETE RESTRICT,
  policy_id UUID NOT NULL REFERENCES policies (id) ON DELETE RESTRICT,
  request_number VARCHAR(80) NOT NULL,
  certificate_holder_name VARCHAR(500) NOT NULL,
  certificate_holder_address TEXT,
  certificate_holder_city VARCHAR(200),
  certificate_holder_state VARCHAR(20),
  certificate_holder_zip VARCHAR(20),
  delivery_email VARCHAR(255),
  certificate_type VARCHAR(80) DEFAULT 'standard',
  additional_instructions TEXT,
  uploaded_file_path VARCHAR(1000),
  uploaded_file_name VARCHAR(500),
  status VARCHAR(30) NOT NULL DEFAULT 'submitted',
  generated_pdf_url VARCHAR(2000),
  segment VARCHAR(50),
  backend_notified BOOLEAN DEFAULT false,
  backend_response JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_coi_requests_client ON coi_requests (client_id);
CREATE INDEX IF NOT EXISTS idx_coi_requests_policy ON coi_requests (policy_id);

CREATE TABLE IF NOT EXISTS claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients (client_id) ON DELETE RESTRICT,
  policy_id UUID NOT NULL REFERENCES policies (id) ON DELETE RESTRICT,
  claim_number VARCHAR(80) NOT NULL,
  segment VARCHAR(50),
  incident_date DATE,
  incident_location TEXT,
  description TEXT NOT NULL,
  claim_type VARCHAR(100),
  estimated_amount NUMERIC(12, 2),
  settlement_amount NUMERIC(12, 2),
  settlement_date DATE,
  third_party_name VARCHAR(255),
  third_party_contact VARCHAR(255),
  photos JSONB DEFAULT '[]'::jsonb,
  status VARCHAR(40) NOT NULL DEFAULT 'submitted',
  notes TEXT,
  assigned_to UUID,
  assigned_at TIMESTAMPTZ,
  backend_notified BOOLEAN DEFAULT false,
  backend_response JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_connect_claims_client ON claims (client_id);
CREATE INDEX IF NOT EXISTS idx_connect_claims_policy ON claims (policy_id);

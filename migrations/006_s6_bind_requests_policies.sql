DROP TABLE IF EXISTS policies CASCADE;
DROP TABLE IF EXISTS bind_requests CASCADE;

CREATE TABLE bind_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID NOT NULL REFERENCES quotes(quote_id),
  packet_id UUID NOT NULL REFERENCES quote_packets(packet_id),
  document_id UUID REFERENCES documents(document_id),
  signed_document_id UUID REFERENCES documents(document_id),
  hellosign_request_id VARCHAR(255),
  signer_name VARCHAR(255) NOT NULL,
  signer_email VARCHAR(255) NOT NULL,
  payment_method VARCHAR(20) NOT NULL DEFAULT 'annual',
  status VARCHAR(30) NOT NULL DEFAULT 'awaiting_signature',
  agent_notes TEXT,
  initiated_by UUID,
  initiated_at TIMESTAMPTZ,
  viewed_at TIMESTAMPTZ,
  signed_at TIMESTAMPTZ,
  declined_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancel_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_bind_requests_quote_id ON bind_requests(quote_id);
CREATE INDEX idx_bind_requests_status ON bind_requests(status);
CREATE INDEX idx_bind_requests_hellosign ON bind_requests(hellosign_request_id);

CREATE TABLE policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_number VARCHAR(50) UNIQUE NOT NULL,
  submission_id UUID NOT NULL REFERENCES submissions(submission_id),
  quote_id UUID NOT NULL REFERENCES quotes(quote_id),
  bind_request_id UUID NOT NULL REFERENCES bind_requests(id),
  client_id UUID NOT NULL REFERENCES clients(client_id),
  segment VARCHAR(50) NOT NULL,
  carrier_name VARCHAR(255) NOT NULL,
  policy_type VARCHAR(50) NOT NULL,
  annual_premium NUMERIC(12,2) NOT NULL,
  payment_method VARCHAR(20) NOT NULL DEFAULT 'annual',
  effective_date DATE NOT NULL,
  expiration_date DATE NOT NULL,
  coverage_data JSONB NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  bound_at TIMESTAMPTZ NOT NULL,
  bound_by UUID,
  cancelled_at TIMESTAMPTZ,
  renewed_from_policy_id UUID REFERENCES policies(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_policies_client_id ON policies(client_id);
CREATE INDEX idx_policies_segment ON policies(segment);
CREATE INDEX idx_policies_status ON policies(status);
CREATE INDEX idx_policies_expiration ON policies(expiration_date);
CREATE INDEX idx_policies_policy_number ON policies(policy_number);

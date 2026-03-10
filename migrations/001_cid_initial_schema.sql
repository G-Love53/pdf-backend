-- =============================================================================
-- CID Quote Workflow Platform
-- Migration: 001_cid_initial_schema.sql
-- Description: Full V1 schema - all 12 tables, constraints, indexes
-- Stack: Node / Render / Netlify / GitHub
-- Segments: bar | roofer | plumber | hvac
-- =============================================================================
-- Run order is dependency-safe. Do not reorder.
-- Apply with: psql $DATABASE_URL -f 001_cid_initial_schema.sql
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- EXTENSIONS
-- ---------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "citext";     -- case-insensitive email lookups


-- ---------------------------------------------------------------------------
-- ENUMS
-- ---------------------------------------------------------------------------

CREATE TYPE segment_type AS ENUM (
  'bar',
  'roofer',
  'plumber',
  'hvac'
);

CREATE TYPE submission_status AS ENUM (
  'received',
  'under_review_gate1',
  'approved_for_market',
  'rejected',
  'sent_to_carrier',
  'quote_received',
  'packet_in_review',
  'sent_to_client',
  'accepted',
  'bound',
  'issued',
  'closed_lost'
);

CREATE TYPE quote_status AS ENUM (
  'received',
  'unmatched',
  'match_review',
  'matched',
  'extracting',
  'needs_review',
  'packet_ready',
  'sent',
  'accepted',
  'declined'
);

CREATE TYPE match_status_type AS ENUM (
  'auto_matched',
  'review_required',
  'unmatched',
  'manually_matched'
);

CREATE TYPE review_status_type AS ENUM (
  'pending',
  'in_review',
  'approved',
  'flagged'
);

CREATE TYPE queue_type AS ENUM (
  'submission_review',
  'quote_match_review',
  'quote_unmatched',
  'extraction_review',
  'extraction_failed',
  'packet_review',
  'signature_followup',
  'duplicate_quote'
);

CREATE TYPE queue_status AS ENUM (
  'open',
  'in_progress',
  'resolved',
  'dismissed'
);

CREATE TYPE direction_type AS ENUM (
  'inbound',
  'outbound'
);

CREATE TYPE document_type AS ENUM (
  'pdf',
  'json',
  'image',
  'other'
);

CREATE TYPE document_role AS ENUM (
  'carrier_quote_original',
  'sales_letter_generated',
  'coverage_summary_generated',
  'quote_packet_sent',
  'signed_acceptance',
  'application_original',
  'bind_request_sent',
  'policy_original',
  'declarations_original',
  'signed_bind_docs',
  'coi_generated',
  'timeline_export',
  'other'
);

CREATE TYPE storage_provider AS ENUM (
  'r2',
  's3'
);

CREATE TYPE actor_type AS ENUM (
  'system',
  'agent',
  'client',
  'carrier',
  'automation',
  'signature_service',
  'signature_webhook'
);

CREATE TYPE policy_status AS ENUM (
  'pending',
  'active',
  'expired',
  'cancelled'
);

CREATE TYPE packet_status AS ENUM (
  'draft',
  'approved',
  'sent',
  'superseded'
);

CREATE TYPE signature_event_type AS ENUM (
  'quote_acceptance',
  'bind_docs',
  'application_attestation'
);


-- =============================================================================
-- TABLE 1: clients
-- True person/account identity. One record per individual.
-- primary_email is the operational lookup key for V1.
-- client_id UUID is the true primary key - never exposed in URLs.
-- =============================================================================

CREATE TABLE clients (
  client_id       UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  primary_email   CITEXT        NOT NULL,   -- case-insensitive unique lookup
  primary_phone   VARCHAR(20),
  first_name      VARCHAR(100),
  last_name       VARCHAR(100),
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT clients_primary_email_unique UNIQUE (primary_email)
);

COMMENT ON TABLE  clients IS 'True person/account identity. One record per individual regardless of segment or business count.';
COMMENT ON COLUMN clients.client_id     IS 'True primary key. System-assigned UUID. Never exposed in URLs.';
COMMENT ON COLUMN clients.primary_email IS 'Operational lookup key for V1. Case-insensitive unique. Future: client_emails table for aliases.';


-- =============================================================================
-- TABLE 2: businesses
-- Business entity linked to a client.
-- One client may own many businesses across segments.
-- =============================================================================

CREATE TABLE businesses (
  business_id     UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       UUID          NOT NULL REFERENCES clients(client_id) ON DELETE RESTRICT,
  business_name   VARCHAR(255)  NOT NULL,
  dba_name        VARCHAR(255),
  entity_type     VARCHAR(50),              -- LLC | Corp | Sole Prop | Partnership
  segment         segment_type  NOT NULL,   -- primary go-to-market segment for this business
  state           CHAR(2)       NOT NULL,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  businesses IS 'Business entity associated to a client. One client may own multiple businesses across segments.';
COMMENT ON COLUMN businesses.segment IS 'Primary go-to-market segment. Represents acquisition/most-frequent-quote segment. Submission workflows always use submission.segment as the routing driver, not this field.';


-- =============================================================================
-- TABLE 3: submissions
-- One intake/application event. Anchor record for the full workflow.
-- submission_public_id is embedded in carrier outreach subject lines.
-- =============================================================================

CREATE TABLE submissions (
  submission_id         UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_public_id  VARCHAR(50)       NOT NULL,   -- e.g. CID-BAR-20260310-000042
  client_id             UUID              NOT NULL REFERENCES clients(client_id) ON DELETE RESTRICT,
  business_id           UUID              REFERENCES businesses(business_id) ON DELETE RESTRICT,
  segment               segment_type      NOT NULL,
  source_domain         VARCHAR(255)      NOT NULL,   -- e.g. barinsurancedirect.com
  source_form           VARCHAR(100),
  status                submission_status NOT NULL DEFAULT 'received',
  raw_submission_json   JSONB             NOT NULL,   -- full original form payload - never mutated
  submitted_at          TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
  reviewed_at           TIMESTAMPTZ,
  approved_at           TIMESTAMPTZ,
  reviewed_by           VARCHAR(100),

  CONSTRAINT submissions_public_id_unique UNIQUE (submission_public_id)
);

COMMENT ON TABLE  submissions IS 'One intake/application event. Created when a prospect submits a segment form. Anchor record for the full workflow.';
COMMENT ON COLUMN submissions.submission_public_id IS 'Human-readable workflow key. Embedded in carrier outreach subject lines for return quote matching.';
COMMENT ON COLUMN submissions.raw_submission_json  IS 'Full original form payload. Never mutated after write.';


-- =============================================================================
-- TABLE 4: carrier_messages
-- Every inbound and outbound carrier email event.
-- Raw communication log. Separate from quotes.
-- =============================================================================

CREATE TABLE carrier_messages (
  carrier_message_id  UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id       UUID            REFERENCES submissions(submission_id) ON DELETE RESTRICT,
  segment             segment_type    NOT NULL,
  direction           direction_type  NOT NULL,
  carrier_name        VARCHAR(100),
  from_email          VARCHAR(255)    NOT NULL,
  to_email            VARCHAR(255)    NOT NULL,
  subject             VARCHAR(500),
  gmail_message_id    VARCHAR(255),
  gmail_thread_id     VARCHAR(255),
  body_text           TEXT,           -- raw email body - immutable
  received_at         TIMESTAMPTZ,
  sent_at             TIMESTAMPTZ,
  created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  carrier_messages IS 'Every inbound and outbound carrier email event. Raw communication log. A message may contain a quote, a declination, or a request for more info.';
COMMENT ON COLUMN carrier_messages.body_text IS 'Raw email body. Immutable after write.';


-- =============================================================================
-- TABLE 5: quotes
-- Canonical quote record. One per carrier quote received.
-- Holds match + extraction confidence scores as first-class fields.
-- =============================================================================

CREATE TABLE quotes (
  quote_id              UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id         UUID              REFERENCES submissions(submission_id) ON DELETE RESTRICT,
  carrier_message_id    UUID              REFERENCES carrier_messages(carrier_message_id) ON DELETE RESTRICT,
  carrier_name          VARCHAR(100)      NOT NULL,
  segment               segment_type      NOT NULL,
  status                quote_status      NOT NULL DEFAULT 'received',
  match_confidence      DECIMAL(4,3)      CHECK (match_confidence >= 0 AND match_confidence <= 1),
  match_status          match_status_type,
  match_method          VARCHAR(255),
  extraction_confidence DECIMAL(4,3)      CHECK (extraction_confidence >= 0 AND extraction_confidence <= 1),
  packet_ready          BOOLEAN           NOT NULL DEFAULT FALSE,
  premium               DECIMAL(10,2),
  effective_date        DATE,
  expiration_date       DATE,
  carrier_quote_ref     VARCHAR(100),     -- carrier-provided quote/proposal number
  match_details_json    JSONB,            -- signals used to compute match_confidence
  created_at            TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ       NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  quotes IS 'Canonical quote record. One record per carrier quote received.';
COMMENT ON COLUMN quotes.match_confidence      IS '0.000-1.000. Null until matching runs. >= 0.95 auto-match, 0.70-0.94 review queue, < 0.70 unmatched queue.';
COMMENT ON COLUMN quotes.extraction_confidence IS '0.000-1.000. Null until extraction runs. < 0.75 is a hard block on packet generation.';
COMMENT ON COLUMN quotes.carrier_quote_ref     IS 'Carrier-provided quote number or proposal ID. Used for support conversations, carrier follow-ups, and duplicate detection.';
COMMENT ON COLUMN quotes.match_details_json    IS 'Signals used to compute match_confidence. e.g. {submission_id_detected, thread_match, insured_name_similarity, carrier_sender_match}';


-- =============================================================================
-- TABLE 6: quote_extractions
-- Structured extracted fields from a carrier quote PDF.
-- Versioned - multiple extractions per quote allowed.
-- Only one may be is_active at a time.
-- =============================================================================

CREATE TABLE quote_extractions (
  quote_extraction_id   UUID                PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id              UUID                NOT NULL REFERENCES quotes(quote_id) ON DELETE RESTRICT,
  source_document_id    UUID                NOT NULL, -- FK to documents - added after documents table exists (see constraint below)
  model_name            VARCHAR(100)        NOT NULL,
  model_version         VARCHAR(50),
  raw_extraction_json   JSONB               NOT NULL,   -- full model output - immutable
  normalized_json       JSONB,
  reviewed_json         JSONB,              -- agent-confirmed values - source of truth for packet
  overall_confidence    DECIMAL(4,3)        CHECK (overall_confidence >= 0 AND overall_confidence <= 1),
  review_status         review_status_type  NOT NULL DEFAULT 'pending',
  reviewed_by           VARCHAR(100),
  reviewed_at           TIMESTAMPTZ,
  is_active             BOOLEAN             NOT NULL DEFAULT FALSE,
  created_at            TIMESTAMPTZ         NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  quote_extractions IS 'Structured extracted fields from carrier PDF. Versioned - multiple extractions per quote allowed. Only one is_active at a time.';
COMMENT ON COLUMN quote_extractions.raw_extraction_json IS 'Full model output. Immutable after write. Never overwrite.';
COMMENT ON COLUMN quote_extractions.reviewed_json       IS 'Agent-confirmed values. The only field the packet generator reads from.';
COMMENT ON COLUMN quote_extractions.is_active           IS 'Only one extraction per quote may be active. New extractions set prior is_active = false. Enforced by application logic.';


-- =============================================================================
-- TABLE 7: documents
-- All documents - original and generated - in a single catalog.
-- document_role distinguishes carrier originals from system outputs.
-- =============================================================================

CREATE TABLE documents (
  document_id       UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id         UUID              REFERENCES clients(client_id) ON DELETE RESTRICT,
  submission_id     UUID              REFERENCES submissions(submission_id) ON DELETE RESTRICT,
  quote_id          UUID              REFERENCES quotes(quote_id) ON DELETE RESTRICT,
  policy_id         UUID,             -- FK to policies added after policies table (see below)
  document_type     document_type     NOT NULL,
  document_role     document_role     NOT NULL,
  storage_provider  storage_provider  NOT NULL,
  storage_path      VARCHAR(1000)     NOT NULL,
  mime_type         VARCHAR(100)      NOT NULL,
  sha256_hash       CHAR(64)          NOT NULL,
  is_original       BOOLEAN           NOT NULL,
  created_by        actor_type        NOT NULL,
  created_at        TIMESTAMPTZ       NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  documents IS 'All documents - original and generated - in a single catalog. Never publicly accessible. All access via pre-signed URLs from Render API.';
COMMENT ON COLUMN documents.is_original   IS 'TRUE = carrier/client-originated. FALSE = system-generated. Never overwrite originals.';
COMMENT ON COLUMN documents.sha256_hash   IS 'Content hash. Used for deduplication and integrity verification.';
COMMENT ON COLUMN documents.created_by    IS 'Actor that created the document: system | agent | client | carrier | automation | signature_webhook';
COMMENT ON COLUMN documents.storage_path  IS 'Full path in storage bucket. Pattern: /clients/{client_id}/quotes/{quote_id}/original/';


-- Now that documents table exists, add FK from quote_extractions
ALTER TABLE quote_extractions
  ADD CONSTRAINT fk_quote_extractions_source_document
  FOREIGN KEY (source_document_id) REFERENCES documents(document_id) ON DELETE RESTRICT;


-- =============================================================================
-- TABLE 8: policies
-- Issued policy records.
-- UNIQUE(carrier_name, policy_number) - policy numbers are not globally unique.
-- =============================================================================

CREATE TABLE policies (
  policy_id         UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id         UUID          NOT NULL REFERENCES clients(client_id) ON DELETE RESTRICT,
  business_id       UUID          NOT NULL REFERENCES businesses(business_id) ON DELETE RESTRICT,
  submission_id     UUID          REFERENCES submissions(submission_id) ON DELETE RESTRICT,
  quote_id          UUID          REFERENCES quotes(quote_id) ON DELETE RESTRICT,
  carrier_name      VARCHAR(100)  NOT NULL,
  policy_number     VARCHAR(100)  NOT NULL,
  policy_type       VARCHAR(100)  NOT NULL,   -- GL | Liquor Liability | WC | Property | etc.
  effective_date    DATE          NOT NULL,
  expiration_date   DATE          NOT NULL,   -- used to trigger renewal workflow
  status            policy_status NOT NULL DEFAULT 'pending',
  premium           DECIMAL(10,2) NOT NULL,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT policies_carrier_policy_unique UNIQUE (carrier_name, policy_number)
);

COMMENT ON TABLE  policies IS 'Issued policy records. Created when carrier confirms bind and issues policy number.';
COMMENT ON COLUMN policies.expiration_date IS 'Used to trigger renewal workflow. Index maintained for renewal queries.';
COMMENT ON COLUMN policies.policy_number   IS 'Carrier-assigned. UNIQUE constraint is composite with carrier_name - policy numbers are not globally unique across carriers.';


-- Now that policies table exists, add FK from documents
ALTER TABLE documents
  ADD CONSTRAINT fk_documents_policy
  FOREIGN KEY (policy_id) REFERENCES policies(policy_id) ON DELETE RESTRICT;


-- =============================================================================
-- TABLE 9: quote_packets
-- Tracks every packet assembled and sent to a client.
-- Links exact extraction version used. Immutable after sent.
-- =============================================================================

CREATE TABLE quote_packets (
  packet_id           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id            UUID          NOT NULL REFERENCES quotes(quote_id) ON DELETE RESTRICT,
  extraction_id       UUID          NOT NULL REFERENCES quote_extractions(quote_extraction_id) ON DELETE RESTRICT,
  packet_version      SMALLINT      NOT NULL DEFAULT 1,
  packet_document_id  UUID          NOT NULL REFERENCES documents(document_id) ON DELETE RESTRICT,
  status              packet_status NOT NULL DEFAULT 'draft',
  created_by          VARCHAR(100)  NOT NULL,
  sent_at             TIMESTAMPTZ,
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  quote_packets IS 'Tracks every packet assembled and sent to a client. extraction_id is the audit link proving what data backed a sent packet. Required for E&O and dispute resolution.';
COMMENT ON COLUMN quote_packets.extraction_id IS 'FK to the exact quote_extractions record used to generate this packet. Immutable once set. E&O audit link.';


-- =============================================================================
-- TABLE 10: signature_events
-- Legal acceptance trail for every signing event.
-- APPEND-ONLY. Never update or delete records.
-- =============================================================================

CREATE TABLE signature_events (
  signature_event_id  UUID                  PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id           UUID                  NOT NULL REFERENCES clients(client_id) ON DELETE RESTRICT,
  submission_id       UUID                  REFERENCES submissions(submission_id) ON DELETE RESTRICT,
  quote_id            UUID                  REFERENCES quotes(quote_id) ON DELETE RESTRICT,
  policy_id           UUID                  REFERENCES policies(policy_id) ON DELETE RESTRICT,
  event_type          signature_event_type  NOT NULL,
  signer_email        VARCHAR(255)          NOT NULL,
  signer_phone        VARCHAR(20),
  ip_address          INET                  NOT NULL,
  user_agent          TEXT                  NOT NULL,
  consent_text        TEXT                  NOT NULL,   -- exact text shown to signer at time of signing
  signed_document_id  UUID                  NOT NULL REFERENCES documents(document_id) ON DELETE RESTRICT,
  document_hash       CHAR(64)              NOT NULL,   -- SHA-256 of signed document at time of signing
  signed_at           TIMESTAMPTZ           NOT NULL,
  created_at          TIMESTAMPTZ           NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  signature_events IS 'APPEND-ONLY. Records must never be updated or deleted. If an event must be superseded, create a new signature_event record referencing the prior event. Critical for E-SIGN compliance, disputes, and E&O defense.';
COMMENT ON COLUMN signature_events.consent_text   IS 'Exact consent language shown to signer at time of signing. Must not be changed retroactively.';
COMMENT ON COLUMN signature_events.document_hash  IS 'SHA-256 of the signed document at moment of signing. Used to prove document integrity.';


-- =============================================================================
-- TABLE 11: work_queue_items
-- Human intervention queue. Every automated step that cannot resolve
-- with sufficient confidence creates a work queue item.
-- =============================================================================

CREATE TABLE work_queue_items (
  work_queue_item_id  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_type          queue_type    NOT NULL,
  related_entity_type VARCHAR(50)   NOT NULL,   -- submission | quote | carrier_message | signature
  related_entity_id   UUID          NOT NULL,
  priority            SMALLINT      NOT NULL DEFAULT 3
                        CHECK (priority BETWEEN 1 AND 4),  -- 1=urgent 2=high 3=normal 4=low
  reason_code         VARCHAR(100)  NOT NULL,
  reason_detail       TEXT,
  status              queue_status  NOT NULL DEFAULT 'open',
  assigned_to         VARCHAR(100),
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  resolved_at         TIMESTAMPTZ,
  resolved_by         VARCHAR(100)
);

COMMENT ON TABLE  work_queue_items IS 'Human intervention queue. Every automated step that cannot resolve with sufficient confidence creates a work queue item. No automated step fails silently.';
COMMENT ON COLUMN work_queue_items.priority IS '1=urgent | 2=high | 3=normal | 4=low. Used for internal tool queue sorting.';


-- =============================================================================
-- TABLE 12: timeline_events
-- Chronological event stream. Append-only audit log.
-- The single view of record for any submission lifecycle.
-- =============================================================================

CREATE TABLE timeline_events (
  timeline_event_id   UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id           UUID          REFERENCES clients(client_id) ON DELETE RESTRICT,
  submission_id       UUID          REFERENCES submissions(submission_id) ON DELETE RESTRICT,
  quote_id            UUID          REFERENCES quotes(quote_id) ON DELETE RESTRICT,
  policy_id           UUID          REFERENCES policies(policy_id) ON DELETE RESTRICT,
  event_type          VARCHAR(100)  NOT NULL,
  event_label         VARCHAR(255)  NOT NULL,   -- human-readable display string
  event_payload_json  JSONB,
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  created_by          VARCHAR(100)            -- actor_type value or agent identifier
);

COMMENT ON TABLE  timeline_events IS 'APPEND-ONLY. Chronological event stream. Never updated or deleted. The audit log and single view of record for any submission lifecycle.';
COMMENT ON COLUMN timeline_events.event_type  IS 'e.g. submission.received | quote.matched | sign.completed | policy.issued';
COMMENT ON COLUMN timeline_events.created_by  IS 'Actor type: system | agent | client | carrier | automation | signature_service';


-- =============================================================================
-- INDEXES
-- =============================================================================

-- clients
CREATE UNIQUE INDEX idx_clients_primary_email   ON clients (primary_email);

-- businesses
CREATE INDEX idx_businesses_client_id           ON businesses (client_id);
CREATE INDEX idx_businesses_segment             ON businesses (segment);

-- submissions
CREATE UNIQUE INDEX idx_submissions_public_id   ON submissions (submission_public_id);
CREATE INDEX idx_submissions_client_id          ON submissions (client_id);
CREATE INDEX idx_submissions_business_id        ON submissions (business_id);
CREATE INDEX idx_submissions_status             ON submissions (status);
CREATE INDEX idx_submissions_segment            ON submissions (segment);
CREATE INDEX idx_submissions_submitted_at       ON submissions (submitted_at DESC);

-- carrier_messages
CREATE INDEX idx_carrier_messages_submission_id ON carrier_messages (submission_id);
CREATE INDEX idx_carrier_messages_gmail_thread  ON carrier_messages (gmail_thread_id);
CREATE INDEX idx_carrier_messages_direction     ON carrier_messages (direction);
CREATE INDEX idx_carrier_messages_segment       ON carrier_messages (segment);
CREATE INDEX idx_carrier_messages_received_at   ON carrier_messages (received_at DESC);

-- quotes
CREATE INDEX idx_quotes_submission_id           ON quotes (submission_id);
CREATE INDEX idx_quotes_match_status            ON quotes (match_status);
CREATE INDEX idx_quotes_status                  ON quotes (status);
CREATE INDEX idx_quotes_segment                 ON quotes (segment);
CREATE INDEX idx_quotes_created_at              ON quotes (created_at DESC);

-- quote_extractions
CREATE INDEX idx_quote_extractions_quote_id     ON quote_extractions (quote_id);
CREATE INDEX idx_quote_extractions_is_active    ON quote_extractions (quote_id, is_active)
  WHERE is_active = TRUE;  -- partial index - active extraction per quote

-- documents
CREATE INDEX idx_documents_client_id            ON documents (client_id);
CREATE INDEX idx_documents_submission_id        ON documents (submission_id);
CREATE INDEX idx_documents_quote_id             ON documents (quote_id);
CREATE INDEX idx_documents_policy_id            ON documents (policy_id);
CREATE INDEX idx_documents_document_role        ON documents (document_role);
CREATE INDEX idx_documents_sha256_hash          ON documents (sha256_hash);
CREATE INDEX idx_documents_is_original          ON documents (is_original);

-- policies
CREATE INDEX idx_policies_client_id             ON policies (client_id);
CREATE INDEX idx_policies_business_id           ON policies (business_id);
CREATE INDEX idx_policies_expiration_date       ON policies (expiration_date);  -- renewal triggers
CREATE INDEX idx_policies_status                ON policies (status);
CREATE INDEX idx_policies_carrier               ON policies (carrier_name);

-- quote_packets
CREATE INDEX idx_quote_packets_quote_id         ON quote_packets (quote_id);
CREATE INDEX idx_quote_packets_extraction_id    ON quote_packets (extraction_id);

-- signature_events
CREATE INDEX idx_signature_events_client_id     ON signature_events (client_id);
CREATE INDEX idx_signature_events_submission_id ON signature_events (submission_id);
CREATE INDEX idx_signature_events_quote_id      ON signature_events (quote_id);
CREATE INDEX idx_signature_events_signed_at     ON signature_events (signed_at DESC);

-- work_queue_items
CREATE INDEX idx_work_queue_type_status         ON work_queue_items (queue_type, status);
CREATE INDEX idx_work_queue_priority            ON work_queue_items (priority, created_at)
  WHERE status = 'open';  -- partial index - only open items need priority sorting
CREATE INDEX idx_work_queue_entity              ON work_queue_items (related_entity_type, related_entity_id);

-- timeline_events
CREATE INDEX idx_timeline_submission_id         ON timeline_events (submission_id, created_at DESC);
CREATE INDEX idx_timeline_client_id             ON timeline_events (client_id, created_at DESC);
CREATE INDEX idx_timeline_quote_id              ON timeline_events (quote_id);
CREATE INDEX idx_timeline_policy_id             ON timeline_events (policy_id);
CREATE INDEX idx_timeline_event_type            ON timeline_events (event_type);


-- =============================================================================
-- UPDATED_AT TRIGGER
-- Auto-updates updated_at on clients, businesses, quotes, policies
-- =============================================================================

CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at_clients
  BEFORE UPDATE ON clients
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at_businesses
  BEFORE UPDATE ON businesses
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at_quotes
  BEFORE UPDATE ON quotes
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at_policies
  BEFORE UPDATE ON policies
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();


-- =============================================================================
-- SUBMISSION PUBLIC ID GENERATOR FUNCTION
-- Generates CID-{SEGMENT}-{DATE}-{SEQUENCE} format
-- e.g. CID-BAR-20260310-000042
-- Call from application layer on submission insert.
-- =============================================================================

CREATE SEQUENCE IF NOT EXISTS submission_seq
  START WITH 1
  INCREMENT BY 1
  NO MAXVALUE
  CACHE 1;

CREATE OR REPLACE FUNCTION generate_submission_public_id(p_segment segment_type)
RETURNS VARCHAR AS $$
DECLARE
  seg_code  VARCHAR(4);
  date_part VARCHAR(8);
  seq_part  VARCHAR(6);
BEGIN
  seg_code  := UPPER(SUBSTRING(p_segment::TEXT, 1, 4));
  -- Normalize roofer to RTR for clarity
  IF p_segment = 'roofer'  THEN seg_code := 'RTR'; END IF;
  IF p_segment = 'plumber' THEN seg_code := 'PLM'; END IF;
  IF p_segment = 'hvac'    THEN seg_code := 'HVC'; END IF;
  IF p_segment = 'bar'     THEN seg_code := 'BAR'; END IF;

  date_part := TO_CHAR(NOW(), 'YYYYMMDD');
  seq_part  := LPAD(nextval('submission_seq')::TEXT, 6, '0');

  RETURN 'CID-' || seg_code || '-' || date_part || '-' || seq_part;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION generate_submission_public_id IS 'Generates CID-{SEG}-{YYYYMMDD}-{000000} public IDs. Call from Node on submission insert. Embed result in carrier outreach subject lines.';


-- =============================================================================
-- APPEND-ONLY PROTECTION RULES
-- Prevent UPDATE and DELETE on audit-critical tables
-- =============================================================================

-- signature_events: append-only enforced at DB level
CREATE OR REPLACE FUNCTION prevent_signature_events_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'signature_events is append-only. Records cannot be updated or deleted. Create a new record to supersede.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER no_update_signature_events
  BEFORE UPDATE ON signature_events
  FOR EACH ROW EXECUTE FUNCTION prevent_signature_events_mutation();

CREATE TRIGGER no_delete_signature_events
  BEFORE DELETE ON signature_events
  FOR EACH ROW EXECUTE FUNCTION prevent_signature_events_mutation();

-- timeline_events: append-only enforced at DB level
CREATE OR REPLACE FUNCTION prevent_timeline_events_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'timeline_events is append-only. Records cannot be updated or deleted.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER no_update_timeline_events
  BEFORE UPDATE ON timeline_events
  FOR EACH ROW EXECUTE FUNCTION prevent_timeline_events_mutation();

CREATE TRIGGER no_delete_timeline_events
  BEFORE DELETE ON timeline_events
  FOR EACH ROW EXECUTE FUNCTION prevent_timeline_events_mutation();


-- =============================================================================
-- EXTRACTION ACTIVE VERSION ENFORCEMENT
-- Ensures only one is_active extraction per quote
-- =============================================================================

CREATE OR REPLACE FUNCTION enforce_single_active_extraction()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_active = TRUE THEN
    UPDATE quote_extractions
    SET    is_active = FALSE
    WHERE  quote_id = NEW.quote_id
      AND  quote_extraction_id != NEW.quote_extraction_id
      AND  is_active = TRUE;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_one_active_extraction
  BEFORE INSERT OR UPDATE ON quote_extractions
  FOR EACH ROW EXECUTE FUNCTION enforce_single_active_extraction();

COMMENT ON TRIGGER enforce_one_active_extraction ON quote_extractions IS 'Ensures only one extraction per quote has is_active = true. Prior active extraction is automatically deactivated.';


-- =============================================================================
-- SEED: SEGMENT REFERENCE (informational - no table needed)
-- Domains and inboxes per segment for Cursor/dev reference
-- =============================================================================

-- bar     -> barinsurancedirect.com             -> quotes@barinsurancedirect.com
-- roofer  -> roofingcontractorinsurancedirect.com -> quotes@roofingcontractorinsurancedirect.com
-- plumber -> plumbinginsurancedirect.com         -> quotes@plumbinginsurancedirect.com
-- hvac    -> hvacinsurancedirect.com             -> quotes@hvacinsurancedirect.com


COMMIT;

-- =============================================================================
-- VERIFY (run after migration to confirm all 12 tables exist)
-- =============================================================================
-- SELECT table_name FROM information_schema.tables
-- WHERE  table_schema = 'public'
-- ORDER  BY table_name;
-- =============================================================================
-- Expected output:
--   businesses
--   carrier_messages
--   clients
--   documents
--   policies
--   quote_extractions
--   quote_packets
--   quotes
--   signature_events
--   submissions
--   timeline_events
--   work_queue_items
-- =============================================================================


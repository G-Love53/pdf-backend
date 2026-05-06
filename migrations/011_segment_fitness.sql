-- Add fitness vertical to segment_type and public submission id mapping.
-- Run on cid-postgres (Render DATABASE_URL for CID-PDF-API).
-- Note: requires PostgreSQL 15+ for ADD VALUE IF NOT EXISTS; otherwise run a one-time ADD VALUE without IF NOT EXISTS.

ALTER TYPE segment_type ADD VALUE IF NOT EXISTS 'fitness';

CREATE OR REPLACE FUNCTION generate_submission_public_id(p_segment segment_type)
RETURNS VARCHAR AS $$
DECLARE
  seg_code  VARCHAR(4);
  date_part VARCHAR(8);
  seq_part  VARCHAR(6);
BEGIN
  seg_code  := UPPER(SUBSTRING(p_segment::TEXT, 1, 4));
  IF p_segment = 'roofer'  THEN seg_code := 'RTR'; END IF;
  IF p_segment = 'plumber' THEN seg_code := 'PLM'; END IF;
  IF p_segment = 'hvac'    THEN seg_code := 'HVC'; END IF;
  IF p_segment = 'bar'     THEN seg_code := 'BAR'; END IF;
  IF p_segment = 'fitness' THEN seg_code := 'FTN'; END IF;

  date_part := TO_CHAR(NOW(), 'YYYYMMDD');
  seq_part  := LPAD(nextval('submission_seq')::TEXT, 6, '0');

  RETURN 'CID-' || seg_code || '-' || date_part || '-' || seq_part;
END;
$$ LANGUAGE plpgsql;

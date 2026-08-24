-- Add painter ConnectQuote segment.
-- Run on cid-postgres (Render DATABASE_URL for CID-PDF-API).

ALTER TYPE segment_type ADD VALUE IF NOT EXISTS 'painter';

CREATE OR REPLACE FUNCTION generate_submission_public_id(p_segment segment_type)
RETURNS VARCHAR AS $$
DECLARE
  seg_code  VARCHAR(4);
  date_part VARCHAR(8);
  seq_part  VARCHAR(6);
BEGIN
  seg_code  := UPPER(SUBSTRING(p_segment::TEXT, 1, 4));
  IF p_segment = 'roofer'     THEN seg_code := 'RTR'; END IF;
  IF p_segment = 'plumber'    THEN seg_code := 'PLM'; END IF;
  IF p_segment = 'hvac'       THEN seg_code := 'HVC'; END IF;
  IF p_segment = 'bar'        THEN seg_code := 'BAR'; END IF;
  IF p_segment = 'fitness'    THEN seg_code := 'FTN'; END IF;
  IF p_segment = 'electrical' THEN seg_code := 'ELC'; END IF;
  IF p_segment = 'beauty'     THEN seg_code := 'BTY'; END IF;
  IF p_segment = 'cleaning'   THEN seg_code := 'CLN'; END IF;
  IF p_segment = 'pet'        THEN seg_code := 'PET'; END IF;
  IF p_segment = 'painter'    THEN seg_code := 'PNT'; END IF;

  date_part := TO_CHAR(NOW(), 'YYYYMMDD');
  seq_part  := LPAD(nextval('submission_seq')::TEXT, 6, '0');

  RETURN 'CID-' || seg_code || '-' || date_part || '-' || seq_part;
END;
$$ LANGUAGE plpgsql;

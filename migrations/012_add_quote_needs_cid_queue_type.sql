-- Carrier PDF with quote keywords but no CID in subject/body (Gmail poller soft-ingest).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'queue_type'
      AND e.enumlabel = 'quote_needs_cid'
  ) THEN
    ALTER TYPE queue_type ADD VALUE 'quote_needs_cid';
  END IF;
END $$;

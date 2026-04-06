-- Add queue_type for carrier PDFs that match CID + attachment but lack quote keywords (Gmail poller UW fork).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'queue_type'
      AND e.enumlabel = 'uw_question'
  ) THEN
    ALTER TYPE queue_type ADD VALUE 'uw_question';
  END IF;
END $$;

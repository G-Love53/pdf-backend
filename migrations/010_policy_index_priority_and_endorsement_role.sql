-- Add endorsement document role and policy chunk priority ordering support.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname = 'document_role'
      AND e.enumlabel = 'endorsement'
  ) THEN
    ALTER TYPE document_role ADD VALUE 'endorsement';
  END IF;
END $$;

ALTER TABLE policy_document_chunks
  ADD COLUMN IF NOT EXISTS document_priority INTEGER NOT NULL DEFAULT 2;

ALTER TABLE policy_document_chunks
  DROP CONSTRAINT IF EXISTS policy_document_chunks_document_priority_check;

ALTER TABLE policy_document_chunks
  ADD CONSTRAINT policy_document_chunks_document_priority_check
    CHECK (document_priority BETWEEN 1 AND 9);

CREATE INDEX IF NOT EXISTS idx_policy_document_chunks_policy_priority_rank
  ON policy_document_chunks (policy_id, document_priority, index_status, chunk_index);

-- Policy document chunk index for Connect "Am I covered?" retrieval.
-- Postgres-native FTS; no external vector service required for Phase 1.

CREATE TABLE IF NOT EXISTS policy_document_chunks (
  chunk_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id UUID NOT NULL REFERENCES policies(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES documents(document_id) ON DELETE CASCADE,
  document_role TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  content_tsv tsvector GENERATED ALWAYS AS (
    to_tsvector('english', COALESCE(content, ''))
  ) STORED,
  source_storage_path TEXT,
  source_sha256 TEXT,
  index_status TEXT NOT NULL DEFAULT 'indexed',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT policy_document_chunks_document_chunk_unique UNIQUE (document_id, chunk_index),
  CONSTRAINT policy_document_chunks_index_status_check
    CHECK (
      index_status IN ('indexed', 'empty_text', 'download_failed', 'parse_failed', 'needs_ocr')
    )
);

CREATE INDEX IF NOT EXISTS idx_policy_document_chunks_tsv
  ON policy_document_chunks
  USING GIN (content_tsv);

CREATE INDEX IF NOT EXISTS idx_policy_document_chunks_policy_doc_chunk
  ON policy_document_chunks (policy_id, document_id, chunk_index);

CREATE INDEX IF NOT EXISTS idx_policy_document_chunks_policy_status
  ON policy_document_chunks (policy_id, index_status);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'trigger_set_updated_at') THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_trigger
      WHERE tgname = 'set_updated_at_policy_document_chunks'
    ) THEN
      CREATE TRIGGER set_updated_at_policy_document_chunks
        BEFORE UPDATE ON policy_document_chunks
        FOR EACH ROW
        EXECUTE FUNCTION trigger_set_updated_at();
    END IF;
  END IF;
END $$;

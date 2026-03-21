/**
 * Canonical Postgres ENUM string values for this service.
 *
 * **Source of truth:** `migrations/001_cid_initial_schema.sql` (and any later
 * `migrations/*.sql` that `ALTER TYPE ... ADD VALUE`).
 *
 * **Rule:** Never use a new literal in INSERT/UPDATE/WHERE for an enum column
 * without adding it to the DB first. Import from here instead of hard-coding.
 *
 * R2/upload metadata `type:` strings are **not** enums — those stay ad hoc.
 */

/** @see CREATE TYPE document_type */
export const DocumentType = Object.freeze({
  PDF: "pdf",
  JSON: "json",
  IMAGE: "image",
  OTHER: "other",
});

/** @see CREATE TYPE document_role */
export const DocumentRole = Object.freeze({
  CARRIER_QUOTE_ORIGINAL: "carrier_quote_original",
  SALES_LETTER_GENERATED: "sales_letter_generated",
  COVERAGE_SUMMARY_GENERATED: "coverage_summary_generated",
  QUOTE_PACKET_SENT: "quote_packet_sent",
  SIGNED_ACCEPTANCE: "signed_acceptance",
  APPLICATION_ORIGINAL: "application_original",
  BIND_REQUEST_SENT: "bind_request_sent",
  POLICY_ORIGINAL: "policy_original",
  DECLARATIONS_ORIGINAL: "declarations_original",
  /** Signed bind PDF (e.g. BoldSign / HelloSign completion) */
  SIGNED_BIND_DOCS: "signed_bind_docs",
  COI_GENERATED: "coi_generated",
  TIMELINE_EXPORT: "timeline_export",
  OTHER: "other",
});

/** @see CREATE TYPE storage_provider */
export const StorageProvider = Object.freeze({
  R2: "r2",
  S3: "s3",
});

/** @see CREATE TYPE segment_type */
export const SegmentType = Object.freeze({
  BAR: "bar",
  ROOFER: "roofer",
  PLUMBER: "plumber",
  HVAC: "hvac",
});

/** @see CREATE TYPE packet_status */
export const PacketStatus = Object.freeze({
  DRAFT: "draft",
  APPROVED: "approved",
  SENT: "sent",
  SUPERSEDED: "superseded",
});

/** @see CREATE TYPE quote_status */
export const QuoteStatus = Object.freeze({
  RECEIVED: "received",
  UNMATCHED: "unmatched",
  MATCH_REVIEW: "match_review",
  MATCHED: "matched",
  EXTRACTING: "extracting",
  NEEDS_REVIEW: "needs_review",
  PACKET_READY: "packet_ready",
  SENT: "sent",
  ACCEPTED: "accepted",
  DECLINED: "declined",
});

/**
 * @see CREATE TYPE submission_status
 * Note: `followupScheduler.js` historically used `expired` — that value is NOT in 001;
 * fix via migration or change the job to use an existing status (e.g. closed_lost).
 */
export const SubmissionStatus = Object.freeze({
  RECEIVED: "received",
  UNDER_REVIEW_GATE1: "under_review_gate1",
  APPROVED_FOR_MARKET: "approved_for_market",
  REJECTED: "rejected",
  SENT_TO_CARRIER: "sent_to_carrier",
  QUOTE_RECEIVED: "quote_received",
  PACKET_IN_REVIEW: "packet_in_review",
  SENT_TO_CLIENT: "sent_to_client",
  ACCEPTED: "accepted",
  BOUND: "bound",
  ISSUED: "issued",
  CLOSED_LOST: "closed_lost",
});

/** @see CREATE TYPE policy_status */
export const PolicyStatus = Object.freeze({
  PENDING: "pending",
  ACTIVE: "active",
  EXPIRED: "expired",
  CANCELLED: "cancelled",
});

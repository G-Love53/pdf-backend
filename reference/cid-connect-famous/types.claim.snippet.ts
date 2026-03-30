/**
 * MERGE into src/types/index.ts — Claim interface
 */

export type ClaimSnippet = {
  // ...existing Claim fields
  settlement_amount?: number | null;
  settlement_date?: string | null; // ISO date
};

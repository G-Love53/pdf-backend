# Operator Daily Runbook (Quote -> Bind -> Policy Package)

This is the daily operating flow for CID-PDF-API operator queues.

## 1) Quote email arrives (carrier reply) -> S4

- **System does automatically**
  - Gmail poller ingests carrier inbox unread mail that contains:
    - CID submission ID token (e.g. `CID-BAR-...`)
    - PDF attachment
  - Stores PDF in R2 + `documents` (`carrier_quote_original`)
  - Creates/updates quote + pushes to S4 extraction review queue.
- **Operator does manually**
  - Open S4 queue.
  - Confirm extraction values (carrier, premium, policy type, limits).
  - Approve extraction to move quote toward S5.

## 2) Bind signed -> what to expect next

- **System does automatically**
  - BoldSign completion marks bind signed.
  - Stores signed bind PDF as `signed_bind_docs`.
  - Creates `policies` row and updates statuses.
  - Sends client bind/welcome emails.
- **Operator expectation**
  - Carrier policy package (dec pages / endorsements) usually arrives after bind.
  - Target window: verify within 1-3 business days (carrier-dependent).

## 3) Carrier policy package arrives -> auto-link to policy

- **System does automatically**
  - Poller detects post-bind policy-package style email (declarations / policy / endorsement cues).
  - If a policy exists for matched submission:
    - Re-links ingested PDF docs to that policy
    - Sets `document_role = policy_original` or `endorsement` based on content cues
    - Writes `policy.documents.received` timeline event
    - Triggers policy indexer immediately
- **Operator verifies**
  - Operator Home:
    - "Connect: policy / dec PDFs (today)" card/list
  - Policy index status endpoint:
    - `GET /api/admin/index-status/:policyId` with admin secret
  - Connect chat can now use policy excerpts for "Am I covered?".

## 4) If package did NOT auto-link (manual fallback)

1. Confirm message has CID ID in subject/body and PDF attachment.
2. Confirm policy exists for that submission.
3. Use **S6 -> Docs Reconcile** (preferred manual path):
   - enter CID ID
   - upload PDF
   - choose role (`policy_original`, `declarations_original`, `endorsement`, `signed_bind_docs`)
   - submit
4. System writes timeline + triggers indexer for policy roles.
5. Re-check:
   - index status endpoint
   - Connect chat evidence quality.

Fallback if S6 is unavailable: DB manual link + indexer backfill.

## 5) Email correction in S5 (truth behavior)

- Resend packet in S5 can persist corrected recipient as truth.
- With "Save as application truth" enabled:
  - updates `clients.primary_email`
  - updates submission raw email fields
  - updates pending bind signer email for that submission.

This should be used whenever intake email was wrong and you corrected it during resend.

## 6) S6 operating model (current)

- **Bind Workflow tab** = launch/resend signer flow.
- **Docs Reconcile tab** = catch-all document intake/linking.
- S6 queue status badges:
  - `Ready to Send`
  - `Awaiting Signature`
  - `Signed`
  - `Policy Package Received`

Notes:
- Client self-serve "Issue Policy" can initiate bind automatically (operator may not need to send manually).
- Policy package emails without CID token cannot be auto-matched; use Docs Reconcile.

## 7) Connect-first policy delivery

- Policy package PDFs are not primary email-delivery artifacts.
- Standard message: docs are available in CID Connect for viewing/downloading/sharing.
- Use email attachment only when a client explicitly requests a copy.

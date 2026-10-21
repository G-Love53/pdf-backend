# Decisions log

New agents read [`agent-start.md`](./agent-start.md) first. This file is the dated calls behind it. Git history holds the rest. No secrets in this file.

Edit this file when a decision would change the next session. Specs stay in their own docs.

---

## 2026-10-21 — Unbound ConnectQuote gets one note, then two reminders

A price that is ready to bind, and is still open, gets an email about an hour later. The full flow is in [`CID_ARCHITECTURE.md`](./CID_ARCHITECTURE.md). Runtime is in [`Deploy_Guide.md`](./Deploy_Guide.md). The audit trail is in [`AUDIT_READINESS.md`](./AUDIT_READINESS.md).

- ConnectQuote segments only. Bar and roofer are skipped. Coterie-only trades get one line. A dual quote gets a line for each coverage that is still open.
- Coterie trigger: a business-policy price that is not bound. GUARD trigger: a full quote (NBS) that is instant-bindable and not bound. An indication is not a trigger. A workers’ comp policy that already bound is not a trigger.
- Timing: first note from one hour to seven days after that price. Then one note the next day, and one on day three. A last note only when the carrier sent a real valid-through date, in the three days before that date. No invented date. No note a week later. Binding a line stops later notes for that line.
- One link per submission. The button opens the quote page. A 6-digit code, sent to the email on the application, is required before that page will treat them as confirmed. The code is not in the email. The page does not call the carrier and does not reprice.
- The note is the email only. No PDF. From and reply-to `support@commercialinsurance-direct.com`. Not Instantly.
- License line: **All Access Insurance LLC dba CID Insurance Services**, CO license **#6784587**. Colorado trade name **CID Insurance Services**, Secretary of State ID **20268251529**, effective **8 October 2026**, registrant **Rick P Cline Agency dba All Access Insurance LLC**. **Commercial Insurance Direct** stays off that license line. The next sentence still says Commercial Insurance Direct, Inc. is a technology platform and is not an insurer.
- The public website and the Instantly footer were not changed. Do not rewrite them until Gerry asks.

## 2026-10-21 — Instantly HTML build

The working process is [`outreach-claude-playbook.md`](./outreach-claude-playbook.md) §D. It replaces the August instruction to click the image and paste a merge variable.

- Instantly does not host images. The JPEG is on the segment site. Electrical workers’ comp: `https://electricalinsurancedirect.com/email/archive/2026-10-wc-v1/CID_Electrical_WC_Creative.jpg`. Confirm it in a private window before the image dialog. Electrical publishes by git push, not by dropping one file.
- A `href` that does not start with `https://` is stripped on paste. The editor cannot link an image. Ship the fragment with no `href`, then link the text with the chain icon.
- Do not put a button in the JPEG unless the image itself is linked.
- Link tracking stays off. Clicks are counted on the ConnectQuote landing, not in Instantly.
- `ch` and `src` stay the channel. `cid` is the step. It is stored as `raw_submission_json->>'campaign_id'`.
- Step gap is 3 days. The daily limit, not the gap, sets how long the campaign runs. Do not re-upload a verified list. That resets everyone to Step 1.

## 2026-10-19 — Colorado WC live, PDF ingest, next 10 states approved

This is the current GUARD and next-carrier status. Earlier dated lines below are the calls as of that day. A new carrier follows the **New carrier** lane in [`agent-start.md`](./agent-start.md).

- Colorado workers’ comp is live on production `cid-pdf-api` for beauty, cleaning, pet, fitness, plumber, and electrical. Prod `GUARD_ENABLED_SEGMENTS` is exactly `beauty,cleaning,pet,fitness,plumber,electrical`. Do not clear it. Live Colorado config returns `offerWc: true` and `sandbox: false` for those six. HVAC `wcEnabled` is false (class `5537`). Painter, bar, and roofer are not in the GUARD registry. `GUARD_PILOT_STATES` stays `CO`.
- Jon’s green light to submit business on the live API was 16 October 2026. Prod base is `gigezrate` (no P). SP name is `com.commercialinsurance-direct`. Sandbox stays `pgigezrate` and `PAFAKE10`. Do not copy the sandbox key, secret, or `PAFAKE10` onto prod. Username and password are the Agency Service Center portal only, not env vars.
- `GUARD_CAPITA_PAY_URL` stays unset. GUARD emails pay info. CID does not collect the card. Do not put the bare `https://policyholder.guard.com/payment` link on the customer confirmation.
- `finalizeGuardBind` locks only the submission (`FOR UPDATE OF s`), commit `5d88d50`. A bound WC policy gets its own `policies` row. It does not wait for a Coterie BOP. Sandbox check: `CID-BTY-20261019-000302` bound as `CIWC782024` and wrote Connect policy `ec27e086-27e8-4064-a2ee-5c37ed2590a1`. The first bind, sent in the same second as the quote, was rejected by GUARD (`Policy is not in an acceptable status to bind`). The retry wrote the card.
- Webhook PDF ingest is built and pushed, commit `25b97d0`, on prod and sandbox. `POST /webhooks/guard-docs` checks auth (401 if bad). Then it saves the carrier PDF to R2 and a documents row on the policy, matched by policy number, any state. The same file twice is one document. A different file is a second document. If the policy row does not exist yet, the PDF is stored pending and attached when bind finishes. Every case except bad auth returns 200. Live: `https://cid-pdf-api.onrender.com/webhooks/guard-docs`. Sandbox: `https://cid-pdf-api-sandbox.onrender.com/webhooks/guard-docs`. The earlier sandbox file `SUWC781711` was discarded before this code and will not appear unless GUARD posts it again.
- Do not fall back to CID ACORD 25 on `coterie` or `guard` policies. Instant COI for long-form (`boldsign`) remains CID ACORD 25.
- GUARD and Coterie both approved the next 10 states on 19 October 2026: AZ, UT, NM, WY, NV, ID, KS, NE, OK, TX. Places autocomplete already allows them. They are not bind states. `GUARD_PILOT_STATES` and `COTERIE_PILOT_STATES` stay `CO` until a state is added one at a time: Jon’s class suffix for workers’ comp, one smoke, then add the state to the pilot list. New Hampshire and Maine need an officer date of birth or SSN before any test. They are not in this ten.

## 2026-10-16 — GUARD green light

- Jon gave the official green light on 16 October 2026 to submit business on the live API. The live webhook is released.
- When that card write is fixed, turn on `beauty,cleaning,pet,fitness,plumber,electrical` in Colorado only. HVAC, painter, bar, and roofer stay off. Leave `GUARD_CAPITA_PAY_URL` unset. Done 19 October 2026. See the entry above.
- New states: confirm class codes with Jon first. New Hampshire and Maine need an officer date of birth or SSN before a test. Do not add those states on a guess.

## 2026-10-15 — GUARD live credentials, connectivity only

- Jon sent the live key, secret, and agency code on 15 October 2026 for a connectivity test. This is not the green light to submit business. The webhook still has to be deployed.
- Prod `GUARD_SP_NAME` stays `com.commercialinsurance-direct`. Jon confirmed Live is set up with the same SP name as P.
- Prod base URL stays `gigezrate` (no P). Sandbox stays on `pgigezrate` and `PAFAKE10`. Do not copy the sandbox trio onto prod.
- The access key and secret key are `GUARD_API_KEY` and `GUARD_API_SECRET`. The agency code is `GUARD_CONTRACT_NUMBER`. The username and password are the portal login. Do not write those values into git.
- Leave `GUARD_ENABLED_SEGMENTS` empty when the keys are saved, so customer sites do not offer workers’ comp. Leave `GUARD_CAPITA_PAY_URL` unset.

## 2026-10-14 — Website legal line matches the filing

- The marketing site uses **All Access Insurance LLC dba Commercial Insurance Direct**, CO license **#6784587**. That is the DBA on file. **Commercial Insurance Direct, Inc.** stays in the next sentence as the technology platform, and it is not an insurer.
- **CID Insurance Services** remains the 12 October launch line. It is not on the website until that DBA is on the Colorado filing. Do not rewrite the Instantly email footer.
- Homepage phone is **(720) 677-6227**. The older agency collateral number stays off the site.

## 2026-10-14 — Coterie Generate COI, David’s answers

- Generate COI is on the API and the dashboard. David pointed at the policy docs page, `https://docs.coterieinsurance.com/#b83d7476-e7e0-43cf-bc54-a088f219ba27`. We already download issued files with `GET /v1.6/commercial/policies/docs/links/{PolicyNumber}`. The open point is the call that creates a new holder certificate, not the download.
- He believes the holder is named on the ACORD. No file upload for landlord or GC wording. Sandbox can generate a certificate.
- Still with his team: unlimited holder-specific certificates at no extra cost, and whether “Designated Additional Insured = Yes” requires Add Additional Insureds first.
- Do not build the adapter on this reply. Do not scrape the dashboard. Do not fall back to CID ACORD 25 on a Coterie policy.

## 2026-10-14 — PolicySweet contacts

- First contact for the Commercial API is **Josh Robinson**, Alternative Distribution at Great American. Email **`jlrobinson@gaig.com`**. Phone **513-369-5919**. The middle initial is required. `jrobinson@gaig.com` is not his address.
- Great American’s directory lists him as Digital Marketing Director. Their marketing contacts list him as Marketing Director. His own profile says Director of Digital Distribution, APIs and agency relationships for quote-to-bind.
- **Kristen Mielcarek** is Divisional VP of Operations for that team. **`kmielcarek@gaig.com`**, 860-298-2513. General box: `PolicySweet@policysweet.com`.
- No prior email with Josh. Gerry sends it. The ask stays the Commercial API, not PolicySweet Pro.

## 2026-10-14 — Agency NPN and Rick’s producer NPN

- **6784587** is the All Access agency NPN. Jon (GUARD) could not use it for an individual because it is already tied to the agency.
- The individual producer NPN, when a carrier needs a person, is **Richard P. Cline, 6762689**. Gerry sent that to Jon on 14 October 2026.
- The launch line and Instantly footer still print **6784587** as the Colorado license. Do not rewrite customer copy until Gerry asks.

## 2026-10-14 — Jon: links and webhook by Friday

- Today is Wednesday 14 October 2026. Jon said the links and the webhook should arrive by the end of the week, Friday 16 October 2026.
- The early-week check-in is done. Gerry replied the same day. Live credentials and policy mail go to `info@commercialinsurance-direct.com`. Customers buy direct, so a submission does not carry another producer.
- Live IP whitelist: the same Render ranges as test, `74.220.48.0/24` and `74.220.56.0/24`.
- The three production values still come from GUARD. Do not copy sandbox or `PAFAKE10`. Leave `GUARD_CAPITA_PAY_URL` unset.

## 2026-10-13 — Hartford appointment

- All Access holds a Hartford appointment and an IVANS account today. When the other licenses move, the Hartford appointment moves with them to CID. It does not stay behind at All Access.
- Confirm the producer code, that All Access owns the renewals, and that commission is on paper.
- Hartford Download can send Spectrum BOP and workers’ comp transactions, commercial policy PDFs, billing alerts, and audit messages to that IVANS mailbox. Connect does not read IVANS yet.
- Small-commercial Spectrum quoting is the EBC portal unless the Hartford rep confirms an API. Do not build a Hartford adapter while GUARD production credentials are the launch.

## 2026-10-12 — Launch name: CID Insurance Services

- For this launch, insurance is offered through **All Access Insurance LLC dba CID Insurance Services**, CO license **#6784587**.
- The extra DBA is there because “Direct” in the insurance name can be a licensing problem in some states. Segment domains stay as they are.
- Older carrier paperwork still says All Access Insurance dba Commercial Insurance Direct. That filing is unchanged until Gerry says otherwise.
- The live Instantly footer still reads “All Access Insurance LLC, License #6784587” and still names Commercial Insurance Direct, Inc. as the technology platform. Do not rewrite customer copy until Gerry asks.

## 2026-10-08 — Jon on live credentials and quick pay

- Check in early the week of 13 October 2026 to confirm the 16 October document webhook is on track. Live API key, secret, and contract number are a conversation after that check-in.
- Those three values still come from GUARD. Do not copy sandbox or `PAFAKE10`.
- GUARD already emails the customer the payment info and the pay link. They asked to put that same link on our bind confirmation.
- The public page is `https://policyholder.guard.com/payment` (BHGUARD - Payment). It does not fill the policy number or ZIP from the link. On a phone the page takes the screen, so the customer loses the number.
- Gerry told Jon that on 2026-10-08. A smooth confirmation-page handoff has to come from GUARD: a prefill link or a one-time pay link. CID does not collect the card.
- Leave `GUARD_CAPITA_PAY_URL` unset. Do not add the bare link to the confirmation page. Quote and bind do not wait on pay. GUARD’s email is the pay path until they send a link that opens already filled in.

## 2026-10-06 — Where documents live

- **Edit** pipeline, carrier, deploy, and partnership specs in `pdf-backend/docs/`.
- **Edit** the Connect app in `cid-connect/docs/`.
- `~/GitHub/CID-docs/` is an index. Those filenames stay so old links open. They point here. They are not a second copy.
- Home-folder `*.md` files are pointers. Do not edit them as specs.
- `/Volumes/CID_Master/docs-snapshots/YYYY-MM-DD/` is a read-only archive. A Mac job (`scripts/snapshot-docs-to-cid-master.sh`) writes a new dated folder weekly when the drive is mounted. Do not edit it. Do not use `CID_MASTER_OLD_DO_NOT_USE`. The January 2026 tree is not the working repo.

## 2026-10-06 — GUARD production

- Code is done. Customer sites call prod `cid-pdf-api`. Prod `offerWc` is false until GUARD generates `GUARD_API_KEY`, `GUARD_API_SECRET`, and `GUARD_CONTRACT_NUMBER`.
- Those three come from GUARD at go-live. The sandbox key, secret, and `PAFAKE10` stay on `cid-pdf-api-sandbox`.
- Prod `GUARD_API_BASE` is `gigezrate`, not `pgigezrate`.
- `GUARD_ENABLED_SEGMENTS` on prod: `beauty,cleaning,pet,fitness,plumber,electrical`. `GUARD_PILOT_STATES=CO`. `GUARD_SP_NAME` and `GUARD_WEBHOOK_AUTH` are set.
- Do not add `GUARD_CAPITA_PAY_URL` until GUARD sends the real template. A blank or placeholder row can turn the pay button on.
- After the three values are Live: smoke Electrical CO on the customer URL with a unique name, ZIP, and FEIN. Then the other five. Connect shows the second policy card after that bind.
- Doc webhook acks today. Connect ingest is 16 October 2026.
- GUARD certificate adapter waits until Electrical WC is live. Do not draft a CID ACORD 25 for a GUARD policy.
- HVAC class `5537` stays `wcEnabled: false`. Painter, bar, and roofer are not in the GUARD registry. Bar and roofer stay long-form.
- Do not edit plumber or roofer repos for GUARD. Do not rebuild Electrical WC.

## 2026-10-06 — Connect COI

- Instant COI in Connect today is CID ACORD 25. That is correct for long-form (`bind_source: boldsign`).
- Coterie and GUARD policies need carrier paper. Spec: `connect-coi-carrier.md`.
- David has been asked for Generate COI and Add Additional Insureds. Do not scrape `dashboard-v2`. Do not fall back to CID ACORD on `coterie` or `guard`.
- Connect pet canonical domain is `petserviceinsurancedirect.com`.

## 2026-10-06 — Am I Covered and endorsements (parked)

Review and build only after Coterie sends the certificate / additional-insured document API. Do not start this on a guess.

- Endorsements issued after bind must land in Connect as `endorsement`, get indexed, and be visible to Am I Covered.
- The no-first check (equipment breakdown, flood, cyber, liquor) reads the policy summary today. An endorsement that adds a line has to count as present. A missing endorsement must still answer as not on the policy.
- Keep Claude primary and Gemini as the outage fallback. Do not add Perplexity. Am I Covered answers from this policy and its endorsements, not from the web.

## 2026-10-06 — Geography

- Places autocomplete: CO plus AZ, UT, NM, WY, NV, ID, KS, NE, OK, TX.
- `COTERIE_PILOT_STATES` and `GUARD_PILOT_STATES` are CO. Autocomplete is not a bind state.

## 2026-09 — NEXT and other rails

- NEXT is optional. Go only if quote and bind are headless in our UI, and Connect receives policy number plus documents. An embed or a required NEXT portal is a no-go.
- Sequence: WC live in CO, deepen Coterie, then other direct carriers on the same pattern. Revisit NEXT only for a hard gap.
- CoverForce was approached as infrastructure, not as a competing agency.
- Simply Business is a market analog. It is not the CID front door.
- Three rails: long-form, Coterie BOP/GL, GUARD WC. Same intake, same Connect. Cards are complementary coverages.

## 2026-08-20 — GUARD product shape

- NBQ indication is about 2–4 extra fields. FEIN is not required for the indication.
- NBS is the longer question set plus FEIN, then BND.
- GUARD direct-bills. CID is not merchant of record.
- Clickwrap unless GUARD requires a signed PDF.
- Customers never see the name “Digital Decision.”
- WC on/off is per segment. A new ConnectQuote trade does not turn WC on.
- Later, WC may be sold first. The adapter must not require a Coterie policy.

## Standing

- Connect is not on Render.
- Browser uses the Famous anon key only. `SUPABASE_SERVICE_ROLE_KEY` stays on servers.
- Gerry sends partner email (Jon, David). The agent does not email Jon unless Gerry asks.
- Claude is primary for coverage chat. Gemini is the fallback.

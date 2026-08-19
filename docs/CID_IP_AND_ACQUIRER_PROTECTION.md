# CID — IP, AI-assisted development, and what a buyer CIO/CTO is purchasing

> **Audience:** Ray (Executive Chairman), counsel, and a future acquirer CIO/CTO  
> **As of:** 2026-08-19  
> **Entity:** Commercial Insurance Direct, Inc. (Colorado C Corp, EIN 42-3060315)  
> **Related:** [`CID_INVESTMENT_THESIS.md`](./CID_INVESTMENT_THESIS.md) · [`CID_ARCHITECTURE.md`](./CID_ARCHITECTURE.md) · [`AUDIT_READINESS.md`](./AUDIT_READINESS.md) · [`compliance-roadmap.md`](./compliance-roadmap.md) · [`partnerships.md`](./partnerships.md) · [`direct-partner-discovery-rss.md`](./direct-partner-discovery-rss.md)

This memo is the combined diligence answer. It does **not** claim patent exclusivity. It states what CID owns, what is licensed, how AI was used, and why a strategic buyer can take title to a **transferable platform** — not a pile of public prompts.

**BLUF:** CID was built by its founders using AI as a development accelerator — not as an author. IP is owned by the Corporation. Corporate paper is **signed and GC-reviewed**. The moat is real, defensible, and grows with every bind. A strategic acquirer gets clean title, carrier relationships that cannot be replicated on any timeline, and operational data that compounds daily.

---

## The question a buyer CIO/CTO actually asks

Not “could someone clone a landing page with Claude?”

They ask:

1. **Who owns this?** Can we take clean title at close?
2. **What’s commodity vs proprietary?** Will we inherit a trapped vendor or a transferable stack?
3. **Can we run it?** Architecture, secrets, audit trail, key-person risk.
4. **Why buy vs build?** Speed, working product, appointments, data — not secret compiler technology.

**Short answers:**

| Question | Answer |
|----------|--------|
| Do we own the IP? | **Yes — the CID platform** (code, templates, workflows, prompts, Connect orchestration). Assigned to **CID Inc.** via executed PIIA and Schedule A (GC-reviewed). |
| Are we using publicly available software? | **Yes, on purpose.** Node, React, Render, Netlify, Coterie API, Claude API — licensed infrastructure. Acquirers prefer this. |
| Did AI “build” CID? | **No.** Founder-directed architecture and business logic. AI coding tools accelerated implementation (like an IDE). |
| Can anyone duplicate CID with Claude? | **A shallow copy, not the operating system.** Code can be re-attempted in 12–18 months. Appointments, live book, HomeBase mappings, production failure modes, and CONNECT data cannot. |
| Is the buyer protected? | **Yes, when diligence confirms title.** They buy a running distribution + servicing platform on standard, transferable infrastructure — with **signed inter-company structure** and **documented carrier appointments**. |

---

## Corporate paper — status (GC-reviewed, August 2026)

These items are **complete**. They are the foundation for “clean title” conversations with Ray and any acquirer CIO.

| Document | Status | What it proves |
|----------|--------|----------------|
| **PIIA (all three founders)** | **Executed** | All CID commercial insurance IP assigned to Commercial Insurance Direct, Inc. |
| **Schedule A** | **Complete — GC reviewed (Bob Hersher)** | RSS Engine, ConnectQuote, CONNECT, **CID_HomeBase**, Am I Covered orchestration, and ACORD field mapping explicitly named and assigned |
| **Inter-company services agreement** (All Access Insurance LLC ↔ CID Inc.) | **Signed — GC reviewed** | Licensed producer relationship, IP boundary, commission flow, and **transferability post-acquisition** documented |
| **Segment → carrier appointment matrix** | **Complete — Rick / GC** | Who is appointed for each segment; traditional vs instant rail; All Access / Rick Cline as producer of record |
| **Board resolution (August 2026)** | **Adopted** | Officer titles only (Ray Executive Chairman, Gerry CEO, Rick CRO); equal 30/30/30 equity unchanged |

**Officer titles note:** The board resolution amends **titles only** — not equity, compensation, or founder rights. Gerry remains the sole technical architect; that is operational fact, not a governance change from the resolution.

**All Access in diligence:** All Access Insurance LLC is the **licensed producer of record** operating under the inter-company agreement. An acquirer inherits this structure **by design** — not as an ambiguity to unwind.

---

## What CID owns vs what CID licenses

### CID Inc. owns (assigned via PIIA + Schedule A)

| Asset | What it is |
|-------|------------|
| **Application code** | `pdf-backend` (CID-PDF-API), `cid-connect`, segment Netlify shells, **CID_HomeBase** (templates, mapping JSON, SVG-to-PDF) |
| **Workflows & data model** | S1–S6 pipeline, immutable submissions, timeline, R2 document trail, Connect API bridge |
| **Product logic** | ConnectQuote dual rail, segment replication, ACORD/SUPP mapping, operator S4–S6, COI fulfillment |
| **Am I Covered orchestration** | When to call the model, what policy context is injected, guardrails, UX, **Gemini fallback**, server-side proxy (keys never in the browser) — **not** the foundation model |
| **Brands & domains** | 9+ live segment brands; CONNECT; commercial hub |
| **Operating data** | Attribution, binds, CONNECT usage, conversion learning (compounds after launch) |
| **Segment Launch SOP** | Sub-5-hour deployment methodology (documented operational know-how) |

### CID licenses (does not own)

Coterie API (today’s primary instant rail), Stripe via Coterie, Render, Netlify, GitHub, Google Workspace, Cloudflare R2, BoldSign, Famous/Supabase, Anthropic Claude, Google Gemini, Instantly, npm packages (MIT/BSD/Apache typical).

**Future ConnectQuote partners** (GUARD, Next, Thimble, and others) will appear here as **licensed carrier/MGA rails** — same pattern as Coterie. CID owns the **orchestration, intake, segment templates, and CONNECT handoff**; partners own rating engines and paper.

**Old-school CTO translation:** We are not selling a novel algorithm. We are selling **integrated commercial-insurance distribution and servicing infrastructure** built on a commodity stack — the same pattern as most insurtech and fintech exits. Defensibility is **system + data + relationships + running production**, not secret compiler technology.

---

## ConnectQuote carrier expansion — roadmap (multi-rail platform)

ConnectQuote is architected as a **multi-partner instant-bind layer**, not a single-vendor feature. Coterie is **rail v1 (live in Colorado)**. Additional partners strengthen the acquirer story: **distribution breadth, line-of-business coverage, and reduced single-carrier concentration.**

| Phase | Partner / program | Lines | Status | Owner |
|-------|-------------------|-------|--------|-------|
| **Live** | **Coterie** (MGA / API) | BOP, GL (+ PL where appetite) | **Prod — CO**; 7 ConnectQuote domains, 9 marketable lines (Fitness = yoga / pilates / trainer) | Gerry / Rick |
| **In development** | **GUARD** (W.R. Berkley) | Workers’ Comp | Program in development via Rick’s carrier relationships | Rick |
| **Discovery** | **Next Insurance** | SMB commercial (scope TBD) | RSS discovery — API vs hosted, Connect post-bind handoff | Rick / Gerry |
| **Discovery** | **Thimble** | On-demand / SMB (scope TBD) | RSS discovery — MoR + payment surface per rail | Rick / Gerry |
| **Discovery** | **USLI / CoverSmart** | Small business + special events | Appointment in place; RSS discovery template ready | Rick / Gerry |
| **Ongoing** | **Additional MGAs / API carriers** | As appetite aligns with segments | Same RSS question set — [`direct-partner-discovery-rss.md`](./direct-partner-discovery-rss.md) | Rick |

**Integration pattern (repeatable):**

1. **Discovery** — sandbox, API/embed spec, appetite by segment/state, post-bind document flow into CONNECT  
2. **Paper** — appointment, DPA, MoR/PCI row documented before prod (see [`connectquote-shipped-2026-06.md`](./connectquote-shipped-2026-06.md))  
3. **Build** — backend adapter on CID-PDF-API; segment intake shell unchanged; `segment` + `bind_source` in cid-postgres  
4. **Launch** — CO pilot → state expansion with producer licensing gate (same as Coterie today)  
5. **Operate** — CONNECT remains insured policy home; carrier portal is not the retention layer  

**What Ray can say:** *“We are not betting the company on one API. Coterie proves the rail. GUARD adds WC. Next, Thimble, and others enter through the same ConnectQuote + CONNECT pattern as they become available.”*

**Traditional rail unchanged:** Bar and Roofer remain **ACORD S1–S6 only** (no ConnectQuote appetite). Every segment still has a path to bind.

---

## How the platform was built (accurate story)

**Directed by Gerry Jones (CEO)** with co-founder product and insurance input (Ray, Rick). AI coding assistants (Cursor, Claude, Gemini) were **implementation tools**, not authors of the architecture.

Same relationship as an architect using AutoCAD: the building is the architect’s IP, not AutoCAD’s.

**Do say:**

> I architected and directed the platform. AI assistants accelerated implementation — like a very fast senior developer team. Design decisions, integrations, and production behavior are ours. Commercial Insurance Direct, Inc. owns the resulting code.

**Do not say:**

> The AI built it / it’s mostly Claude / anyone can prompt the same thing.

Anthropic (and similar vendors) **do not claim ownership of customer outputs** under current API terms. Using an assistant to write code does not put the codebase in the public domain. Diligence is satisfied by **human direction + executed assignment to the corporation + a clean third-party license map**.

### Am I Covered (the only production LLM feature)

This is a **directed API integration**, not “AI-generated product.”

- **CID owns:** policy context assembly, system prompts, Connect UX, disclaimers, logging policy, **Gemini fallback**, server-side proxy (keys never in the browser).
- **Anthropic / Google own:** the model APIs. Swappable vendors — same pattern as Coterie for bind.

A buyer CTO prefers **vendor swappability** over a claim that we invented a foundation model.

---

## Protection layers (we are not unprotected)

Protection is **layered**. None of these stop an independent team from building a similar *idea*. Together they protect **this implementation** and give an acquirer **clean title**.

| Layer | What it does | Status |
|-------|----------------|--------|
| **1. Corporate ownership** | One answer to “who owns this?” — CID Inc. | **Done** — PIIA, Schedule A, inter-company agreement (GC-reviewed) |
| **2. Copyright** | Protects the *expression* (source code). Exists on creation; registration strengthens enforcement | **Next step** — file US Copyright registration (~$65) |
| **3. Trade secret** | Protects know-how: mappings, dual-rail logic, prompts, segment SOP, operating data | **Active** — private repos, MFA, least privilege, NDAs, secrets in env not Git |
| **4. Access & hygiene** | Proves we treated the code as proprietary | **Active** — private GitHub; MFA; no shared logins; `.env` gitignored |
| **5. License hygiene** | Proves we didn’t contaminate title with copyleft | **Pending** — npm/OSS scan before external diligence claims |
| **6. Operational moat** | What a CIO actually cannot rebuild next quarter | **Compounding** — Coterie appointment, GUARD in flight, HomeBase library, CONNECT book, multi-carrier roadmap |

**Order of spend:** ownership ✅ → confidentiality/trade secrets ✅ → security (ongoing) → copyright registration → npm audit → documentation → *then* selective patent review. Do **not** patent “segment insurance + instant quote” as a business method without a patent attorney confirming a real technical invention.

---

## Can Claude duplicate CID?

| Easy to copy (weeks–months) | Hard to copy (capital, time, relationships) |
|-----------------------------|-----------------------------------------------|
| Segment landing pages, generic forms | **CID_HomeBase** templates + ACORD/SUPP mapping |
| Sandbox “instant bind” demo | **Prod** Coterie path, CO licensing, appetite, webhook doc ingest |
| Generic policyholder app shell | CONNECT: vault, COI hub, Am I Covered orchestration, retention UX |
| Cold email + a URL | Appointments, producer of record, Gmail poller + S4–S6 in production |
| — | Live binds, CAC, CONNECT behavior, **GUARD / Amwins / Rick’s carrier relationships** |
| — | **Multi-carrier ConnectQuote roadmap** once rails are live |

**Honest line for Ray:**

> A funded team could attempt a similar stack in 12–18 months. They cannot buy our appointments, our live book, Rick’s carrier relationships, or the operational scar tissue in this codebase tomorrow.

Never present the moat as: *“Nobody can recreate our software.”* Present the moat as: **integrated operating system + carrier connectivity + segment deployment + persistent customer relationship + compounding data + expanding instant-rail portfolio.**

---

## Segments and geography (August 2026)

| Category | Segments |
|----------|----------|
| **ConnectQuote + Instantly (CO marketing)** | Electrical, HVAC, Plumber, Beauty, Cleaning, Pet, Fitness — **9 marketable lines** (Fitness = yoga, pilates, personal trainer) |
| **Traditional ACORD only** | Bar, Roofer |
| **Geography** | **Colorado only** for marketing and instant bind until state gates cleared per partner |

Say **“7 ConnectQuote domains; 9 marketable lines counting Fitness classes”** — not “7 segments” alone.

---

## Why a buyer CIO/CTO buys rather than builds

Carrier IT is typically booked 18–24 months maintaining core (Guidewire, Duck Creek). Internal “digital direct” projects often stall on intake complexity.

They buy CID for:

1. **Speed** — working ConnectQuote + CONNECT + dual rail (API + traditional ACORD S1–S6), not a greenfield program.
2. **Clean architecture** — one backend (`CID-PDF-API`); segment sites are shells; audit trail in Postgres + R2 (`AUDIT_READINESS.md`).
3. **Transferable stack** — standard cloud and open source; no exotic lock-in that dies with a vendor.
4. **Distribution rights** — Coterie appointment live; GUARD and additional rails in pipeline; Rick as producer of record (often worth more than the repo).
5. **Servicing economics** — CONNECT designed to drive CSR cost toward zero on sub-$5k policies (the $250–$500/file industry problem in the thesis).
6. **Multi-carrier optionality** — ConnectQuote pattern replicates per partner; acquirer inherits roadmap, not a fork.

They are **not** buying “we used Claude.” They are buying **a functioning capability** they can drop onto a book they cannot profitably service today.

---

## Are they protected with this purchase?

**Yes — when diligence confirms title.** At close the buyer should receive:

| Deliverable | Why the CIO sleeps |
|-------------|-------------------|
| **Assignment of all CID software IP** to CID Inc. (then to buyer) | **Done** — PIIA + Schedule A on file |
| **Inter-company + appointment matrix** | **Done** — GC-reviewed; producer and segment rails documented |
| **Private source + Git history** | Provenance: who built what, when |
| **Dependency / license schedule** | No surprise GPL in the core (audit pending — do not overclaim until complete) |
| **Architecture + runbooks** | Another engineering team can operate it |
| **Vendor contracts** | Coterie, hosting, e-sign, LLM API — listed, transferable or replaceable |
| **Data & appointments** | Book, CONNECT usage, producer/agency rights as contracted |
| **ConnectQuote expansion plan** | Multi-rail roadmap reduces single-carrier concentration narrative |

**Residual risks (normal, disclose them):** key-person knowledge (Gerry) until advisor pass + runbooks mature; **Coterie concentration today** (mitigated by multi-rail roadmap); LLM vendor for Am I Covered (swappable); SOC 2 not yet certified (`compliance-roadmap.md`).

Those are **priced** in diligence. They are not “we have no IP.”

---

## How to answer a CTO in due diligence (fact-checked 2026-08-19)

| Question | Answer |
|----------|--------|
| Who wrote the code and who owns it? | Designed and directed by Gerry Jones (CEO). All IP assigned to CID Inc. via **executed PIIA and GC-reviewed Schedule A**. |
| Was AI used to write this code? | AI tools accelerated implementation. One production AI feature: **Am I Covered?** — CID orchestrates; Claude primary, Gemini fallback. |
| Can a competitor replicate this? | UI: yes, superficially. Coterie appointment, GUARD relationship, ACORD mapping, bind data: **no on any useful timeline**. |
| What open-source components are used? | Standard MIT/Apache/BSD npm ecosystem. **Dependency audit pending** — do not claim “no GPL” externally until scan completes. |
| What segments are live and where? | ConnectQuote + Instantly: Electrical, HVAC, Plumber, Beauty, Cleaning, Pet, Fitness (3 classes). Bar/Roofer traditional. **CO only.** |
| What happens to All Access? | Licensed producer under **signed inter-company agreement** — structured for clean acquirer inheritance. |
| Single carrier dependency? | Coterie is **rail v1 live**. GUARD, Next, Thimble, USLI in discovery/development — **multi-rail ConnectQuote** is the product direction. |
| Why buy instead of build? | Operational today; dual rail; CONNECT servicing economics; carrier relationships and data compounding — vs 18–24 month carrier IT queue. |

---

## Scoped technology advisor (not a full-time CTO yet)

Ray’s instinct is right. The hire is **not** a $200k CTO to rewrite the stack. It is a **short diligence pass** (days to a few weeks) by someone who has **been through an insurance or vertical-SaaS acquisition**.

Ask them:

- Confirm architecture docs match the code.
- OSS license scan (copyleft risk).
- Am I Covered: clean server-side integration, no IP complication.
- What a carrier M&A tech team will ask (dependency map, Render outage, Coterie appetite change, CONNECT migration, **second instant rail integration**).
- Red / yellow / green memo — **not** “rebuild it.”

**Red flags:** wants to re-platform before GWP proof; treats AI-assisted development as invalid ownership.

---

## Talking points for Ray (use these)

1. **We own the platform.** Code, templates, mappings, Connect, and Am I Covered *orchestration* belong in CID Inc. We **rent** Claude the same way we rent Render and Coterie.

2. **The paper is done.** PIIA, Schedule A, inter-company agreement, and appointment matrix are **signed and GC-reviewed** — clean title is not a future hope; it is current state.

3. **Public software is a feature.** Standard stack = auditable, transferable, SOC-capable vendors. Value is what we built **on top**.

4. **AI assisted; it did not author the company.** Founder-directed architecture. Git history is the contemporaneous record.

5. **ConnectQuote is becoming multi-carrier.** Coterie proves the model. GUARD, Next, Thimble, and others follow the same RSS pattern as appointments and APIs open.

6. **A CIO is protected at purchase** when they get clean title, a running dual-rail system, documented architecture, and the distribution/servicing layer — not when we pretend we invented the LLM.

7. **The moat compounds after launch.** Every bind and CONNECT session is data a clone does not have.

---

## Remaining checklist (post-paper)

| # | Action | Who | Status |
|---|--------|-----|--------|
| 1 | ~~PIIA + Schedule A + inter-company + appointment matrix~~ | GC / Rick | **Done** |
| 2 | npm dependency audit — GPL/AGPL scan across active repos | Gerry / Cursor | Pending |
| 3 | US Copyright registration — core platform (representative deposit) | Gerry + GC | Pending (~$65) |
| 4 | Segment Launch SOP — formalize sub-5-hour deployment for diligence package | Gerry | In progress |
| 5 | Technology advisor — 2–3 day diligence readiness (insurance M&A experience) | Ray + Gerry | Planned |
| 6 | Vendor DPA folder — Render, Google, BoldSign, Anthropic, Famous, Cloudflare | Gerry / Ray | Pending |
| 7 | ConnectQuote partner discovery — Next, Thimble, USLI per RSS template | Rick / Gerry | Ongoing |

---

*Not legal advice. GC (Bob Hersher) maintains corporate records. Source of truth: Git (`pdf-backend/docs/`) — auto-synced to CID Partner Docs.*

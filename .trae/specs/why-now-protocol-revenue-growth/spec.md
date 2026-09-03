# Spec: Why Now — Protocol Alignment, Revenue-Growth Loop, and Agent-to-Agent Commerce

## 1. Problem

The hackathon Track 01 (AI Growth & Agentic Commerce) explicitly anchors submissions to the 2025–2026 global protocol race: NPCI UAP (Unified Agent Payments), ACP (Agent Commerce Protocol), AP2 (Agent Payments Protocol), and x402 (HTTP-native machine payments). These protocols define how buyer agents and merchant agents negotiate offers, issue signed mandates, discover capabilities, and settle money — the "open problem of the year."

The current Urban Store build delivers all four example directions (conversational checkout, agent-readable catalog, upsell/cross-sell, campaign orchestrator) and partially meets "the bar" (gated money actions, audit trail, graceful failure handling). However, it is structurally incomplete in five areas that Track 01 judges will weight heavily:

1. **No protocol alignment artifacts.** Zero explicit mapping to UAP/ACP/AP2/x402 concepts. No `.well-known` discovery endpoints beyond OAuth. No protocol-version response headers.
2. **No merchant-side negotiation agent.** The store acts as a passive API surface (buyer calls store). No offer/counter-offer exchange, which is the core of all four protocols.
3. **YES gate missing on the MCP (AI buyer) path.** `/api/v1/agent/chat` enforces server-side confirmation; `/mcp` `create_checkout` relies solely on LLM prompt instructions — no server-side enforcement. This violates the "bounded and gated" bar.
4. **Rate limiting absent on money-action routes.** Catalog, cart, checkout, orders, admin, behaviour, and MCP routes have zero per-client rate limits — only auth and agent chat are protected.
5. **Campaign revenue loop is open.** `Campaign.projections` stores projected numbers, but no backend or frontend compares projected vs. actual revenue, units sold, or margin after a campaign runs.
6. **Campaign discount caps exist only in LLM prompts.** The 5% minimum margin rule and any discount floor live inside the Groq prompt — not enforced in code, making them vulnerable to hallucination or prompt injection.

## 2. Users & Stakeholders

| User | Goals in scope |
|---|---|
| **Hackathon Judges (Track 01)** | Verifiably solve the "open problem of the year" (protocol-level agent-to-agent commerce); demonstrate "every money action explainable, bounded, gated"; show audit trail + graceful failure handling |
| **Merchant Admin** | Visibly verify that AI campaigns grow revenue (actual vs projected); configure and enforce hard discount/margin caps; inspect and revoke trusted AI buyer agents; manage UAP-style delegated spending mandates |
| **Shopper User** | Issue UAP-style spending blocks with rules (category, budget, expiry); see protocol-compliant signed mandate proofs for every agent action |
| **AI Buyer Agent (Claude/ACP clients)** | Discover merchant capabilities via standard `.well-known` endpoints; negotiate offers/counters; submit AP2-compliant signed Intent/Cart/Payment Mandates; transact via exact ACP checkout shapes |

## 3. Goals

### Primary Goals (Must-Solve For Track Judging)

- **G1 — Protocol narrative lock.** Produce concrete, evidence-backed alignment artifacts (protocol mapping doc, 4 `.well-known` discovery endpoints, protocol response headers) that directly answer the hackathon's "Why Now / protocol race" framing.
- **G2 — Gated money actions (every path).** Close the MCP YES-gate security hole. Enforce hard discount/margin caps in code, not prompts. Extend rate limiting to every route touching money or state.
- **G3 — Merchant agent that negotiates.** Add a merchant-side negotiation endpoint (`/api/v1/merchant-agent/negotiate`) that accepts buyer offers, counters or rejects based on campaigns/stock/margin, and returns ACP-shaped responses.
- **G4 — AP2 Mandate objects (signed).** Wrap the existing YES gate and spending rules in AP2-compliant JSON-LD Mandate objects (Intent, Cart, Payment) with HMAC signatures. The old YES gate still works but is now a standards-compliant Mandate verifier.
- **G5 — Campaign loop closed.** Add backend aggregation + admin dashboard card that compares `projections.withCampaign` vs. actual revenue, units sold, and margin — per campaign, per day.
- **G6 — UAP-style delegated spending.** Add a SpendingMandate model + `/mandates` page so shoppers can pre-authorize bounded blocks (e.g. "Urban Store Agent can spend up to ₹3,000 on footwear this month"). Check mandates at policy-check time.
- **G7 — ACP-compliant checkout endpoints.** Add parallel ACP v1 shapes: `POST /v1/checkouts`, `PATCH /v1/checkouts/:id`, `POST /v1/checkouts/:id/complete`, `DELETE /v1/checkouts/:id`, returning `SharedPaymentToken`.

### Secondary Goals (Nice-to-Have, Jury Catnip)

- **G8 — Agent trust registry dashboard.** `/admin/agents` listing every OAuth grant with trust score, order history, and block/revoke controls. Expose as `.well-known/trusted-agents`.
- **G9 — `ai-plugin.json` manifest.** So ChatGPT (and non-MCP clients) can discover the store as a plugin.
- **G10 — Schema.org/JSON-LD Product markup.** So crawler-style agents can ingest the catalog.

### Non-Goals (Explicitly Out of Scope)

- **No production-grade cryptographic key infrastructure.** We'll use HS256 (shared-secret HMAC via `process.env.MANDATE_SECRET`) for mandate signing instead of ECDSA/ED25519 key pairs. Judges look for the shape and semantics, not the key ceremony.
- **No integration with actual UPI / Razorpay UAP sandbox.** UAP launches at GFF Sept 2026; no sandbox exists yet. Alignment is through shapes, patterns, naming, and documentation.
- **No multi-tenant merchant system.** This is a single-tenant demo store (Urban Store) with one admin.
- **No prompt/LLM changes beyond configuration strings.** The 13-tool agent flow and campaign LLM prompts remain as-is unless a specific parameter needs to be surfaceable.
- **No new catalog products or seed data changes.** Existing Prisma seed + 500-product catalog JSON is sufficient.
- **No new test harness framework.** Critical-path self-verification is done via temporary scripts and manual tool calls; no jest/vitest setup.

## 4. Functional Requirements (FRs)

### FR-01 Protocol Mapping Document
- System SHALL provide a `PROTOCOL_ALIGNMENT.md` file at repo root that 1:1 maps Urban Store features to UAP, ACP, AP2, and x402 concepts with absolute file references.

### FR-02 Protocol Discovery Endpoints (4 new)
- `GET /.well-known/agent-commerce` SHALL return an ACP v1 capability manifest: checkout endpoints, supported mandate types, accepted payment rails, OAuth metadata link.
- `GET /.well-known/ap2-mandate` SHALL return an AP2 mandate verification endpoint URL, supported mandate types (intent, cart, payment), and the public verification key fingerprint (for HS256 we return `k=SHA256(base64(MANDATE_SECRET))` fingerprint plus algorithm).
- `GET /.well-known/ucp-catalog` SHALL return a UCP/UAP catalog discovery manifest: semantic search endpoint URL, product schema reference, category tree, feed URLs.
- `GET /.well-known/ai-plugin` SHALL return a ChatGPT Plugin manifest v1: name, description, `api.url` → OpenAPI, `auth` → OAuth referencing `/.well-known/oauth-authorization-server`.
- The existing `/.well-known/oauth-authorization-server` SHALL remain unchanged.

### FR-03 Protocol Version Response Headers
- Every HTTP response (all routes) SHALL include:
  - `X-ACP-Protocol: "1.0; supported"`
  - `X-AP2-Mandates: "intent;cart;payment"`
  - `X-UAP-Capable: "reserve-pay;circle"`
- Responses from the new `/v1/checkouts` and `/merchant-agent/negotiate` endpoints SHALL additionally include `X-Protocol-Compliance: "acp-v1;ap2-v1"`.

### FR-04 MCP YES Gate (Server-Side Enforcement)
- The MCP `create_checkout` tool handler SHALL:
  1. Create a checkout record and transition it to `pending_confirmation`.
  2. Return an `AP2 CartMandate` payload with `mandateId`, `checkoutId`, `amount`, `itemsSnapshot`, `expiresAt`, and `toSign` digest fields.
  3. **Not call** `createCheckout()` successfully and return a `paymentUrl` / Razorpay order until `/mcp confirm_checkout(mandateId, signature)` is received and the signature validates against the MCP session's OAuth client secret + mandate nonce.
- Confirmation SHALL expire after 5 minutes (TTL matches the existing `pendingCheckoutConfirmations` TTL used for human-agent chat).
- Audit log SHALL distinguish `mcp_mandate_issued`, `mcp_mandate_confirmed`, and `mcp_mandate_rejected` events.

### FR-05 Comprehensive Rate Limiting
- `@fastify/rate-limit` SHALL be applied with distinct limits:
  - Auth/OAuth routes: 20/min/IP (existing, unchanged).
  - Agent chat routes: 30/min/IP + 20/min/user (existing, unchanged).
  - Catalog routes: 120/min/IP.
  - Cart routes: 60/min/IP + 30/min/user.
  - Checkout routes: 20/min/IP + 10/min/user (💸 money action).
  - Order routes: 60/min/IP + 30/min/user.
  - MCP routes: 60/min/IP + 30/min/grantId (💸).
  - Behaviour routes: 120/min/IP.
  - Admin routes: 60/min/user.
- When rate limit is exceeded, response SHALL be 429 with `Retry-After` header + body `{ error: "RATE_LIMITED", retryAfterMs: <n> }`.
- Per-key rate limits (user, grantId) SHALL apply even when unauthenticated.

### FR-06 Hard Campaign Margin / Discount Caps (Enforced In Code)
- `executeCampaignAction()` in campaign.service.ts SHALL enforce:
  - Minimum effective margin: 5% of `costPrice` → `finalPrice >= costPrice * 1.05`.
  - Maximum discount: 70% off `basePrice` → `finalPrice >= basePrice * 0.30`.
  - Price change may only decrease base price (no inflation via campaigns).
  - URGENCY campaigns SHALL only set a badge + `expiresAt`; SHALL NOT mutate price unless combined with CLEARANCE intent.
- If the LLM proposes a campaign that violates these rules, `approveCampaign()` SHALL reject with a policy error detailing which rule was violated.
- The rule SHALL also be re-checked at `executeCampaignAction` time (defense in depth, because approval → execution can be days apart).

### FR-07 Merchant Negotiation Agent
- New service `merchant-agent.service.ts` SHALL export:
  - `negotiateOffer(buyerAgentId: string | null, offer: NegotiateOffer, grantId?: string): Promise<NegotiateResponse>`
- NegotiateOffer shape:
  ```
  {
    items: [{ sku: string; qty: number; maxPricePerItem?: number }],
    maxTotal?: number,
    discountPercent?: number,
    buyerAgent?: { id: string; mandateReference?: string },
    note?: string
  }
  ```
- NegotiateResponse SHALL be one of:
  - `{ outcome: "ACCEPT"; items: [{sku,qty,acceptedPrice}], total, expiresAt, paymentUrl, mandate: CartMandate }`
  - `{ outcome: "COUNTER"; items: [...], counterTotal, counterNote, expiresAt, counterReference }`
  - `{ outcome: "REJECT"; reason: "OUT_OF_STOCK" | "PRICE_TOO_LOW" | "POLICY_REJECTED" | "MAX_QTY_EXCEEDED"; policy?: PolicyResult }`
- Logic:
  1. For each item, resolve active campaign price via `policy.service.ts` snapshot logic.
  2. If buyer `maxTotal` / `discountPercent` is within 10% of the store's best active price → ACCEPT.
  3. If buyer offer is below 10% threshold but still above margin floor → COUNTER with the campaign best price + explanation.
  4. If below margin → REJECT with `PRICE_TOO_LOW`.
  5. Check stock via `validateCartPolicy`-style logic.
  6. On ACCEPT, pre-reserve stock for `expiresAt` (5 min TTL) by creating a temporary `StockReservation` row.

### FR-08 Stock Reservation Model
- New Prisma model `StockReservation` SHALL:
  - `id` (cuid), `variantSku` (String, FK to ProductVariant), `qty` (Int), `reservedAt` (DateTime), `expiresAt` (DateTime), `checkoutId` (optional FK), `reference` (String — mandate/counter reference), `consumedAt` (DateTime, nullable).
- Stock availability check in catalog.service.ts SHALL subtract unexpired, unconsumed reservations from `inStock`.
- On successful `confirmCheckout`, reservations with matching `checkoutId` SHALL be marked `consumedAt = now()`.
- Expired or failed checkouts SHALL release reservations via a periodic sweep (in practice, checked lazily at each availability read).

### FR-09 AP2 Mandate Objects (3 Types + HMAC Signing)
- New service `mandate.service.ts` SHALL export:
  - `signIntentMandate(payload): IntentMandate` — returns signed HMAC payload.
  - `signCartMandate(payload): CartMandate` — returns signed HMAC payload.
  - `signPaymentMandate(payload): PaymentMandate` — returns signed HMAC payload.
  - `verifyMandate(signedObject): { valid: boolean; payload; error?: string }` — validates signature, expiry, fields.
- All mandates SHALL include: `@context: "https://ap2.dev/v1"`, `id`, `type`, `issuer` (userId), `agent` (agent identifier or `user`), `issuedAt`, `expiresAt`, `conditions`, `signature: "HS256:<base64(hmac)>"`.
- Signature SHALL be computed over the deterministic canonical JSON of `{ id, type, issuer, conditions, issuedAt, expiresAt, nonce }` key-sorted, UTF-8, hashed via SHA-256 then HMAC-SHA256 with `MANDATE_SECRET`.
- Nonce SHALL be 16 random bytes hex.
- `createCheckout()` in checkout.service.ts SHALL, when a `cartMandate` object is passed in, call `verifyMandate()` and only proceed with Razorpay order creation if the mandate is both valid AND non-expired AND covers each cart item at or above the snapshot price.
- Human-agent YES gate in agent.routes.ts SHALL internally create a `CartMandate` and store its signature. Old route API is preserved (binary YES). Internals migrate to mandates.

### FR-10 Campaign Performance (Actual vs Projected)
- New analytics.service.ts aggregator: `getCampaignPerformance(campaignId): CampaignPerformance` SHALL compute:
  - `projected`: stored projections.withCampaign (unitsSold, revenue, margin%).
  - `actual`: real order-items where `createdAt >= campaign.approvedAt` AND `(createdAt <= campaign.expiresAt OR NOW())` AND `productId == campaign.productId` AND price matches the campaign price.
  - `delta`: `{ unitsSoldDiff, revenueDiff, marginDiffPct, deltaPercent }`.
  - `interval`: daily buckets for the campaign window.
- Admin `/api/v1/admin/campaigns/:id/performance` endpoint SHALL return the above.
- Admin campaigns list page SHALL render a per-campaign performance summary column: projected revenue vs. actual-to-date revenue with delta% and a sparkline placeholder.

### FR-11 UAP-Style Spending Mandate (Reserve Pay Block)
- New Prisma model `SpendingMandate`:
  - `id` (cuid), `userId` (FK), `name`, `scope` (enum: `CATEGORY` / `SUB_CATEGORY` / `PRODUCT` / `ALL`), `scopeValue` (string — category id or productId), `budgetTotal` (Int paise), `budgetUsed` (Int paise, default 0), `maxPerOrder` (Int paise, nullable), `startsAt` (DateTime), `expiresAt` (DateTime), `status` (ACTIVE / PAUSED / REVOKED / EXPIRED / EXHAUSTED), `revokedAt` (DateTime?).
- Backend:
  - `GET /api/v1/mandates` (user-auth) → list user's spending mandates.
  - `POST /api/v1/mandates` → create (name, scope, budgetTotal, maxPerOrder, expiresAt).
  - `POST /api/v1/mandates/:id/pause`, `POST /api/v1/mandates/:id/resume`, `POST /api/v1/mandates/:id/revoke` → state transitions.
- Policy check at `validateCartPolicy`:
  - If any active spending mandate covers the cart items and budget remains, the mandate SHALL be attached.
  - If no mandate covers and `agentGrantId` is present → `POLICY_REJECTED` with "No active spending mandate for agent purchase" unless user explicitly passed a cart mandate override (the YES gate).
  - At `confirmCheckout` success, `budgetUsed += checkout.total`; if `budgetUsed >= budgetTotal` → status `EXHAUSTED`.

### FR-12 Frontend Pages
- `app/mandates/page.tsx` → User-facing spending mandates dashboard: table with scope/budget/used/expiry; create-modal; pause/resume/revoke buttons.
- `app/admin/agents/page.tsx` → Trusted-agent registry (secondary goal, low priority).
- `app/admin/campaigns/page.tsx` → Enhance existing campaign cards with actual-vs-projected widget per campaign.

### FR-13 ACP-Compliant Checkout Shapes
- Parallel ACP checkout routes in a new `acp.routes.ts`:
  - `POST /v1/checkouts` → body `{ items:[{sku,qty}], metadata? }` → 201 `{ id, items, totalAmount, currency: "INR", expiresAt, sharedPaymentToken: { id, jwt, expiresAt } }`.
  - `PATCH /v1/checkouts/:id` → modify items (add/remove/qty) → 200 updated checkout + token.
  - `POST /v1/checkouts/:id/complete` → Razorpay-order + confirm equivalent, given payment mandate reference.
  - `DELETE /v1/checkouts/:id` → cancel equivalent with audit.
- SharedPaymentToken JWT payload: `{ checkoutId, amount, expiresAt }` signed via same `MANDATE_SECRET` HS256 (audience "acp-v1").

### FR-14 Audit Coverage
- Every new flow SHALL emit server-side AuditLog entries:
  - Merchant-agent: `negotiate_offer`, `negotiate_accept`, `negotiate_counter`, `negotiate_reject`.
  - MCP mandates: `mcp_mandate_issued`, `mcp_mandate_confirmed`, `mcp_mandate_rejected`.
  - Campaigns: `campaign_performance_viewed`.
  - Spending mandates: `spending_mandate_created`, `spending_mandate_paused`, `spending_mandate_revoked`, `spending_mandate_exhausted`, `spending_mandate_consumed`.

## 5. Non-Functional Requirements (NFRs)

- **NFR-01 Idempotency.** Every new POST endpoint that mutates state SHALL accept an optional `Idempotency-Key` request header and store / return 409 Conflict for replayed keys within 24 hours (MCP + ACP + negotiate + spending-mandate create + mandate create).
- **NFR-02 Least privilege.** Only create-cart scope is needed for MCP add-to-cart, etc. Existing scope-based checks SHALL apply to new routes.
- **NFR-03 Graceful degradation.** If `MANDATE_SECRET` env var is missing, mandate service SHALL fall back to `JWT_SECRET`, then to a generated dev secret (console warning on boot). Never crash boot.
- **NFR-04 Vercel edge compatibility.** Prisma, Fastify (Vercel API function), and Node crypto primitives are already used and Vercel-compatible. New code SHALL NOT introduce native modules or WASM without checking existing build.
- **NFR-05 Seeded determinism.** `StockReservation`, `SpendingMandate`, and mandate signing SHALL use `crypto.randomBytes` for nonces; all timestamps via `new Date()`/Prisma.
- **NFR-06 Minimal LLM cost.** Merchant agent negotiation SHALL NOT call Groq for routine cases (rules engine only). Campaign generation frequency remains unchanged.
- **NFR-07 Latency budget.** Negotiate offer and performance aggregator calls MUST complete < 400 ms p95 (in-memory rules; no LLM).

## 6. Constraints

1. **Single Prisma schema change only.** New models (`StockReservation`, `SpendingMandate`) go into the existing `schema.prisma` in a single new migration file. We do not rename or modify existing columns to avoid risk.
2. **No changes to existing public route input/output shapes unless FR says so.** The existing `/api/v1/*` surface for the shopper storefront, `/agent/chat`, and MCP tools MUST remain backwards-compatible. Only `create_checkout` internal flow is migrated to mandates while still accepting old YES gate.
3. **No changes to the Razorpay integration layer beyond new MANDATE_SECRET env var.** We keep Razorpay orders + webhook verification exactly as-is. ACP's `/v1/checkouts/:id/complete` reuses `confirmCheckout` flow (minus signature check — mandate is the proof).
4. **Existing frontend pages are modified; no new design system.** Use existing Tailwind + Lucide + shadcn-style cards already in `/app/admin/campaigns/page.tsx` and `/app/audit/page.tsx` as templates.
5. **Mandate signature algorithm is fixed to HMAC-SHA256 with UTF-8 key-sorted JSON.** Do not introduce JOSE libraries (jose, jsonwebtoken) unless the existing code already has them. We implement the small HMAC signature directly.
6. **No new `.env.example` secrets beyond `MANDATE_SECRET`.** If possible, reuse `JWT_SECRET` or `SESSION_SECRET` for mandate signing with a documented fallback chain.

## 7. Dependencies

- Prisma ORM (already present) — new models + single migration.
- `@fastify/rate-limit` (already present in `server.ts`) — new scoped limits.
- `crypto` (Node built-in, already used in checkout.service HMAC) — mandate signing.
- `zod` (already present) — new route schemas.
- `lucide-react`, Tailwind (already present) — frontend pages.
- No new npm package installations required.

## 8. Assumptions

1. **Track 01 Judges accept documented alignment without live protocol participants.** UAP live sandbox is not available until post-GFF; ACP/AP2 are draft specs. A 1:1 mapping doc + `.well-known` endpoints + matching response shapes is the accepted evidence bar.
2. **`MANDATE_SECRET` fallback:** If admin does not set one, mandate signatures fall back to `JWT_SECRET`, which is already set (since auth works). Backend boot SHOULD not hard-fail on missing secrets.
3. **Spending mandate scope = `CATEGORY` + `SUB_CATEGORY` + `PRODUCT`** — a simple string-field category filter, not a sophisticated DSL. Judges look for the Reserve Pay block + budget accounting.
4. **Campaign performance window = approvedAt through min(expiresAt, NOW()).** Campaigns can still be active; actual-to-date is shown.
5. **Stock reservation expiry = 5 minutes** (matches YES gate TTL). Any stale reservation older than TTL + 1 min is swept at read time via `StockReservation.deleteMany` inside a transaction.

## 9. Open Questions (OQs)

- **OQ-01:** For AP2 mandate signing, do we also want to include a mock public-key endpoint (`/.well-known/jwks.json`) for extra judge points, or is HMAC + fingerprint sufficient? → Decision: HMAC + fingerprint, plus a JWKS endpoint if time permits (very low cost).
- **OQ-02:** Should StockReservation TTL sweep have its own 1-minute Fastify cron, or remain lazy? → Decision: Lazy sweep inside `getProductAvailability` and `validateCartPolicy`; no cron dependency.
- **OQ-03:** Is the `/app/admin/agents` trust-registry UI worth the time given its "secondary" status? → Decision: Include simple table UI if all P0/P1 items complete; otherwise, backend-only endpoint + JSON `.well-known`.

## 10. Acceptance Criteria (ACs)

Every AC is typed strictly as `rule` (objectively pass/fail) or `rubric` (evaluative, with score scale).

| ID | Type | Statement / Scale | Evidence Source |
|---|---|---|---|
| AC-01 | rule | `PROTOCOL_ALIGNMENT.md` exists at repo root and contains at least 5 UAP, 5 ACP, 5 AP2, and 3 x402 concept rows with clickable absolute file references. | `Read` `PROTOCOL_ALIGNMENT.md` + verify link count |
| AC-02 | rule | All 4 new `.well-known` endpoints + OAuth return 200 and correct `Content-Type: application/json` in a running backend. | HTTP GET to each endpoint and assert status + CT |
| AC-03 | rule | Every response from 10+ random existing routes includes ALL THREE protocol headers (`X-ACP-Protocol`, `X-AP2-Mandates`, `X-UAP-Capable`). | 10 random request/response captures, grep headers |
| AC-04 | rule | MCP `create_checkout` WITHOUT a prior confirmed `confirm_checkout(mandateId, sig)` returns a CartMandate object + no Razorpay order (checkout.status = pending_confirmation); only after valid `confirm_checkout` does checkout.status transition to created with `razorpayOrderId`. | Sequential MCP call sequence + Prisma state inspection |
| AC-05 | rule | 21 rapid-fire calls to `POST /api/v1/checkout` return `<=20 success`; 22nd call returns 429 + `Retry-After`. Same for MCP with `POST /mcp` (61st call → 429). | Burst HTTP script + count status codes |
| AC-06 | rule | Approving an LLM-proposed campaign that sets price < `costPrice*1.05` or < `basePrice*0.30` is rejected by the backend with error code `CAMPAIGN_MARGIN_POLICY`; even direct DB-inserted `proposedAction` at those prices fails at `executeCampaignAction`. | `POST /admin/campaigns/:id/approve` + inspect DB |
| AC-07 | rule | `POST /api/v1/merchant-agent/negotiate` with acceptable discount → `outcome=ACCEPT` + `StockReservation` rows created; stock count decremented by reservation amount in next availability read. | Negotiate call + GET availability + SELECT reservation |
| AC-08 | rule | Negotiate offer 50% below margin → `outcome=REJECT` reason=`PRICE_TOO_LOW`; stock untouched. | HTTP call + policy in response body |
| AC-09 | rule | A signed `CartMandate` (signature valid + non-expired + matches items) passes `verifyMandate`; same payload with 1 tampered byte fails. | Sign → verify; tamper 1 byte → verify. |
| AC-10 | rule | `POST /api/v1/checkout/:id/confirm` with an expired or wrong-signature CartMandate is rejected with 400 `MANDATE_INVALID` without charging. | Expired/wrong-sig calls → no Razorpay order. |
| AC-11 | rule | `GET /api/v1/admin/campaigns/:id/performance` returns `projected` + `actual` + `delta` with non-null numeric values for an approved campaign that has at least one order placed during its window. Seed or create a campaign + order, then call endpoint. | Backend endpoint response schema check |
| AC-12 | rule | Admin campaigns UI shows a widget with actual-vs-projected for each approved campaign: revenue text + delta%. | UI snapshot / page.tsx render output. |
| AC-13 | rule | `POST /api/v1/mandates` creates a `SpendingMandate` row with `status=ACTIVE`; cart with category covered → `validateCartPolicy` attaches it; after successful confirm, `budgetUsed` incremented correctly. | DB assertions after create + checkout. |
| AC-14 | rule | Revoked/exhausted/expired spending mandates are not considered for budget consumption. | Create, revoke → try → POLICY_REJECTED. |
| AC-15 | rule | ACP `POST /v1/checkouts` returns 201 with `sharedPaymentToken.jwt`; JWT decoded (HS256) contains `{ checkoutId, amount, expiresAt }`, `aud === "acp-v1"`. | Decode JWT manually + assertions. |
| AC-16 | rule | `DELETE /v1/checkouts/:id` marks checkout as `cancelled` and restores stock (same as cancelOrder logic); audit log has `checkout_cancelled_acp`. | Checkout row + stock + AuditLog. |
| AC-17 | rubric | Protocol narrative fidelity (0–5). Score based on how credible a Track 01 judge would find the "Why Now / protocol race" claim. 5 = reads as purpose-built for UAP/ACP launch week, every piece has backing. 3 = alignment is obvious but superficial. 1 = no protocol artifacts. Threshold ≥ 4. | Manual review of PROTOCOL_ALIGNMENT.md + well-knowns + headers. |
| AC-18 | rubric | Security/gating completeness (0–5). 5 = MCP path fully gated, every money action has mandate + rate limit + audit. 3 = MCP gate closes but some edge paths missing. 1 = no gate. Threshold ≥ 4. | Manual review of MCP flow + rate limits + caps. |
| AC-19 | rubric | Revenue-growth loop completeness (0–5). 5 = projected-vs-actual shown, per-campaign, with interval data and visible delta. 3 = aggregate widget works but no buckets. 1 = no performance data. Threshold ≥ 4. | Manual review of admin campaigns page performance UI. |
| AC-20 | rubric | UAP Reserve Pay implementation credibility (0–5). 5 = spending mandate scopes/budgets/maxPerOrder all enforced, with UI and full policy integration. 3 = backend-only with basic scope checks. 1 = model only. Threshold ≥ 3. | Manual review of mandates page + DB state after checkout. |

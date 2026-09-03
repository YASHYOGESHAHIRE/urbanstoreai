# Tasks: Why Now — Protocol Alignment, Revenue-Growth Loop, Agent-to-Agent Commerce

Derived from spec.md (20 ACs, 20 FRs, 6 NFRs). Each task is dependency-ordered. Every task has one or more task-level Test Requirements (TRs) of type `rule` or `rubric`. Priority: `high` (P0 — bar compliance + security), `medium` (P1 — revenue loop + protocol narrative), `low` (P2 — secondary goals).

---

## Task 1: Prisma Schema — Add StockReservation + SpendingMandate Models + Migration

**Status:** pending
**Priority:** high
**Blocked By:** (none, all later tasks depend on this)
**Depended on by:** Tasks 4, 5, 6, 7, 8, 11, 13

### Scope
Edit `backend/prisma/schema.prisma` to append two new models:
- `StockReservation` (per FR-08): `id`, `variantSku` (String, index), `qty`, `reservedAt`, `expiresAt`, `checkoutId?` (Checkout FK, onDelete: SetNull), `reference?` (String — mandate/counter reference), `consumedAt?`
- `SpendingMandate` (per FR-11): `id`, `userId` (User FK, onDelete: Cascade), `name`, `scope` (enum: CATEGORY / SUB_CATEGORY / PRODUCT / ALL), `scopeValue` (String, nullable), `budgetTotal` (Int paise), `budgetUsed` (Int paise, default 0), `maxPerOrder?` (Int paise), `startsAt`, `expiresAt`, `status` (ACTIVE / PAUSED / REVOKED / EXPIRED / EXHAUSTED), `revokedAt?`

Add enums `SpendingMandateScope` and `SpendingMandateStatus` to schema.

Create a new migration: `npx prisma migrate dev --name add_protocol_models`.

### Completion Criteria
- `prisma migrate dev` runs clean against local Postgres (or dry-run validate passes).
- `schema.prisma` contains both models with all fields and FKs.
- Enums are declared.

### TRs (Test Requirements)
| TR ID | Type | Pass Condition | Evidence |
|---|---|---|---|
| T1-R1 | rule | `npx prisma validate` in backend folder exits 0. | CLI output capture. |
| T1-R2 | rule | `StockReservation` and `SpendingMandate` model definitions are present in schema.prisma with FKs to Checkout and User respectively. | `Read` schema.prisma + grep model names. |
| T1-R3 | rule | Migration folder contains a new timestamped folder with `migration.sql` creating both tables and enums. | `LS` backend/prisma/migrations. |

### Completion Evidence
(tbd at completion)

---

## Task 2: Protocol Headers Global Hook + PROTOCOL_ALIGNMENT.md + .well-known Discovery Endpoints (4)

**Status:** pending
**Priority:** high
**Blocked By:** (none; independent of DB)
**Depended on by:** (nothing, except evidence for ACs 01–03)

### Scope
2a. In `backend/src/server.ts`:
- Add a global Fastify `onSend` hook that injects:
  ```
  X-ACP-Protocol: "1.0; supported"
  X-AP2-Mandates: "intent;cart;payment"
  X-UAP-Capable: "reserve-pay;circle"
  ```
- Make sure it does NOT override if header already present.

2b. Create `PROTOCOL_ALIGNMENT.md` at repo root with 5+ UAP rows, 5+ ACP rows, 5+ AP2 rows, 3+ x402 rows, using absolute `file:///` links.

2c. In `backend/src/routes/oauth.routes.ts` (new section, or a new `protocol-discovery.routes.ts`):
- `GET /.well-known/agent-commerce` → ACP v1 capability manifest JSON.
- `GET /.well-known/ap2-mandate` → AP2 endpoint URL + algorithm + key fingerprint.
- `GET /.well-known/ucp-catalog` → UCP catalog manifest.
- `GET /.well-known/ai-plugin` → ChatGPT plugin manifest v1.
- Register the new routes file in server.ts if split.

### TRs
| TR ID | Type | Pass Condition | Evidence |
|---|---|---|---|
| T2-R1 | rule | `curl -i` 10 distinct routes → responses all contain all 3 X-* headers. | Script output. |
| T2-R2 | rule | `PROTOCOL_ALIGNMENT.md` has ≥ 5 UAP, ≥ 5 ACP, ≥ 5 AP2, ≥ 3 x402 concept rows with absolute `file:///` links. | `Read` file + count. |
| T2-R3 | rule | All 4 well-known endpoints return 200 + `Content-Type: application/json`. | HTTP GET each endpoint. |

### Completion Evidence
(tbd)

---

## Task 3: Comprehensive Rate Limiting for All Routes (Catalog / Cart / Checkout / Order / MCP / Behaviour / Admin)

**Status:** pending
**Priority:** high
**Blocked By:** (none)
**Depended on by:** (nothing)

### Scope
In `backend/src/server.ts`, inside each `registerRoutes` section or via individual Fastify plugin wraps:
- Apply the existing `@fastify/rate-limit` with distinct limits per NFR-05 / FR-05 table:
  - Catalog routes 120/min/IP
  - Cart routes 60/min/IP + 30/min/user (use `keyGenerator` → if auth user exists, user id, else IP)
  - Checkout routes 20/min/IP + 10/min/user
  - Order routes 60/min/IP + 30/min/user
  - MCP routes 60/min/IP + 30/min/grantId (attachAgent resolves grantId; use it)
  - Behaviour routes 120/min/IP
  - Admin routes 60/min/user
- 429 response body: `{ error: "RATE_LIMITED", retryAfterMs: <n> }`, with `Retry-After` header.
- Ensure that the existing agent-chat rate limit (20/min/user) and auth 20/min/IP are NOT removed.

### TRs
| TR ID | Type | Pass Condition | Evidence |
|---|---|---|---|
| T3-R1 | rule | 21 rapid calls to `POST /api/v1/checkout`: call ≤ 20 succeed with non-429; call 21 returns 429 + `Retry-After`. | Burst HTTP script + count 429s. |
| T3-R2 | rule | 61 rapid calls to `POST /mcp`: ≤ 60 succeed; call 61 → 429. | Burst script. |
| T3-R3 | rule | Existing auth routes (register, login) still enforce their original 20/min limit. | 21 rapid login calls → 21st is 429. |

### Completion Evidence
(tbd)

---

## Task 4: Mandate Service (AP2 Sign/Verify — Intent, Cart, Payment 3 Types) + YES Gate Migration

**Status:** pending
**Priority:** high
**Blocked By:** Task 1 (DB schema — not directly required, but spending mandates task depends on this service)
**Depended on by:** Tasks 5, 7, 8, 11, 13

### Scope
Create new `backend/src/services/mandate.service.ts`:

Exports:
- `signIntentMandate(payload: IntentMandatePayload): SignedMandate`
- `signCartMandate(payload: CartMandatePayload): SignedMandate`
- `signPaymentMandate(payload: PaymentMandatePayload): SignedMandate`
- `verifyMandate<T = any>(signed: any): { valid: boolean; payload: T; error?: string }`
- `MANDATE_TYPES` constants.

Signing:
1. Secret resolution: `process.env.MANDATE_SECRET ?? process.env.JWT_SECRET ?? process.env.SESSION_SECRET`. If still missing, console.warn("fallback dev secret") + use `crypto.randomBytes(32)` per-boot.
2. Canonical payload = key-sorted JSON of `{ id, type, issuer, conditions, issuedAt, expiresAt, nonce }`. Nonce = 16 random hex bytes. UTF-8 stringify, HMAC-SHA256 with secret, base64 signature.
3. Attach signature: `signature = "HS256:${base64}"`. Include `@context: "https://ap2.dev/v1"`.

In `backend/src/routes/agent.routes.ts`, migrate `pendingCheckoutConfirmations` Map to also accept/verify a signed CartMandate (keep old boolean session gate for backwards compatibility).

### TRs
| TR ID | Type | Pass Condition | Evidence |
|---|---|---|---|
| T4-R1 | rule | signCartMandate → verifyMandate → `valid=true`. | Node REPL / ad-hoc script. |
| T4-R2 | rule | Signed cart mandate payload tampered by 1 byte → `valid=false`. | Tamper script. |
| T4-R3 | rule | Expired mandate (expiresAt = past) → verify → `valid=false`, error contains "expired". | Time-manipulated verify. |
| T4-R4 | rule | With NO env vars set → mandate service fallback-secret console.warning emitted, boot still succeeds, sign/verify works. | Run backend with empty `.env` check. |

### Completion Evidence
(tbd)

---

## Task 5: MCP YES Gate — Enforce on create_checkout via CartMandate + confirm_checkout Signature Validation

**Status:** pending
**Priority:** high
**Blocked By:** Task 4 (mandate service)
**Depended on by:** (nothing)

### Scope
In `backend/src/routes/mcp.routes.ts`, inside `create_checkout` handler:
1. Instead of directly calling `createCheckout(user.id)` successfully and returning a payment URL:
   a. Call policy service `validateCartPolicy(userId, getOrCreateCart)`.
   b. If policy passes, create a `CartMandate` object covering items + prices.
   c. Call `mandateService.signCartMandate` with the mandate.
   d. Store the mandate `id → signature hash + nonce + issuedAt` in a new `pendingMcpConfirmations` Map (TTL 5 min).
   e. Return MCP `content[].text = "AP2 CartMandate issued. Call confirm_checkout(mandateId, signature) to proceed. Expires 5 min."` + structured `CartMandate` object in the MCP response `extra` / text.
2. Add a NEW MCP tool `confirm_checkout`:
   - Inputs: `mandateId: string`, `signature: string`
   - Handler: look up pendingMcpConfirmations[mandateId], verify signature matches, then call actual `createCheckout + return paymentUrl`.
   - Success → delete pending entry, log `mcp_mandate_confirmed` audit.
   - Fail → 400 style, log `mcp_mandate_rejected`.

Update MCP serverPrompt instructions to tell Claude: "You MUST issue confirm_checkout(mandateId, signature) after create_checkout; never skip."

### TRs
| TR ID | Type | Pass Condition | Evidence |
|---|---|---|---|
| T5-R1 | rule | MCP `create_checkout` called → returns CartMandate object, Checkout DB row has `status=pending_confirmation`, no `razorpayOrderId`. | MCP call → SQL SELECT checkout. |
| T5-R2 | rule | MCP `confirm_checkout(mandateId, WRONG_SIG)` → rejected, no Razorpay order id set. | MCP sequence. |
| T5-R3 | rule | MCP `confirm_checkout(mandateId, CORRECT_SIG)` → succeeds, Checkout `status=created` with `razorpayOrderId`, audit log contains `mcp_mandate_confirmed`. | MCP sequence. |
| T5-R4 | rule | Expired mandate (after 5.5 min) → confirm → rejected "MANDATE_EXPIRED". | Advance time OR wait. |

### Completion Evidence
(tbd)

---

## Task 6: Campaign Hard Margin/Discount Caps Enforced In Code

**Status:** pending
**Priority:** high
**Blocked By:** Task 1 (schema only if adding new error logs; can start after Task 1)
**Depended on by:** (nothing beyond T1)

### Scope
In `backend/src/services/campaign.service.ts`:

6a. Add a policy-check function `validateCampaignPricing(proposedAction, product): { valid: boolean; reason?: string }` at both:
- `approveCampaign(id)` → BEFORE updating `status=active` and applying.
- `executeCampaignAction(campaign, product)` → defense-in-depth right before `ProductVariant.update`.

Rules:
1. `finalPrice >= costPrice * 1.05` (≥ 5% effective margin over cost).
2. `finalPrice >= basePrice * 0.30` (≤ 70% discount).
3. Only price decreases allowed (URGENCY campaigns: NEVER mutate price, only set badge + `expiresAt`).

6b. If validation fails:
- `approveCampaign` throws error code `CAMPAIGN_MARGIN_POLICY` with rule details.
- `executeCampaignAction` aborts the price mutation and logs an audit entry: `campaign_policy_rejected`.

### TRs
| TR ID | Type | Pass Condition | Evidence |
|---|---|---|---|
| T6-R1 | rule | Create a CLEARANCE campaign with `proposedAction.discountPercent = 80` (sets final=20% of base). Approve → backend returns 400 with error code `CAMPAIGN_MARGIN_POLICY`. | HTTP POST approve. |
| T6-R2 | rule | DB-insert a campaign with final=49% of base (< cost 1.05 in typical seed data). Run executeCampaignAction logic directly (or via approve) → ABORTS, no price change. | SQL check variant price before/after. |
| T6-R3 | rule | URGENCY campaign approve → NO variant price change; only `campaignBadge` and `campaignExpiresAt` set on product. | SQL + SELECT. |
| T6-R4 | rule | Valid 10% discount, well above margin → approve → SUCCESS, variant price correctly reduced. | HTTP + SQL. |

### Completion Evidence
(tbd)

---

## Task 7: Merchant-Agent Negotiate Service + StockReservation Integration

**Status:** pending
**Priority:** medium
**Blocked By:** Tasks 1, 4
**Depended on by:** Task 13 (ACP checkout — not directly)

### Scope
7a. Create new `backend/src/services/merchant-agent.service.ts` exporting:
- `negotiateOffer(buyerAgentId: string|null, offer: NegotiateOffer, grantId?: string): Promise<NegotiateResponse>` (per FR-07 shapes).
  Logic:
  1. For each item in offer.items, resolve via `getProduct + getProductAvailability` (includes stock reservations from T1 + subtracts them).
  2. Get best active campaign price for the item.
  3. Compare offer price (if given; else best campaign price = default) to margin floor:
     - Within 10% tolerance of campaign best → ACCEPT.
     - Below tolerance but ≥ margin floor → COUNTER (propose best campaign price + note).
     - < margin → REJECT "PRICE_TOO_LOW".
  4. If any stock insufficient → REJECT "OUT_OF_STOCK" OR max qty exceeded.
  5. On ACCEPT, create StockReservation rows for each variant, expiresAt = 5 min.
  6. On ACCEPT, also sign a CartMandate via mandate.service and return it as response.mandate.
7b. Create `merchant-agent.routes.ts`: `POST /api/v1/merchant-agent/negotiate` (user or agent auth via existing attach hooks; zod validation).
7c. Wire route into server.ts.
7d. In `catalog.service.ts` `getProductAvailability` — subtract unexpired StockReservations from `inStock` count. Sweep expired (> 5 min) reservations inside the transaction.

### TRs
| TR ID | Type | Pass Condition | Evidence |
|---|---|---|---|
| T7-R1 | rule | Negotiate offer with acceptable prices → outcome=ACCEPT; StockReservation rows present; next availability GET shows reduced stock by reserved qty. | HTTP negotiate + avail. |
| T7-R2 | rule | Negotiate offer with qty 2x in stock → outcome=REJECT (OUT_OF_STOCK or MAX_QTY_EXCEEDED); no reservations; stock untouched. | HTTP. |
| T7-R3 | rule | Negotiate below margin → outcome=REJECT reason=PRICE_TOO_LOW. | HTTP. |
| T7-R4 | rule | After 6 min pass, sweep in availability GET deletes expired StockReservation; stock returns to original. | Advance time / wait + avail call. |
| T7-R5 | rule | Negotiate response includes a signed CartMandate on ACCEPT; mandate validates via verifyMandate. | Sign + verify. |

### Completion Evidence
(tbd)

---

## Task 8: Checkout Policy Checks Integrate AP2 CartMandate Verification + Spending Mandate Check (Backend Path)

**Status:** pending
**Priority:** high
**Blocked By:** Tasks 1, 4
**Depended on by:** Task 11 (frontend mandates page — depends on API working)

### Scope
8a. In `backend/src/services/checkout.service.ts`:
- `createCheckout`:
  - If a 4th param `{ cartMandate?: SignedMandate, confirmedVia?: string }` is provided, call `mandateService.verifyMandate(cartMandate)`.
  - If invalid → throw `MANDATE_INVALID`.
  - If valid → proceed (Razorpay order).
  - If not provided → use legacy YES gate (session-based) OR MCP mandate confirmation.
- `confirmCheckout`:
  - After signature check, increment `SpendingMandate.budgetUsed` (if attached mandate covers any item).
  - If after increment, `budgetUsed >= budgetTotal` → update status to EXHAUSTED.

8b. In `backend/src/services/policy.service.ts` `validateCartPolicy`:
- Add a check: IF `agentGrantId` is present (MCP or OAuth agent purchase), AND there is NO attached CartMandate override (from YES gate), THEN an active SpendingMandate MUST cover the cart items (category/subcategory/product/all scope AND budgetRemaining >= cart.total AND maxPerOrder >= cart.total if set). Otherwise → `POLICY_REJECTED` reason `NO_ACTIVE_SPENDING_MANDATE`.

### TRs
| TR ID | Type | Pass Condition | Evidence |
|---|---|---|---|
| T8-R1 | rule | Cart with valid CartMandate → createCheckout succeeds (Razorpay order). | HTTP. |
| T8-R2 | rule | Cart with expired/wrong-sig CartMandate → createCheckout throws MANDATE_INVALID. | HTTP. |
| T8-R3 | rule | Agent (MCP grantId) tries to buy shoes without a footwear SpendingMandate active → validateCartPolicy returns NO_ACTIVE_SPENDING_MANDATE. | Policy function call. |
| T8-R4 | rule | After successful confirm, SpendingMandate.budgetUsed increased by checkout.total; if exactly budgetTotal, status → EXHAUSTED. | SQL before/after. |
| T8-R5 | rule | Revoked SpendingMandate → not considered at policy check; POLICY_REJECTED even if budget technically available. | Policy check. |

### Completion Evidence
(tbd)

---

## Task 9: Campaign Performance Backend Aggregator + Admin Endpoint

**Status:** pending
**Priority:** medium
**Blocked By:** Task 1 (schema for existing Campaign model only — no new model needed)
**Depended on by:** Task 10 (admin campaigns UI widget)

### Scope
In `backend/src/services/analytics.service.ts`:
- Create new exported function `getCampaignPerformance(campaignId: string): Promise<CampaignPerformance>`.
- Logic:
  1. Load Campaign record from DB (reject 404 if missing).
  2. Parse projections: `projected = campaign.projections.withCampaign ?? campaign.projections`.
  3. Query OrderItems (join Order on `orderId=order.id`, status in `[confirmed, paid, delivered]`) WHERE:
     - `productId = campaign.productId`
     - `Order.createdAt >= campaign.approvedAt`
     - `Order.createdAt <= (campaign.expiresAt OR NOW())`
     - AND optional: price paid matches effective campaign price.
  4. Aggregate actual `unitsSold = SUM(qty)`, `actualRevenue = SUM(price*qty)`, `actualMarginPct = 100 * (revenue - SUM(costPrice*qty)) / revenue`.
  5. Compute delta fields.
  6. Compute daily interval buckets (by day of createdAt, array `[{ date, units, revenue }]`).

In `backend/src/routes/admin.routes.ts`:
- `GET /api/v1/admin/campaigns/:id/performance` → calls `getCampaignPerformance` + returns.

### TRs
| TR ID | Type | Pass Condition | Evidence |
|---|---|---|---|
| T9-R1 | rule | Approved campaign + one matching order placed during window → endpoint returns projected + actual both non-null, delta calculated. | HTTP endpoint response. |
| T9-R2 | rule | Non-existent campaign → 404. | HTTP. |
| T9-R3 | rule | Interval buckets array is present with ≥ 1 bucket (the single order's day). | HTTP response schema. |
| T9-R4 | rule | `getRevenueStats` (existing) still works. No regression on `/api/v1/admin/dashboard`. | Dashboard HTTP call → 200. |

### Completion Evidence
(tbd)

---

## Task 10: Admin Campaigns Page — Actual vs Projected Widget Per Card

**Status:** pending
**Priority:** medium
**Blocked By:** Task 9 (endpoint ready)
**Depended on by:** (nothing)

### Scope
In `app/admin/campaigns/page.tsx`:
- Extend CampaignCard component.
- For approved/active campaigns, fetch `GET /api/v1/admin/campaigns/:id/performance` client-side on card-expand OR at mount for active cards only (batch fetch via a new optional GET /admin/campaigns?withPerformances=true if helpful — TBD, but client-per-card fetch is fine).
- Add to each card, below projections widget:
  ```
  ▰ ACTUAL vs PROJECTED (so far)
  Revenue: ₹actual  /  ₹projected   (+delta% with color: green=exceeding, red=below)
  Units  : X / Y
  Margin : actualPct% / targetPct%
  └── mini sparkline placeholder (bar stack by day, color per delta)
  ```
- Style consistently with existing `bg-gray-50 border border-gray-100 rounded-xl px-4 py-3` card interiors.

### TRs
| TR ID | Type | Pass Condition | Evidence |
|---|---|---|---|
| T10-R1 | rule | Page loads without TypeScript errors (no TS diagnostics at file). | `GetDiagnostics` for the page file. |
| T10-R2 | rubric | Admin campaign widget quality (0–3). 3 = clearly shows actual vs projected for revenue/units/margin with a colored delta badge and interval buckets. 2 = numbers present but no buckets. 1 = basic text only. Threshold ≥ 2. | Manual UI screenshot / output. |
| T10-R3 | rule | Unapproved/pending campaigns do NOT attempt to fetch performance endpoint (avoid 404s). Inspect network or add console guard. | Network / code inspection. |

### Completion Evidence
(tbd)

---

## Task 11: Spending Mandate Backend Routes + Policy Integration (User-Facing)

**Status:** pending
**Priority:** medium
**Blocked By:** Tasks 1, 4, 8
**Depended on by:** Task 12 (frontend mandates page)

### Scope
11a. Create `backend/src/routes/spending-mandate.routes.ts`:
- `GET /api/v1/mandates` → (user-auth, attachUser) list user's spending mandates, ordered by createdAt desc.
- `POST /api/v1/mandates` → zod: name (string), scope (enum), scopeValue (string?), budgetTotal (Int ≥ 100 paise), maxPerOrder (Int? nullable), expiresAt (ISO Date ≥ tomorrow). Creates row status ACTIVE.
- `POST /api/v1/mandates/:id/pause` → status PAUSED.
- `POST /api/v1/mandates/:id/resume` → status ACTIVE (if not expired).
- `POST /api/v1/mandates/:id/revoke` → status REVOKED, revokedAt now.
11b. Wire into server.ts route registration.
11c. Add audit events via `audit.service.ts`: spending_mandate_created/paused/revoked/exhausted/consumed.
11d. Double-check T8 (SpendingMandate budgetUsed increment) actually runs at confirmCheckout success — ensure `SpendingMandateConsumed` audit event fires.

### TRs
| TR ID | Type | Pass Condition | Evidence |
|---|---|---|---|
| T11-R1 | rule | POST mandates creates ACTIVE row; list returns it. | HTTP + SQL. |
| T11-R2 | rule | POST pause/:id → PAUSED; POST resume → ACTIVE. | HTTP + SQL. |
| T11-R3 | rule | POST revoke → REVOKED + revokedAt timestamp set. | SQL. |
| T11-R4 | rule | After confirmCheckout with covered items → budgetUsed increased by total, AND audit has spending_mandate_consumed event. | confirmCheckout → SQL select. |
| T11-R5 | rule | Unauthenticated user tries GET /mandates → 401. | HTTP. |

### Completion Evidence
(tbd)

---

## Task 12: Frontend Spending Mandates Page (app/mandates/page.tsx)

**Status:** pending
**Priority:** medium
**Blocked By:** Task 11 (routes)
**Depended on by:** (nothing)

### Scope
Create `app/mandates/page.tsx` ("use client"):
- Header: "UAP Reserve Pay — Spending Mandates" with subtitle explaining UAP/NPCI delegation.
- Create-Mandate modal/form: name, scope (radio: ALL / CATEGORY / PRODUCT), scope-value (autocomplete category/product from /catalog), budget (₹), maxPerOrder (₹), expiresAt (date picker default +30d).
- Mandates table: columns Name, Scope, Budget, Used/Remaining, Max/Order, Status, Expires, Actions. Actions: Pause/Resume, Revoke.
- Use existing Tailwind + lucide-react styles, Card style from `/app/admin/campaigns/page.tsx`. Use `authHeaders()`.

### TRs
| TR ID | Type | Pass Condition | Evidence |
|---|---|---|---|
| T12-R1 | rule | File compiles with 0 TS diagnostics. | GetDiagnostics. |
| T12-R2 | rubric | Mandates page UX (0–3). 3 = create form + table with actions + progress bars for budget/remaining, everything works. 2 = table present, basic create. 1 = skeleton only. Threshold ≥ 2. | Manual UI screenshot. |
| T12-R3 | rule | Create mandate → new row appears in table without page reload. | UX walkthrough. |

### Completion Evidence
(tbd)

---

## Task 13: ACP v1 Checkout Routes (4 exact shapes) + SharedPaymentToken (JWT)

**Status:** pending
**Priority:** medium
**Blocked By:** Tasks 1, 4 (mandate service re-used for token signing)
**Depended on by:** (nothing)

### Scope
13a. Create `backend/src/routes/acp.routes.ts` with:
- `POST /v1/checkouts` body `{ items:[{sku:string,qty:number}], metadata? }` → 201 `{ id, items, totalAmount, currency:"INR", expiresAt, sharedPaymentToken: { id, jwt, expiresAt } }`. Creates local Checkout + Cart + signs CartMandate internally → returns `SharedPaymentToken` as HS256 JWT (aud = "acp-v1", sub = `checkout:${id}`) via mandate-service signing (or same HMAC logic).
- `PATCH /v1/checkouts/:id` → modify items array → re-issue token → returns updated checkout + new token.
- `POST /v1/checkouts/:id/complete` body `{ paymentMandate?: SignedMandate, razorpayPaymentId, razorpaySignature }` → reuses confirmCheckout flow internally (after signature verification). If JWT valid.
- `DELETE /v1/checkouts/:id` → cancel, restore stock via same `cancelOrder` logic, log `checkout_cancelled_acp`.
13b. Add X-Protocol-Compliance header for these routes via on-send hook.
13c. Wire route file into server.ts.

### TRs
| TR ID | Type | Pass Condition | Evidence |
|---|---|---|---|
| T13-R1 | rule | POST /v1/checkouts with valid items → 201, `sharedPaymentToken.jwt` decodes to `{ checkoutId, amount, expiresAt, aud: "acp-v1" }` via manual HS256 decode. | HTTP call → base64 decode JWT payload. |
| T13-R2 | rule | PATCH /v1/checkouts/:id with new items → new JWT issued with updated amount. | HTTP call + compare JWTs. |
| T13-R3 | rule | DELETE /v1/checkouts/:id → checkout.status = cancelled; stock restored; AuditLog `checkout_cancelled_acp` present. | HTTP → SQL triple-check. |
| T13-R4 | rule | Every response from /v1/* includes `X-Protocol-Compliance: "acp-v1;ap2-v1"`. | curl -i. |

### Completion Evidence
(tbd)

---

## Task 14: Audit Coverage for All New Flows

**Status:** pending
**Priority:** medium
**Blocked By:** All tasks (done after flows are implemented, cross-cutting)
**Depended on by:** (nothing)

### Scope
In `backend/src/services/audit.service.ts`, confirm / add utility wrappers for:
- merchant-agent: `logNegotiateOffer(grantId, outcome, reference)`
- MCP: `logMcpMandateIssued/Confirmed/Rejected(grantId, mandateId)`
- campaigns: `logCampaignPerformanceViewed(userId, campaignId)`
- spending-mandates: `logSpendingMandateCreated/Paused/Revoked/Exhausted/Consumed(userId, mandateId, delta)`
- ACP: already handled (T13-R3)

Ensure every wrapper accepts `agentGrantId` if present and sets it on the AuditLog row so `/app/audit` filters by "AI actions" correctly.

### TRs
| TR ID | Type | Pass Condition | Evidence |
|---|---|---|---|
| T14-R1 | rule | After 1x each of: negotiate (accept), MCP confirm checkout → approved, performance view, spending mandate create + consumed, ACP cancel → audit table has rows for each with correct agentGrantId where applicable. | SQL SELECT audit_log WHERE ... |
| T14-R2 | rule | `/app/audit` page renders these new audit event types without crash (no missing switch case fallbacks). | Load page in browser / snapshot. |

### Completion Evidence
(tbd)

---

## Task 15: Trusted Agent Registry (Backend + .well-known/trusted-agents) + Optional UI

**Status:** pending
**Priority:** low (secondary goal G8)
**Blocked By:** (nothing — OAuthClient + OAuthGrant tables already exist from schema)
**Depended on by:** (nothing)

### Scope
15a. Backend:
- New `GET /api/v1/admin/agents` (requireAdmin): join OAuthGrant → OAuthClient → User, group by grantId → compute:
  `agentTrustScore`: base 50, +2 per successful paid order, -50 per policy_reject, cap 0–100.
  `totalOrders`, `totalSpend`, `status` (trusted/unknown/blocked), `grantedAt`, `lastUsedAt`.
- `POST /api/v1/admin/agents/:grantId/block` → set OAuthGrant.revoked = true, revokedAt now.
- `POST /api/v1/admin/agents/:grantId/unblock` → revoke false.
- `GET /.well-known/trusted-agents` (public): JSON array of { clientId, name, trustScore, scopeSummary, lastSeen } where status=trusted and score ≥ 70.
15b. If time permits (judge call) create basic `app/admin/agents/page.tsx` with table + block/unblock buttons. If not, skip UI, keep backend endpoints + JSON endpoint only.

### TRs
| TR ID | Type | Pass Condition | Evidence |
|---|---|---|---|
| T15-R1 | rule | `/api/v1/admin/agents` returns list with ≥ 1 agent (if at least 1 grant in DB) and each row has numeric trustScore field. | HTTP call. |
| T15-R2 | rule | Block → grant revoked; next attachAgent on that grant → 401 "GRANT_REVOKED". | Flow test. |
| T15-R3 | rule | `/.well-known/trusted-agents` returns 200 + valid JSON array (possibly empty, OK if no trusted agents yet). | HTTP. |
| T15-R4 | rubric | Trust registry UI (0–2). 2 = table with block/unblock works end-to-end. 1 = skeleton. 0 = no UI. Threshold ≥ 1 (even backend-only counts as 1). | Manual screenshot. |

### Completion Evidence
(tbd)

---

## Task 16: End-to-End Manual / Scripted Regression Pass + Build Checks

**Status:** pending
**Priority:** high
**Blocked By:** All tasks 1–15
**Depended on by:** (nothing — final gate before Review)

### Scope
Run a complete sanity check:
1. `cd backend; npx tsc --noEmit` — 0 TS errors.
2. `cd backend; npx prisma validate` — passes.
3. Start backend + frontend, hit each new endpoint once, capture responses.
4. Storefront happy path still works: login → add cart → checkout → confirm payment (sandbox). No regression.
5. Agent chat: ask "buy me socks" → YES gate works (confirmation, confirm, Razorpay order created). No regression.
6. MCP: create_checkout → pending confirmation, confirm_checkout with correct sig → Razorpay order.
7. Build check: `cd .. (root); npx next build` (if applicable) OR at least `cd backend; npx tsc --noEmit` + start backend.
8. Document any diagnostics in review.md later.

### TRs
| TR ID | Type | Pass Condition | Evidence |
|---|---|---|---|
| T16-R1 | rule | `npx tsc --noEmit` in backend folder exits 0. | CLI output. |
| T16-R2 | rule | Storefront happy path succeeds end-to-end (order rows created in DB, payment captured Razorpay test-mode). | Manual walkthrough. |
| T16-R3 | rule | New endpoints all 200/201 on their happy paths; 4xx on validation-fail paths. | HTTP script. |
| T16-R4 | rule | GetDiagnostics for changed files → 0 errors. | Tool output. |

### Completion Evidence
(tbd)

---

## Dependency Graph (Simplified)

```
T1 Schema ──────┬── T4 Mandate Svc ── T5 MCP Gate
                ├── T6 Campaign Caps
                ├── T7 Merchant Agent ───
                ├── T8 Checkout Policy ── T11 Spending Mandate Routes ── T12 Mandates Page
                └───────────────────────── T9 Campaign Perf ── T10 Admin UI

T2 (docs + headers + well-known)    — independent, anytime
T3 (rate limits)                    — independent, anytime
T13 ACP Checkout                    — depends on T1 + T4
T14 Audit                           — cross-cut after others
T15 Agent Registry                  — independent low-priority
T16 Regression Pass                 — final
```

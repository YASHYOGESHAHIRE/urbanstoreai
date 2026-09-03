# Architectural Primitive Alignment — Urban Store ↔ Emerging Agent-Commerce Protocols

This document is an honest map between Urban Store's implemented server-side primitives and the architectural concepts being formalized across emerging multi-vendor agent-commerce proposals (UAP, ACP, AP2, x402).

**Important framing (defensible, not overclaimed):**
Urban Store is **not** claiming literal compliance or interoperability with any specific not-yet-finalized protocol specification. Rather, the system was deliberately designed around the same core primitives these proposals independently converge on — scoped delegated authority, server-enforced spending bounds, independently verifiable audit trails, and anti-abuse controls. Every row links to the exact file/line where the concept is implemented in production code, not in a prompt or LLM instruction.

---

## Shared Primitives — Concept → Implementation

### 1. Scoped delegated authority (UAP core, ACP §3, AP2 mandates)

| Concept | Urban Store implementation |
|---|---|
| Bearer-token agent identity injection on every protected route (OAuth 2.0 + API key + session, merged identity layer) | [agent.middleware.ts](file:///d:/Razorpay/urban-store/backend/src/middleware/agent.middleware.ts) |
| Server-side YES confirmation gate (code-level guard, enforced before any money action; cannot be bypassed by prompt manipulation) | [agent.routes.ts L36–L63 + L93–L117](file:///d:/Razorpay/urban-store/backend/src/routes/agent.routes.ts#L36-L63) |
| Spending mandate DB primitive (per-user budget totals, per-order caps, scoped by CATEGORY/SUB_CATEGORY/PRODUCT/ALL, status state machine ACTIVE→EXHAUSTED) | [schema.prisma L300–L363 (SpendingMandate model + enums)](file:///d:/Razorpay/urban-store/backend/prisma/schema.prisma#L300-L363) |
| Stock reservation primitive (variant-level qty lock, expiresAt window, consumedAt→order binding — prevents double-selling during confirm flow) | [schema.prisma L317–L337 (StockReservation model)](file:///d:/Razorpay/urban-store/backend/prisma/schema.prisma#L317-L337) |
| OAuthClient table + PKCE support (codeChallenge / codeChallengeMethod on OAuthAuthCode — public-agent RFC-7636 flows) | [schema.prisma L49–L100](file:///d:/Razorpay/urban-store/backend/prisma/schema.prisma#L49-L100) |
| OAuth `.well-known/oauth-authorization-server` metadata (RFC 8414 — auto-discovery of auth endpoints + scopes) | [oauth.routes.ts](file:///d:/Razorpay/urban-store/backend/src/routes/oauth.routes.ts) |

### 2. Server-enforced pricing and bounds (ACP §4 pricing stability, AP2 §5 amount constraints, UAP policy)

| Concept | Urban Store implementation |
|---|---|
| Server-enforced margin floor (4 rules applied in code: URGENCY badge-only, no price increases, max 70% discount, min 5% effective margin over estimated cost. Applied twice per price mutation — pre-approve + defense-in-depth at DB write.) | [campaign.service.ts L180–L307 (validateCampaignPricing) + L396–L425 (deep-check at update)](file:///d:/Razorpay/urban-store/backend/src/services/campaign.service.ts#L180-L307) |
| Cart price snapshot (CartItem.priceSnapshot stored at add-time — price drift between add and checkout is flagged, not silently applied) | [schema.prisma CartItem L177–L194](file:///d:/Razorpay/urban-store/backend/prisma/schema.prisma#L177-L194) + [policy.service.ts L86–L94](file:///d:/Razorpay/urban-store/backend/src/services/policy.service.ts#L86-L94) |
| Atomic stock decrement + re-validation inside transaction (no oversell under concurrent checkout; stock exhaustion throws cleanly mid-transaction) | [checkout.service.ts L169–L215 ($transaction block)](file:///d:/Razorpay/urban-store/backend/src/services/checkout.service.ts#L169-L215) |
| Policy service decision model (approve / requiresConfirmation / blocked — independent of any LLM call) | [policy.service.ts](file:///d:/Razorpay/urban-store/backend/src/services/policy.service.ts) |
| Max qty per order (ProductVariant.maxQtyPerOrder, enforced server-side at policy validation) | [policy.service.ts L64–L71](file:///d:/Razorpay/urban-store/backend/src/services/policy.service.ts#L64-L71) |

### 3. Non-repudiation and audit (ACP §6 trust, AP2 mandate accountability, UAP trust layer)

| Concept | Urban Store implementation |
|---|---|
| AuditLog.agentGrantId (every AI-initiated action carries a reference to the originating OAuth grant — no anonymous agent actions) | [audit.service.ts L12–L34](file:///d:/Razorpay/urban-store/backend/src/services/audit.service.ts#L12-L34) |
| checkout.create / checkout.confirmed / signature_mismatch / campaign_policy_rejected audit events (money actions + policy rejections are all independently loggable) | [checkout.service.ts L74–L78 + L217–L221](file:///d:/Razorpay/urban-store/backend/src/services/checkout.service.ts#L74-L78) + [campaign.service.ts L408–L419](file:///d:/Razorpay/urban-store/backend/src/services/campaign.service.ts#L408-L419) |
| Webhook HMAC verification (Razorpay `x-razorpay-signature` check — server-to-server inbound promise delivery authenticated symmetrically, audited) | [webhook.routes.ts L37–L146](file:///d:/Razorpay/urban-store/backend/src/routes/webhook.routes.ts#L37-L146) |
| Razorpay payment signature verification on confirmCheckout (HMAC-SHA256 over orderId\|paymentId; mismatches are logged and rejected before any order state mutation) | [checkout.service.ts L144–L154](file:///d:/Razorpay/urban-store/backend/src/services/checkout.service.ts#L144-L154) |

### 4. Anti-abuse and rate limits (UAP §7, ACP §5, MCP transport)

| Concept | Urban Store implementation |
|---|---|
| Scoped per-route-group rate limiting — checkout is the strictest bucket (10/min/user-or-ip); MCP keyed by grant-id if present; auth/oauth, admin, catalog, cart, orders, behaviour, agent all have independent buckets | [server.ts L98–L242](file:///d:/Razorpay/urban-store/backend/src/server.ts#L98-L242) |
| In-memory YES gate + conversation-history fallback (survives cold-start resets of the Map by re-detecting YES pattern against last 4 messages) | [agent.routes.ts L36–L117](file:///d:/Razorpay/urban-store/backend/src/routes/agent.routes.ts#L36-L117) |

### 5. Discovery and capability surfacing (protocol pre-condition)

| Endpoint | Purpose |
|---|---|
| `/.well-known/agent-commerce` | Merchant capabilities, checkout endpoints, mandate-type shape hints, oauth metadata link, negotiation + mandate-verify paths. |
| `/.well-known/ap2-mandate` | Implemented-mandate-shape disclosure. Key fingerprint here is a hash of the server's mandate-secret; this is used for signature validation on the confirm-side, not for third-party verifiable credentials. |
| `/.well-known/ucp-catalog` | Catalog semantic search endpoint, product schema, categories, embedding model. |
| `/.well-known/ai-plugin` | ChatGPT-plugin-style manifest for reverse-compatible agent discovery. |
| Global response headers: `X-ACP-Protocol`, `X-AP2-Mandates`, `X-UAP-Capable` | Declares which primitives the server implements; not a claim of protocol version conformance. |

All four `.well-known` endpoints are implemented in:
[protocol-discovery.routes.ts](file:///d:/Razorpay/urban-store/backend/src/routes/protocol-discovery.routes.ts)

Global response headers are injected at the Fastify `onSend` hook in:
[server.ts L43–L53](file:///d:/Razorpay/urban-store/backend/src/server.ts#L43-L53)

---

## Deliberate non-claims (what we are NOT asserting)

1. **No asymmetric VDC / verifiable credential claims.** Urban Store uses HMAC-SHA256 symmetric signatures for webhook and payment-confirmation authenticity. A true AP2 verifiable credential requires asymmetric (ECDSA/RSA) signing so a third party can verify without holding the secret key. We do not currently implement this.

2. **No third-party-checkable mandate objects.** SpendingMandate rows and StockReservation rows are authoritative only within Urban Store's own database. They are not signed objects that an external UAP/AP2 verifier could validate independently from our service.

3. **No x402-native 402 Payment Required responses.** Checkout currently returns 201 with a structured payment URL body. Future work could layer `402 + X-402-Info` as an alternate shape on the same checkout call; the primitives (Razorpay order, idempotency key, payment URL) already exist for it.

4. **No negotiation-agent counter-offer protocol.** The current merchant-agent is a unidirectional campaign-proposal engine (merchant admin → AI proposes → admin approves/dismisses). A proper ACP/UAP negotiation endpoint (buyer agent ↔ merchant agent counter-offers) is future work.

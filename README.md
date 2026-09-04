# Urban Store — AI-Native Merchant Infrastructure

> **Razorpay Hackathon · Track 01 — AI Growth & Agentic Commerce**

---

## 🚀 For Hackathon Judges — Start Here

**Live Demo:** [https://urbanstoreai-9c7p.vercel.app](https://urbanstoreai-9c7p.vercel.app)

**Architecture Diagram:** [urban-ai-ecosystem.html](https://urbanstoreai-9c7p.vercel.app/urban-ai-ecosystem.html) · [Miro Board](https://miro.com/app/board/uXjVHr_Z15Q=/?share_link_id=593227543948)

---

### Feature 1 — Shop with the In-App AI Agent

1. Open [https://urbanstoreai-9c7p.vercel.app](https://urbanstoreai-9c7p.vercel.app)
2. The AI panel opens on the right automatically — try typing:
   - *"Find me a laptop bag under ₹2,500"*
   - *"Show me discounted running shoes"*
   - *"Gift ideas under ₹1,000"*
3. Click **Add to Cart** on any product card — agent auto-suggests complementary items (cross-sell)
4. Type **"checkout"** → agent shows cart total and asks for confirmation
5. Type **"yes"** → Razorpay payment modal opens
6. Test card: `4111 1111 1111 1111` · any future date · any CVV

---

### Feature 2 — Admin Panel (Campaign Orchestrator)

1. Click the user icon → **Sign In**
2. Use the **🏆 Hackathon Judge** quick-fill button → click Sign In
3. Navigate to [/admin](https://urbanstoreai-9c7p.vercel.app/admin) — see live revenue KPIs
4. Go to [/admin/campaigns](https://urbanstoreai-9c7p.vercel.app/admin/campaigns) — see AI-generated campaign proposals with projections, reasoning, and risks
5. Go to [/admin/users](https://urbanstoreai-9c7p.vercel.app/admin/users) — click any user to see their full audit trail

> Judge account is **read-only** — can view everything, cannot generate or approve campaigns.

---

### Feature 3 — Audit Trail

1. Open the AI panel and have a short conversation
2. Click **View Audit Trail** at the bottom of the AI panel
3. See every agent action — tool calls, cart events, policy checks, Razorpay events — in real time
4. Switch between the **localStorage session** (live) and **DB session** (persistent, server-side)

---

### Feature 4 — Shop via Claude (External AI Buyer)

1. Go to [/connect](https://urbanstoreai-9c7p.vercel.app/connect) — log in first
2. Click **"Open in Claude — pre-filled"** — Claude opens with your MCP URL already filled in
3. Set Authentication to **None** → click Add
4. In a new Claude conversation, type:
   - *"Search Urban Store for running shoes under ₹3,000 and add the best one to my cart"*
   - *"Show me my Urban Store cart and create a checkout"*
5. Say **YES** when Claude asks for confirmation → get the payment URL

---

### Feature 5 — Protocol Discovery

Hit these endpoints directly in a browser to see the agent-commerce discovery layer:

```
https://urbanstoreai-backend.vercel.app/.well-known/agent-commerce
https://urbanstoreai-backend.vercel.app/.well-known/ucp-catalog
https://urbanstoreai-backend.vercel.app/health
```

---

### Judge Credentials

| Field | Value |
|---|---|
| Email | `judge@urbanstore.demo` |
| Password | `Judge@2024` |
| Role | Read-only Admin |
| Access | Dashboard · Campaigns · Users · Audit trail |

---

---

## Status

| Aspect | State |
|---|---|
| **Track 01 fit** | ✅ Both pillars delivered — revenue growth + AI-buyer transactability |
| **Bar test suite** | ✅ 22/22 passing across 5 groups (Gate, Bounds, Failure, Policy, Audit wiring) |
| **Razorpay integration** | ✅ Orders, HMAC signature verification, idempotent webhook fallback |
| **AI buyers** | ✅ 9-tool MCP server · 13-tool in-app agent · 3 merged identity paths |
| **Revenue loop** | ✅ Projected → measured actuals → bounded 0…1 projection accuracy written back per campaign |

**Run the bar suite:**
```bash
cd backend && tsx src/bar-tests.ts
```

---

## Contents

- [1. Overview](#1-overview)
- [2. Architecture at a Glance](#2-architecture-at-a-glance)
- [3. Pillar 1 — Merchant Revenue Growth](#3-pillar-1--merchant-revenue-growth)
- [4. Pillar 2 — AI-Buyer Transactable End-to-End](#4-pillar-2--ai-buyer-transactable-end-to-end)
- [5. The Bar — Requirements Matrix](#5-the-bar--requirements-matrix)
- [6. Differentiators](#6-differentiators)
- [7. Tech Stack](#7-tech-stack)
- [8. Quick Start](#8-quick-start)
- [9. Project Structure](#9-project-structure)
- [10. API & Agent Surfaces](#10-api--agent-surfaces)
- [11. Tests](#11-tests)
- [12. Protocol & Standards Alignment](#12-protocol--standards-alignment)
- [13. Documentation Index](#13-documentation-index)
- [14. Known Gaps](#14-known-gaps)
- [15. License](#15-license)

---

## 1. Overview

Urban Store is a two-sided commerce system:

- **For merchants,** a data-driven campaign orchestrator proposes CLEARANCE, BUNDLE, URGENCY, SEASONAL, and CROSS_SELL campaigns based on real velocity, abandonment, slow-mover, and revenue data. Each proposal ships with projections, the system writes *measured actuals* back to each campaign row, and a bounded projection-accuracy score (0…1) is aggregated so the merchant can tell, over time, whether the AI is under- or over-optimistic.
- **For AI buyers,** a semantic product catalog indexed via local embeddings + pgvector, a **9-tool MCP server** for Claude Desktop, a **13-tool Groq in-app conversational agent**, upsell & cross-sell primitives, three identity paths (OAuth PKCE / personal API keys / session cookies), and a full Razorpay payment loop (order → HMAC confirm → atomic stock → idempotent webhook fallback).

Every money action is **explainable**, **bounded**, **gated**, **auditable**, and **atomically roll-backed** on stock exhaustion — see §5 for the full bar matrix.

---

## 2. Architecture at a Glance

Six layers, all server-enforced:

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Clients                                                                │
│  ├─ Browser user                (storefront, cart, pay, audit, admin)   │
│  ├─ Claude (MCP)                (9 tools via Streamable HTTP)           │
│  ├─ In-app agent chat (Groq)    (13 tools in AIPanel)                  │
│  └─ Merchant admin              (campaigns, KPIs, projection accuracy)  │
├─────────────────────────────────────────────────────────────────────────┤
│  Frontend · Next.js 16 · React 19 · Tailwind v4 · TypeScript 5          │
├─────────────────────────────────────────────────────────────────────────┤
│  Identity + Rate Edge                                                   │
│  ├─ 3-way identity merge:  ① Session  ② OAuth Bearer (PKCE) ③ API Key  │
│  └─ 8 scoped rate-limit buckets (strictest on checkout: 10/min)        │
├─────────────────────────────────────────────────────────────────────────┤
│  Backend · Fastify 5 · Zod v4 · Prisma 6 ORM · 15 route groups         │
├─────────────────────────────────────────────────────────────────────────┤
│  Service Layer · 8 core services (catalog / cart / checkout / agent /   │
│  campaign / policy / audit / analytics)                                 │
├─────────────────────────────────────────────────────────────────────────┤
│  Persistence + External APIs                                            │
│  ├─ PostgreSQL + pgvector (Supabase)                                    │
│  ├─ Xenova all-MiniLM-L6-v2 (local embeddings)                         │
│  ├─ Groq (campaign proposals + in-app agent)                            │
│  └─ Razorpay (orders · signature verify · webhook fallback)             │
└─────────────────────────────────────────────────────────────────────────┘
```

For detailed diagrams see [FLOWCHART.md](file:///d:/Razorpay/urban-store/FLOWCHART.md) and the stand-alone [urban-ai-ecosystem.html](file:///d:/Razorpay/urban-store/urban-ai-ecosystem.html).

---

## 3. Pillar 1 — Merchant Revenue Growth

Campaign orchestrator with a *measured closed loop* (not just projections):

| Step | What | Where |
|---|---|---|
| **Data pull** (parallel) | Slow movers · sell-through · product velocity · cart abandonment · stock health · 30-day AOV | [analytics.service.ts](file:///d:/Razorpay/urban-store/backend/src/services/analytics.service.ts) |
| **Propose** | Typed Groq prompt → 3–5 JSON proposals of types `CLEARANCE`, `BUNDLE`, `URGENCY`, `SEASONAL`, `CROSS_SELL`, each with `reasoning[]` and `projected{units,revenue,netGain}` | [campaign.service.ts](file:///d:/Razorpay/urban-store/backend/src/services/campaign.service.ts) |
| **Approve / Dismiss** | Admin review UI; on approval → original prices snapshotted, variant prices updated, active carts repriced; on expiry → automatic revert | [admin/campaigns/page.tsx](file:///d:/Razorpay/urban-store/app/admin/campaigns/page.tsx) |
| **Measure** | Actuals summed from `Order.itemsJson` scoped to product + approvedAt window; lazy 1 h refresh or force-write on expiry | `persistCampaignOutcomes` in [campaign.service.ts](file:///d:/Razorpay/urban-store/backend/src/services/campaign.service.ts) |
| **Verdict** | Per-campaign verdict (`ahead` / `on_track` / `behind` / `insufficient_data`) with narrative feedback; aggregate `projectionAccuracy` (0…1) across all campaigns | `getCampaignPerformance` in [campaign.service.ts](file:///d:/Razorpay/urban-store/backend/src/services/campaign.service.ts) |
| **Write-back** | Each campaign row permanently stores `actualResults`, `deltaRevenuePct`, `projectionAccuracy`, `lastMeasuredAt` — so the next round trains on real outcomes | [schema.prisma Campaign model](file:///d:/Razorpay/urban-store/backend/prisma/schema.prisma) |

---

## 4. Pillar 2 — AI-Buyer Transactable End-to-End

AI buyers can shop, get recommendations, and pay via three entry points:

### 4.1 Agent-readable semantic catalog

- 500+ products indexed via **local Xenova embeddings** + **pgvector** cosine search, with keyword fallback.
- Structured fields: `useCases[]`, `suitableFor[]`, relationships (`complements`, `frequentlyBoughtWith`, `upgradeTo`).
- See [catalog.service.ts](file:///d:/Razorpay/urban-store/backend/src/services/catalog.service.ts) and [embedding.service.ts](file:///d:/Razorpay/urban-store/backend/src/services/embedding.service.ts).

### 4.2 MCP server for Claude Desktop

9 tools exposed at `POST /mcp`:

| # | Tool | Purpose |
|---|------|---------|
| 1 | `search_catalog(query, category, minPrice, maxPrice)` | Semantic + keyword search |
| 2 | `get_product(productId)` | Full product + variants + relationships |
| 3 | `get_cart()` | Current cart + totals + item count |
| 4 | `add_to_cart(productId, variantId, quantity)` | Add + returns upsell suggestions |
| 5 | `remove_from_cart(itemId)` | Remove by cart item id |
| 6 | `request_checkout_confirmation()` | **Server-issued nonce** bound to subtotal |
| 7 | `create_checkout(confirmationNonce)` | **Nonce REQUIRED** — returns Razorpay order + URL |
| 8 | `get_orders()` | Paginated order history |
| 9 | `get_upsell(productId)` · `get_upgrade(productId)` | Frequently-bought-with / premium next-tier |

**Security (non-bypassable):** the `confirmationNonce` is issued server-side, single-use, 2-minute TTL, **subtotal-bound** (auto-invalidates if the cart changes). Five explicit failure modes — `UNKNOWN`, `REUSED`, `EXPIRED`, `WRONG_USER`, `AMOUNT_MISMATCH`. See [mcp.routes.ts](file:///d:/Razorpay/urban-store/backend/src/routes/mcp.routes.ts#L50-L110).

### 4.3 In-app conversational agent (Groq)

13 tools surfaced in the right-hand AI panel: keyword + semantic search, get product, availability, discounts, cart CRUD, upsell/upgrade, checkout creation, order history, cancel. Each turn ships with a structured `ExplainBlock` so users can audit why a recommendation was made. See [agent.service.ts](file:///d:/Razorpay/urban-store/backend/src/services/agent.service.ts) and [AIPanel.tsx](file:///d:/Razorpay/urban-store/components/AIPanel.tsx).

### 4.4 Identity & payments

- **Three identity paths** merged into one identity resolver: Session cookie, OAuth 2.0 + PKCE Bearer token (per-grant scopes + `agentGrantId`), Personal API key (`us_live_` prefix). See [oauth.routes.ts](file:///d:/Razorpay/urban-store/backend/src/routes/oauth.routes.ts), [OAuth PKCE schema](file:///d:/Razorpay/urban-store/backend/prisma/schema.prisma#L66-L82), [auth.middleware.ts](file:///d:/Razorpay/urban-store/backend/src/middleware/auth.middleware.ts).
- **Razorpay loop:** `orders.create` → browser-side confirm with HMAC-SHA256 signature verify → `prisma.$transaction` atomic stock decrement + order creation → closed-tab fallback via [webhook.routes.ts](file:///d:/Razorpay/urban-store/backend/src/routes/webhook.routes.ts). See [checkout.service.ts](file:///d:/Razorpay/urban-store/backend/src/services/checkout.service.ts).

---

## 5. The Bar — Requirements Matrix

Every Track 01 bar item cleared with **server-side enforcement**, not prompt instructions:

| Bar requirement | Implemented | Evidence |
|---|---|---|
| **Explainable** every money action | ✅ | `ExplainBlock` per agent turn · `issues[]` codes per policy decision · `reasoning[]` arrays citing numbers · performance narrative feedback |
| **Bounded** spend & policy | ✅ | Per-order qty limits · price-snapshot drift detection · 8 scoped rate-limit buckets · cart policy evaluator · `SpendingMandate` + `StockReservation` DB primitives schema-ready |
| **Gated** — AI cannot move money | ✅ | MCP YES-nonce gate (5 fail modes) · Agent YES code guard · nonce subtotal-bound · 2-min TTL · single-use |
| **Audit trail** per grant | ✅ | `AuditLog` rows carry `agentGrantId` · named events (`checkout.create / confirmed / signature_mismatch / campaign_policy_rejected / webhook.payment_captured / order.cancel`) · `/audit` page |
| **One failure handled gracefully** | ✅ | Concurrent checkout: mid-loop stock exhaustion → full `$transaction` rollback (variant A's decrement fully restored when B fails) · clean `STOCK_EXHAUSTED:sku_B` to caller · webhook returns 200 to prevent retries |
| **Measured** revenue loop | ✅ | Per-campaign write-back of actualResults / deltaRevenuePct / projectionAccuracy · force snapshot on expiry · lazy 1h refresh · ahead/on_track/behind verdicts · aggregate accuracy score 0…1 |

Run `tsx backend/src/bar-tests.ts` to reproduce — **22/22 passing** as of this revision.

---

## 6. Differentiators

1. **Revenue loop closed (not just projected).** Most campaign demos stop at "AI predicts +₹X". Urban Store writes *measured* actuals and a bounded 0…1 projection-accuracy back to the row, so you can train the next round on real outcomes.
2. **Security in code, not prompts.** The YES gate is a cryptographically-random, subtotal-bound, single-use nonce issued server-side; prompt injection cannot bypass it. Policy and rate limits fire in the route layer before any business logic runs.
3. **Honest technical claims.** HMAC-SHA256 is explicitly labeled as symmetric; no fabrication of asymmetric ECDSA-based verifiable claims. See [PROTOCOL_ALIGNMENT.md](file:///d:/Razorpay/urban-store/PROTOCOL_ALIGNMENT.md).
4. **Three AI-buyer identity paths.** OAuth 2.0 + PKCE for Claude Desktop public clients, personal API keys for embed-in-URL use, session cookies for in-app chat — all merge to one identity resolver, all attributed via `agentGrantId`.
5. **Idempotency everywhere.** `createCheckout` reuses pending checkouts for the same cart (no duplicate Razorpay orders). `confirmCheckout` returns the existing order if already paid. Webhook path handles already-paid and checkout-not-found idempotently.

---

## 7. Tech Stack

| Layer | Details |
|---|---|
| Frontend | Next.js 16 · React 19 · TypeScript 5 · Tailwind CSS v4 · lucide-react |
| Backend | Fastify 5 · TypeScript 5 · Zod v4 · Prisma ORM 6 · tsx watch |
| Database | PostgreSQL + pgvector (Supabase recommended) · Prisma migrations · 7 migrations |
| AI | Groq SDK · default `llama-3.3-70b-versatile` (fallback: `llama-3.1-8b-instant`, 3 retries with exponential backoff) |
| Payments | Razorpay test-mode · `razorpay` v2 · `payment.captured` + `payment.failed` webhooks |
| Auth | Session cookies (argon2 hashing) · OAuth 2.0 Authorization Code + PKCE · Personal API keys (`us_live_`) |
| Embeddings | Local (offline) via Xenova Transformers · `all-MiniLM-L6-v2` · cached in `backend/.model-cache/` |
| Agent surfaces | `@modelcontextprotocol/sdk` v1 (Streamable HTTP) · MCP connect page + docs |

---

## 8. Quick Start

### Prerequisites

- Node.js 20+ (22+ recommended)
- PostgreSQL 15+ with the **pgvector** extension (Supabase Postgres works out of the box)
- A [Groq API key](https://console.groq.com) (free tier)
- [Razorpay test-mode keys](https://dashboard.razorpay.com)

### 8.1 Backend (Fastify → :4000)

```bash
cd backend
cp .env.example .env
# Edit .env:
#   DATABASE_URL        (Supabase Transaction mode, port 6543)
#   DIRECT_URL          (Supabase Session mode, port 5432)
#   COOKIE_SECRET       openssl rand -base64 32
#   FRONTEND_URL        http://localhost:3000
#   BACKEND_PUBLIC_URL  http://localhost:4000
#   GROQ_API_KEY        your key
#   RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET / RAZORPAY_WEBHOOK_SECRET

# Run migrations, seed 500 products, start the dev server
npm install
npx prisma migrate deploy
npm run seed        # seeds + embeds the catalog
npm run dev         # tsx watch src/server.ts  → http://localhost:4000/healthz
```

### 8.2 Frontend (Next.js → :3000)

```bash
# From repo root
cp .env.local .env.local   # if already present, verify values:
#   NEXT_PUBLIC_BACKEND_URL=http://localhost:4000
#   NEXT_PUBLIC_RAZORPAY_KEY_ID=your_razorpay_test_key_id

npm install
npm run dev       # → http://localhost:3000
```

### 8.3 Razorpay Webhook (recommended, handles closed-tab payments)

In Razorpay Dashboard → Settings → Webhooks:

- **URL:** `https://your-backend-host.example.com/webhooks/razorpay`
- **Events:** `payment.captured`, `payment.failed`
- **Secret:** match `RAZORPAY_WEBHOOK_SECRET` in backend `.env`

### 8.4 Smoke-check the full flow

1. Open `http://localhost:3000` → click **Connect** → get your MCP URL with a `?key=us_live_…` token.
2. Open Claude Desktop → configure MCP with the URL → run `search_catalog("wireless earbuds")`.
3. Follow the 3-step YES gate: `get_cart` → `request_checkout_confirmation` → (say YES in Claude) → `create_checkout(confirmationNonce="…")`.
4. Visit the returned Razorpay payment URL → complete test-mode payment → see the order appear in `/orders` + `/audit`.

---

## 9. Project Structure

```
urban-store/
├─ app/                              Next.js App Router pages
│  ├─ (storefront)                   / · /product/[id] · /cart · /pay/[id]
│  ├─ admin/                         /admin · /admin/campaigns  (middleware-protected)
│  ├─ audit/                         /audit  (client + server AuditLog merged)
│  ├─ connect/                       MCP URL + Claude setup guide
│  ├─ dev-agent/                     Full reasoning trace viewer
│  ├─ login/                         Session auth form
│  └─ oauth/authorize/               OAuth 2.0 consent screen
├─ components/                       Reusable UI (AIPanel, CartDrawer, ProductCard, …)
├─ lib/                              Frontend utilities (AuthContext, auditStore, behaviour)
├─ public/                           Static assets
├─ backend/
│  ├─ api/                           Vercel serverless entry (vercel.json rewrite)
│  ├─ prisma/
│  │  ├─ schema.prisma               Data model (pgvector, OAuth PKCE, Campaign, AuditLog, …)
│  │  └─ migrations/                 7 migration files
│  ├─ src/
│  │  ├─ server.ts                   Fastify composition (15 route groups, rate limits, CORS)
│  │  ├─ bar-tests.ts                22 bar tests (5 groups)
│  │  ├─ seed.ts · embed-catalogue.ts
│  │  ├─ middleware/                 auth · admin · agent (scoped rate limits)
│  │  ├─ routes/                     15 route groups (catalog / cart / checkout / order
│  │  │                               · agent · mcp · admin · auth · oauth · behaviour
│  │  │                               · webhook · openapi · protocol-discovery)
│  │  ├─ services/                   8 services
│  │  │   ├─ catalog.service.ts      Semantic + keyword search (pgvector)
│  │  │   ├─ cart.service.ts         priceSnapshot enforcement
│  │  │   ├─ checkout.service.ts     Razorpay · HMAC · atomic stock
│  │  │   ├─ agent.service.ts        Groq agent · ExplainBlock · YES guard
│  │  │   ├─ campaign.service.ts     Propose → activate → measure → write-back
│  │  │   ├─ policy.service.ts       Cart policy (qty, drift, availability)
│  │  │   ├─ audit.service.ts        Per-grant, per-action AuditLog
│  │  │   └─ analytics.service.ts    Revenue · velocity · abandonment
│  │  └─ db/prisma.ts                Prisma client singleton
│  ├─ .env.example                   Reference env template
│  ├─ package.json                   Backend scripts + deps
│  ├─ tsconfig.json
│  ├─ vercel.json                    Vercel + /api rewrite
│  └─ urban_store_catalog_500.json   Seed data (500+ products w/ metadata)
├─ urban-ai-ecosystem.html           Stand-alone architecture reference + flowcharts
├─ FLOWCHART.md                      14 Mermaid diagrams
├─ POSITIONING.md                    Value prop, stack, scope, limits
├─ PROTOCOL_ALIGNMENT.md             UAP/ACP/AP2/x402 convergent primitives + honest non-claims
├─ AGENTS.md · CLAUDE.md             Development prompts for spec-mode work
├─ DEPLOYMENT.md · VERCEL_DEPLOYMENT_AUDIT.md
├─ package.json / tsconfig.json      Next.js root config
├─ next.config.ts / postcss.config.mjs / eslint.config.mjs
└─ .env.local                        Frontend env (NEXT_PUBLIC_BACKEND_URL, NEXT_PUBLIC_RAZORPAY_KEY_ID)
```

---

## 10. API & Agent Surfaces

| Surface | Base | Notes |
|---|---|---|
| **REST API** | `http://localhost:4000/api/v1` | Catalog / Cart / Checkout / Orders / Behaviour / Agent Chat. Swagger via `/openapi.json`. |
| **Admin API** | `/api/v1/admin` | `POST /campaigns/generate`, `PATCH /campaigns/:id/(approve\|dismiss)`, `GET /campaigns/:id/performance`, `GET /campaigns/projection-summary` — Admin-role middleware enforced. |
| **MCP (Claude / any MCP agent)** | `POST /mcp` | Streamable HTTP transport. 9 tools — see §4.2. |
| **OAuth 2.0 + PKCE** | `/oauth/authorize`, `/oauth/token`, `/.well-known/oauth-authorization-server` | Authorization Code with PKCE S256. Bearer tokens scoped to grants. |
| **Personal API keys** | Header `X-Api-Key: us_live_…` or query `?key=us_live_…` | Issued from `/connect`, works for MCP and REST. |
| **Razorpay Webhook** | `POST /webhooks/razorpay` | HMAC-SHA256 verified. `payment.captured` → idempotent confirm → HTTP 200 on stock exhaustion to avoid retries. |
| **Protocol Discovery** | `/.well-known/agent-commerce.json`, `/.well-known/ap2-mandate.json`, `/.well-known/ucp-catalog.json`, `/.well-known/ai-plugin.json` | Auto-discovery for AI agents. `X-Merchant-Primitives` response header on every route. |

---

## 11. Tests

### Bar test suite — 22/22 passing

```bash
cd backend
tsx src/bar-tests.ts
```

Five test groups:

| Group | Count | What they verify |
|---|---|---|
| **Group 1 — YES Gate** | 6 | Nonce issues correctly · reuses rejected · expires · user mismatches · amount mismatches · valid path returns nonce |
| **Group 2 — Bounds & Policy** | 8 | Per-order qty limits · price-snapshot drift detection · discount bounds · cart invalid on stale snapshots · rate-limit bucket config present |
| **Group 3 — Graceful Failure (Atomic)** | 3 | Mid-loop variant B exhaust → A's decrement rolled back · single variant exhausted → no partial writes · $transaction actually used (source wiring check) |
| **Group 4 — Audit + Policy wiring** | 3 | AuditLog accepts agentGrantId · signature_mismatch event shape · checkout.confirmed shape |
| **Group 5 — Source-wiring** | 2 | `create_checkout` MCP schema requires nonce · agent YES guard branch present (not prompt-only) |

Each test has a human-readable name (e.g., `MCP.YES-GATE.1-issue-and-consume-valid-nonce`).

---

## 12. Protocol & Standards Alignment

Urban Store implements the **convergent primitives** that the UAP, ACP, AP2, and x402 efforts are independently standardizing, rather than betting on any one draft:

- **Scoped delegated authority** — OAuth 2.0 Authorization Code + PKCE, per-grant scopes, `agentGrantId` on every action
- **Server YES gate for money movement** — MCP nonce flow + agent code guard
- **Audit per grant** — `AuditLog.agentGrantId` column, `/audit` UI
- **HMAC signature verification** — Razorpay confirm path + webhook, honestly labeled as symmetric
- **Atomic stock + idempotent money ops** — Prisma `$transaction` + idempotent confirm + webhook
- **Price snapshots** — Detect mid-checkout drift and block
- **`.well-known` discovery** — Catalog, mandate, agent-commerce, AI-plugin manifests

**Deliberate non-claims** (we do not fabricate what the code doesn't ship):
- No asymmetric ECDSA-based verifiable credential / AP2 VDC claims
- No third-party-checkable mandate attestation path
- No x402 `402 Payment Required` response flow
- No UAP "Reserve Pay" interop against external acquirers (schema-ready, not wired)

Full write-up with rationale and references in [PROTOCOL_ALIGNMENT.md](file:///d:/Razorpay/urban-store/PROTOCOL_ALIGNMENT.md).

---

## 13. Documentation Index

| Document | Purpose |
|---|---|
| [POSITIONING.md](file:///d:/Razorpay/urban-store/POSITIONING.md) | Value prop, target users, success metrics, scope, limits, honest differentiation |
| [PROTOCOL_ALIGNMENT.md](file:///d:/Razorpay/urban-store/PROTOCOL_ALIGNMENT.md) | UAP / ACP / AP2 / x402 convergent-primitives mapping + deliberate non-claims |
| [FLOWCHART.md](file:///d:/Razorpay/urban-store/FLOWCHART.md) | 14 Mermaid diagrams: architecture, YES gate, Razorpay confirm, atomic stock, OAuth, 3 identity paths, campaign loop, margin flow |
| [urban-ai-ecosystem.html](file:///d:/Razorpay/urban-store/urban-ai-ecosystem.html) | Stand-alone architecture reference page (6 numbered sections, 5 diagrams, code-reference index table) |
| [bar-tests.ts](file:///d:/Razorpay/urban-store/backend/src/bar-tests.ts) | Verifiable bar suite (22 tests, 5 groups) |
| [AGENTS.md](file:///d:/Razorpay/urban-store/AGENTS.md) / [CLAUDE.md](file:///d:/Razorpay/urban-store/CLAUDE.md) | Internal agent dev prompts for spec/planning mode |
| [DEPLOYMENT.md](file:///d:/Razorpay/urban-store/DEPLOYMENT.md) / [VERCEL_DEPLOYMENT_AUDIT.md](file:///d:/Razorpay/urban-store/VERCEL_DEPLOYMENT_AUDIT.md) | Deployment runbooks + Vercel audit output |
| [backend/.env.example](file:///d:/Razorpay/urban-store/backend/.env.example) | Backend environment variable template with inline comments |
| [backend/package.json scripts](file:///d:/Razorpay/urban-store/backend/package.json#L6-L17) | `dev`, `build`, `start`, `prisma:*`, `seed`, `embed` |

---

## 14. Known Gaps

| Gap | Severity | Posture |
|---|---|---|
| No scripted Razorpay test-mode walkthrough in docs | Medium | Record/link a 60-second demo of the end-to-end payment flow for judges. |
| Upsell driven by static `frequentlyBoughtWith`, not order-co-occurrence ML | Low | Infrastructure is correct; training data is the natural next step. |
| `SpendingMandate` & `StockReservation` DB primitives are schema-only | Medium | Frame honestly as "schema shape ready for UAP Reserve Pay interop." |
| No x402-native `402 Payment Required` response | Low | Razorpay payment URLs are more practical; alt-response shape is a one-line change if needed. |
| BUNDLE, CROSS_SELL, SEASONAL are informational badges today | Low | CLEARANCE + URGENCY mutate prices correctly; bundle-level coupon infra is the extension. |

---

## 15. License

Urban Store is proprietary / closed-source for the duration of the hackathon and judging period. Reach out to the authors for commercial or reuse terms.

---

*This README is kept in sync with the code. If any claim here disagrees with what the source does, the source wins — please open an edit to bring this document up to date.*

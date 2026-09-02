# Urban Store — AI-Native Commerce Platform

> **Hackathon Track 01 · AI Growth & Agentic Commerce**
> Grow merchant revenue and make a merchant transactable by an AI buyer — end to end.

---

## Architecture Overview

<!--
  The HTML diagram is embedded below via a raw HTML block.
  GitHub renders HTML in README files — the diagram is fully interactive.
  If viewing on GitHub, the diagram renders inline.
  For a standalone view, open urban-ai-ecosystem.html directly in a browser.
-->

<details>
<summary><strong>Interactive Architecture Diagram</strong> — click to expand</summary>

> Open `urban-ai-ecosystem.html` in a browser for the full interactive version with all 5 phases.

</details>

---

## What's Built

### Phase 1 — Conversational In-App Checkout

A full shopping agent powered by **Groq (llama-3.3-70b-versatile)** with **13 tools** across discovery, cart, upsell, and checkout. The agent handles the complete buy flow — find → add → upsell → confirm → pay — without the user leaving the chat.

**Agent tools:**

| # | Tool | Purpose |
|---|------|---------|
| 1 | `search_products` | Keyword search across 500+ products |
| 2 | `get_product` | Full product + all variant SKUs |
| 3 | `get_availability` | Real-time stock per variant |
| 4 | `search_discounts` | Products where price < MRP, sorted by % off |
| 5 | `get_cart` | Current cart with totals |
| 6 | `add_to_cart` | Add specific variant by SKU |
| 7 | `update_cart_item` | Change quantity |
| 8 | `remove_from_cart` | Remove item |
| 9 | `get_upsell` ⭐ | Frequently-bought-together — auto-fired after add_to_cart |
| 10 | `get_upgrade` ⭐ | Premium next-tier product — fired on "better version?" |
| 11 | `create_checkout` | Create Razorpay order (server-side YES gate enforced) |
| 12 | `get_orders` | Order history |
| 13 | `cancel_order` | Cancel placed/processing orders |

**Security — the YES gate:**
The server enforces a code-level confirmation gate before any checkout. The LLM cannot bypass it regardless of prompt injection. Confirmation expires after 5 minutes and survives cold starts via history-based fallback.

**Groq reliability:**
`groqCreate()` wraps every LLM call with 3 retries (exponential backoff: 500 / 1000 / 2000ms) and falls back to `llama-3.1-8b-instant` on the final attempt.

---

### Phase 2 — AI Buyer via MCP (Claude)

A **Streamable HTTP MCP server** at `POST /mcp` lets Claude (or any MCP-compatible agent) shop Urban Store autonomously.

- **Auth:** API key in query string / `X-Api-Key` header / OAuth Bearer token
- **Tools exposed:** same discovery, cart, upsell, upgrade, checkout, and order tools
- **Shopping prompt:** registered as a named MCP prompt — Claude reads it automatically at session start
- **Connect page:** `/connect` — users get their personal `?key=us_live_xxx` MCP URL in one click

**Full AI buyer flow:**
```
Claude searches → gets variants → adds to cart → get_upsell auto-fires →
user says YES → create_checkout → paymentUrl returned →
user visits /pay/:id → Razorpay payment → order confirmed
```

---

### Phase 3 — Campaign Orchestrator

An AI marketing agent analyses real store data and proposes campaigns. The admin approves — prices update in the database automatically.

**Pipeline:**
1. Admin clicks "Generate Decisions" → `POST /api/v1/admin/campaigns/generate`
2. Analytics gathered in parallel: revenue (30d), slow-moving products, cart abandonment, stock health, product velocity
3. Groq analyses and returns 3–5 proposals: `CLEARANCE`, `BUNDLE`, `URGENCY`, `SEASONAL`, `CROSS_SELL`
4. Each proposal includes: reasoning[], projections{}, risks[], priority
5. Admin reviews and approves or dismisses

**On approval:**
- `CLEARANCE` / `URGENCY`: original prices snapshotted, discount applied to every ProductVariant row, active cart items repriced (no policy drift)
- `BUNDLE` / `SEASONAL` / `CROSS_SELL`: informational — badge rendered on storefront

**On dismiss or expiry (7 days):**
- `revertCampaignAction()` restores original prices from the snapshot
- `expireOverdueCampaigns()` runs lazily on every storefront fetch and on server startup — no cron needed

---

### Phase 4 — Behaviour Tracking & Personalisation

Browser events tracked fire-and-forget via `lib/behaviour.ts`:

| Event | Trigger |
|-------|---------|
| `product_page_viewed` | Product page mount |
| `category_browsed` | CategoryNav click |
| `search_query` | Agent returns ExplainBlock with results |
| `cart_add` | Add to cart from storefront grid |

**Feedback loop:** On every new conversation, the agent fetches `getTrendingSearches(7, 5)` and injects the top searches as hidden system prompt context — nudging recommendations toward what the store is trending on.

---

### Phase 5 — Audit Trail

**Dual layer — every money action explainable:**

- **Client (localStorage):** Real-time event timeline in `AuditEntry[]` — USER_REQUEST, TOOL_CALL, TOOL_RESULT, CART_ACTION, POLICY, RAZORPAY, ERROR. Capped at 5 sessions. Reactive via CustomEvent.
- **Server (PostgreSQL):** `AuditLog` table with `agentGrantId` column — distinguishes human vs. agent-initiated actions. Payload capped at 1KB.
- **Audit page:** `/audit` — session switcher, filter by event type, real-time updates, DB logs merged as "All Time" session.

**Failure modes handled:**

| Failure | How it's handled |
|---------|-----------------|
| YES gate bypass attempt | `isCheckoutConfirmed()` returns false → `CONFIRMATION_REQUIRED` |
| Stock exhausted at payment | `prisma.$transaction` re-checks + throws `STOCK_EXHAUSTED:{sku}` |
| Signature mismatch | HMAC-SHA256 verified at both browser confirm and Razorpay webhook |
| Browser tab closed after payment | `POST /webhooks/razorpay` confirms server-side with HMAC verification |
| Out of stock add_to_cart | Returns `OUT_OF_STOCK`, agent auto-searches alternatives |
| Groq rate limit / timeout | Retry × 3 with backoff, fallback model |
| Cancel non-cancellable order | `CANNOT_CANCEL` error — graceful message to user |

---

## Setup

### Prerequisites

- Node.js 20+
- PostgreSQL (Supabase recommended)
- Groq API key — [console.groq.com](https://console.groq.com) (free)
- Razorpay test-mode keys — [dashboard.razorpay.com](https://dashboard.razorpay.com)

### Backend

```bash
cd backend
cp .env.example .env
# Fill in DATABASE_URL, DIRECT_URL, GROQ_API_KEY, RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET
# Optionally set RAZORPAY_WEBHOOK_SECRET for server-side payment confirmation

npx prisma migrate deploy
npx ts-node src/seed.ts   # seeds 500+ products from urban_store_catalog.json
npm run dev               # starts on :4000
```

### Frontend

```bash
# From urban-store root
cp .env.local.example .env.local
# Set NEXT_PUBLIC_BACKEND_URL and NEXT_PUBLIC_RAZORPAY_KEY_ID

npm install
npm run dev   # starts on :3000
```

### Razorpay Webhook (optional but recommended)

In Razorpay Dashboard → Settings → Webhooks:
- URL: `https://your-backend.com/webhooks/razorpay`
- Events: `payment.captured`, `payment.failed`
- Secret: set `RAZORPAY_WEBHOOK_SECRET` in your backend `.env`

---

## Key Pages

| Page | Path | Description |
|------|------|-------------|
| Storefront | `/` | Live product grid, AI panel, campaign badges |
| AI Chat | `/` (right panel) | Urban AI — conversational shopping agent |
| Dev Agent | `/dev-agent` | Full reasoning trace — tool calls, args, durations |
| Audit Trail | `/audit` | Real-time event log — client + server merged |
| Admin Dashboard | `/admin` | Revenue, stock health, cart abandonment KPIs |
| Admin Campaigns | `/admin/campaigns` | Generate, review, approve/dismiss AI campaigns |
| Connect (Claude) | `/connect` | Personal MCP URL + Claude setup guide |
| Payment | `/pay/[id]` | Standalone Razorpay checkout page |

---

## Tech Stack

| Layer | Stack |
|-------|-------|
| Frontend | Next.js 15 · TypeScript · Tailwind CSS |
| Backend | Fastify 5 · TypeScript · Prisma ORM |
| Database | PostgreSQL (Supabase) + pgbouncer pooling |
| AI | Groq SDK · llama-3.3-70b-versatile (fallback: llama-3.1-8b-instant) |
| Payments | Razorpay test-mode — orders + webhook |
| Auth | Session cookies + OAuth 2.0 + PKCE + API keys |
| MCP | @modelcontextprotocol/sdk v1 · Streamable HTTP transport |

---

## Production Hardening Applied

| # | Fix | Status |
|---|-----|--------|
| 1 | Campaign price revert on dismiss/expiry | ✅ |
| 2 | Lazy campaign expiry enforcement | ✅ |
| 3 | Groq retry + fallback model | ✅ |
| 4 | Razorpay server-side webhook | ✅ |
| 5 | Per-user agent rate limit (20/min) | ✅ |
| 6 | make-admin route removed | ✅ |
| 7 | Cart repriced after campaign execution | ✅ |
| 8 | DB connection pooling configured | ✅ |
| 9 | Input sanitisation (control chars) | ✅ |
| 10 | Health check with DB probe | ✅ |
| 11 | Audit payload capped at 1KB | ✅ |
| 12 | localStorage sessions capped at 5 | ✅ |
| 13 | Session cleared on logout | ✅ |

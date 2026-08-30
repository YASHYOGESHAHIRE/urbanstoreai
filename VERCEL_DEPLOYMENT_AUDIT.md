# Vercel Deployment Audit — Urban Store

## 1. Current Architecture

| Layer | Technology | Entry Point |
|-------|-----------|-------------|
| Frontend | Next.js 16, React 19, Tailwind 4 | `app/` (App Router) |
| Backend | Fastify 5, TypeScript, Node 20 | `backend/src/server.ts` |
| Database | Prisma 6 + PostgreSQL (Supabase) | `backend/src/db/prisma.ts` |
| Payments | Razorpay | `backend/src/services/checkout.service.ts` |
| AI | Groq (llama-3.3-70b) | `backend/src/services/agent.service.ts` |
| Embeddings | @xenova/transformers (local CPU model) | `backend/src/services/embedding.service.ts` |

## 2. Repository Structure

```
urban-store/
  app/                     ← Next.js App Router pages
  components/              ← React components
  lib/                     ← Frontend utilities (auth, products)
  backend/
    src/
      server.ts            ← Fastify app + app.listen()
      routes/              ← 10 route modules
      services/            ← 13 service modules
      middleware/          ← auth, admin, agent middleware
      db/prisma.ts         ← Prisma singleton
    prisma/schema.prisma   ← DB schema
  .github/workflows/       ← Azure-targeted CI/CD (backend.yml, frontend.yml)
```

---

## 3. Frontend Compatibility — **SAFE**

| Check | Result | Notes |
|-------|--------|-------|
| Next.js version | SAFE | v16 — Vercel natively supports it |
| App Router | SAFE | Fully supported on Vercel |
| No API routes | SAFE | All API calls go to backend, no Next.js API routes |
| `NEXT_PUBLIC_BACKEND_URL` | SAFE | All 7 files use this env var consistently |
| `localhost:4000` fallbacks | SAFE | Dev-only fallback, will be overridden by env var in production |
| `lib/products.ts` requires catalog JSON | **REQUIRES CHANGE** | `require("../backend/urban_store_catalog.json")` — works locally but path resolution in Vercel build may fail depending on working directory |
| `credentials: "include"` cookies | **NEEDS VERIFICATION** | Cross-origin cookies require SameSite=None + Secure + correct CORS. Vercel frontend and backend will be on different domains. |
| No WebSockets, SSE, streaming | SAFE | None found |
| No filesystem writes | SAFE | None in frontend |
| No background jobs | SAFE | None in frontend |

## 4. Backend Compatibility — **NOT COMPATIBLE with Vercel Serverless as-is**

| Check | Result | Notes |
|-------|--------|-------|
| `await app.listen({ host, port })` | **NOT COMPATIBLE** | Fastify calls `app.listen()` — this is a persistent TCP server. Vercel serverless functions cannot bind to ports. |
| `@fastify/rate-limit` | **NOT COMPATIBLE** | Uses in-memory rate limiting. Serverless functions are stateless — each invocation is isolated. State is lost between requests. |
| `@fastify/cookie` with `secret` | REQUIRES CHANGE | Cookie signing works per-request, but the session model (DB-backed sessions) will work fine. |
| CORS `origin: FRONTEND_URL` (single string) | SAFE | Works — but must be set correctly in env. |
| Prisma singleton (`globalThis`) | SAFE for serverless | The `globalThis` pattern is correct for serverless — prevents connection pool exhaustion. |
| `DATABASE_URL` with pgbouncer | SAFE | Supabase pooled URL is already correct for serverless. |
| `@xenova/transformers` local model | **NOT COMPATIBLE** | Downloads a ~23MB model to `./.model-cache` at runtime. Serverless functions have a read-only filesystem and a 50MB max compressed size limit. The model exceeds Vercel limits and filesystem writes will fail. |
| No WebSockets | SAFE | None found. |
| No SSE/streaming | SAFE | None found. |
| No background jobs / cron | SAFE | No `setInterval`, `setTimeout`, `cron`, workers found. |
| No filesystem writes | SAFE | No `fs.writeFile` found in production paths. |
| Migrations via `prisma migrate deploy` | REQUIRES CHANGE | Cannot run on serverless. Must be run separately (Supabase dashboard or local CLI). |
| `embed-catalogue.ts` | SAFE | This is a one-off script (npm run embed), not called during request handling. |

**Summary:** The backend CANNOT run on Vercel serverless in its current form due to:
1. `app.listen()` — requires a persistent server process
2. `@fastify/rate-limit` — stateful in-memory rate limiting breaks on serverless
3. `@xenova/transformers` — large local model, filesystem writes, incompatible with serverless

## 5. Prisma / Database Compatibility — **SAFE with caveats**

| Check | Result | Notes |
|-------|--------|-------|
| `globalThis` Prisma singleton | SAFE | Correct serverless pattern — prevents connection pool exhaustion |
| Supabase pooled `DATABASE_URL` (port 6543, pgbouncer) | SAFE | Correct for serverless |
| `DIRECT_URL` for migrations | SAFE | Used only for migrations, not runtime |
| Migrations in deployment | REQUIRES CHANGE | Must be run manually or via separate script before deploy |
| pgvector / `$executeRawUnsafe` | SAFE | Works with Prisma — used only in `embed-catalogue.ts` (offline script) |

## 6. Serverless Compatibility Issues — Summary

| Issue | Severity | Fixable? |
|-------|----------|---------|
| `app.listen()` — persistent TCP server | CRITICAL | Yes — needs Vercel adapter |
| `@fastify/rate-limit` in-memory state | HIGH | Yes — remove or replace with Upstash Redis |
| `@xenova/transformers` local model | HIGH | Yes — embedding generation is offline only; runtime search already uses keyword fallback |
| Migrations can't run on deploy | MEDIUM | Yes — run manually |

## 7. Required Changes

### 7a. Backend — Vercel Adapter

Fastify can run on Vercel as a serverless function using `@vercel/node`. The Fastify app needs to be exported as a handler rather than calling `app.listen()`.

Create `backend/api/index.ts` — a Vercel-compatible entry point that exports the Fastify app as a handler.

The existing `server.ts` (`app.listen()`) is kept unchanged for local development.

### 7b. Remove in-memory rate limiting

`@fastify/rate-limit` uses in-memory state which resets on every cold start. It must be removed for the serverless entry point. Rate limiting on Vercel can be handled at the edge (Vercel's built-in DDoS protection) or via Upstash Redis if needed later.

### 7c. `@xenova/transformers` — No change needed

The `embedding.service.ts` and `embed-catalogue.ts` are **offline scripts only** — they are never called during HTTP request handling. The runtime `catalog.service.ts` uses keyword search only. No change needed.

### 7d. `lib/products.ts` — Fix require path

Change `require("../backend/urban_store_catalog.json")` to use a path relative to the frontend root so it works correctly in Vercel's build environment.

### 7e. GitHub Actions workflows

Both `backend.yml` and `frontend.yml` are Azure-specific. Once Vercel is connected to the GitHub repo directly, Vercel handles CI/CD automatically on every push to `main`. The Azure workflows should be **deleted** to avoid confusion.

## 8. Required Environment Variables

### Vercel Frontend Project
| Variable | Value | Notes |
|----------|-------|-------|
| `NEXT_PUBLIC_BACKEND_URL` | `https://your-backend.vercel.app` | The deployed backend Vercel URL |
| `NEXT_PUBLIC_RAZORPAY_KEY_ID` | Your Razorpay Key ID | Public — safe to expose |

### Vercel Backend Project
| Variable | Value | Notes |
|----------|-------|-------|
| `DATABASE_URL` | Supabase pooled URL (port 6543) | Required by Prisma at runtime |
| `DIRECT_URL` | Supabase direct URL (port 5432) | Required by Prisma for migrations |
| `COOKIE_SECRET` | 32+ char random string | Session cookie signing |
| `FRONTEND_URL` | `https://your-frontend.vercel.app` | CORS origin |
| `NODE_ENV` | `production` | |
| `GROQ_API_KEY` | Your Groq API key | AI agent |
| `GROQ_MODEL` | `llama-3.3-70b-versatile` | |
| `RAZORPAY_KEY_ID` | Your Razorpay Key ID | Payments |
| `RAZORPAY_KEY_SECRET` | Your Razorpay secret | Payments — keep secret |
| `RAZORPAY_WEBHOOK_SECRET` | Your webhook secret | |
| `CLAUDE_CLIENT_SECRET` | Random 32+ char string | OAuth for Claude |
| `CHATGPT_CLIENT_SECRET` | Random 32+ char string | OAuth for ChatGPT |
| `BACKEND_PUBLIC_URL` | `https://your-backend.vercel.app` | OpenAPI spec server URL |

## 9. Required Vercel Configuration

A `vercel.json` IS required because:
- The repo has two distinct deployable services (frontend root + backend subfolder)
- Vercel detects multiple frameworks and doesn't know which is primary
- The backend needs its routes remapped to the Vercel function handler

Two separate Vercel projects from the same repo is the correct architecture (see section 11).

## 10. Is vercel.json Required?

**Yes — one `vercel.json` per project:**
- Frontend project: minimal config (Next.js auto-detected)
- Backend project: routes all requests to the serverless function handler

## 11. Recommended Vercel Architecture

```
GitHub repo: urban-store/
    │
    ├── Vercel Project 1: "urban-store-frontend"
    │     Root: /  (frontend Next.js)
    │     Framework: Next.js (auto-detected)
    │     Deploy trigger: changes in app/, components/, lib/, etc.
    │
    └── Vercel Project 2: "urban-store-backend"
          Root: /backend  (Fastify API)
          Framework: Other
          Entry: api/index.ts (new Vercel adapter)
          Deploy trigger: changes in backend/
```

Both projects connect to the same GitHub repo. Vercel allows selecting the **root directory** per project.

## 12. GitHub Actions Workflows

| Workflow | Status | Action |
|----------|--------|--------|
| `.github/workflows/backend.yml` | Azure-specific | **Delete** — Vercel handles this automatically |
| `.github/workflows/frontend.yml` | Azure-specific | **Delete** — Vercel handles this automatically |

Vercel's GitHub integration automatically deploys on every push to `main` and creates preview deployments for every PR — no GitHub Actions needed.

## 13. Deployment Steps

1. **Run migrations once** (before first deploy):
   ```bash
   cd backend
   npx prisma migrate deploy
   ```
2. Go to [vercel.com/new](https://vercel.com/new) → Import the GitHub repo → Set **Root Directory** to `/` → Framework: Next.js → Add env vars → Deploy (Frontend project)
3. Go to [vercel.com/new](https://vercel.com/new) → Import the same GitHub repo → Set **Root Directory** to `backend` → Framework: Other → Add env vars → Deploy (Backend project)
4. Copy the backend project URL → set as `NEXT_PUBLIC_BACKEND_URL` in the frontend project env vars → Redeploy frontend
5. Set `FRONTEND_URL` in backend project to the frontend Vercel URL → Redeploy backend
6. Seed OAuth clients: `cd backend && npm run seed` (points to production DB)

## 14. Potential Problems / Limitations

| Problem | Severity | Mitigation |
|---------|----------|-----------|
| **Cross-origin cookies** (`credentials: include` from different domains) | HIGH | Backend must set `sameSite: 'none'` and `secure: true` on cookies in production. Already handled — Fastify cookie plugin uses `process.env.NODE_ENV`. Need to verify cookie options. |
| **Cold starts** on Vercel free tier | MEDIUM | Fastify initialises fast. First request after idle may be slow (~500ms). Acceptable for a demo. |
| **Vercel function timeout** (10s on free, 60s on Pro) | MEDIUM | Groq AI calls + Prisma queries could approach 10s on complex turns. Monitor and upgrade to Pro if needed. |
| **Rate limiting is lost** | LOW | In-memory rate limiting removed. Vercel provides basic DDoS protection. Fine for demo. |
| **Database migrations** | LOW | Must be run manually. Cannot run on Vercel deploy. |
| **`@xenova/transformers` on serverless** | N/A | Not used at runtime — search falls back to keyword. No issue. |

## 15. Final Recommendation

✅ **Deploy the frontend on Vercel** — zero changes needed except fixing the catalog JSON require path.

✅ **Deploy the backend on Vercel** — requires one new file (`backend/api/index.ts`) to wrap Fastify as a serverless handler, and removing the in-memory rate limiter from the serverless entry point. The existing `server.ts` is untouched for local dev.

**Two Vercel projects from one GitHub repo** is the correct and supported architecture.

Do NOT force everything into a single Vercel project — the multi-service `vercel.json` approach Vercel's UI suggested is for monorepos with a shared build output, which does not apply here.

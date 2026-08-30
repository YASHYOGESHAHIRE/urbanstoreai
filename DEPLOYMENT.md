# Deployment Guide

Two services, one repo, two GitHub Actions workflows.

| Service | Azure Resource | Workflow |
|---------|---------------|----------|
| Backend (Fastify) | App Service — Node 20 Linux | `.github/workflows/backend.yml` |
| Frontend (Next.js) | Static Web Apps | `.github/workflows/frontend.yml` |

---

## 1. Azure Setup (run once)

```bash
az login
az group create --name urban-store-rg --location eastus

# Backend — App Service
az appservice plan create --name urban-store-plan --resource-group urban-store-rg --sku B1 --is-linux
az webapp create --name urban-store-backend --resource-group urban-store-rg --plan urban-store-plan --runtime "NODE:20-lts"

# Tell Azure to run migrations + start the server
az webapp config set --name urban-store-backend --resource-group urban-store-rg \
  --startup-file "npx prisma migrate deploy && node dist/server.js"

# Frontend — Static Web Apps (free tier)
az staticwebapp create --name urban-store-frontend --resource-group urban-store-rg --location eastus2
```

---

## 2. GitHub Secrets to add

Go to **GitHub → repo → Settings → Secrets and variables → Actions** and add:

### Backend secrets
| Secret | How to get it |
|--------|--------------|
| `AZURE_BACKEND_APP_NAME` | The App Service name, e.g. `urban-store-backend` |
| `AZURE_BACKEND_PUBLISH_PROFILE` | Azure Portal → App Service → Overview → **Download publish profile** → paste entire XML |

### Frontend secrets
| Secret | How to get it |
|--------|--------------|
| `AZURE_STATIC_WEB_APPS_API_TOKEN` | Azure Portal → Static Web App → **Manage deployment token** |
| `NEXT_PUBLIC_BACKEND_URL` | Your deployed backend URL, e.g. `https://urban-store-backend.azurewebsites.net` |

---

## 3. Backend environment variables on Azure

Set these in **Azure Portal → App Service → Configuration → Application settings**
(or via CLI below). These replace your local `backend/.env`.

```bash
az webapp config appsettings set --name urban-store-backend --resource-group urban-store-rg --settings \
  NODE_ENV="production" \
  PORT="8080" \
  HOST="0.0.0.0" \
  DATABASE_URL="<your supabase pooled url>" \
  DIRECT_URL="<your supabase direct url>" \
  COOKIE_SECRET="<generate: openssl rand -base64 32>" \
  FRONTEND_URL="<your static web app url e.g. https://xyz.azurestaticapps.net>" \
  GROQ_API_KEY="<your groq key>" \
  GROQ_MODEL="llama-3.3-70b-versatile" \
  RAZORPAY_KEY_ID="<your razorpay key id>" \
  RAZORPAY_KEY_SECRET="<your razorpay secret>" \
  RAZORPAY_WEBHOOK_SECRET="<your webhook secret>" \
  CLAUDE_CLIENT_SECRET="<generate: openssl rand -base64 32>" \
  CHATGPT_CLIENT_SECRET="<generate: openssl rand -base64 32>"
```

> **Note:** Azure App Service uses port 8080 internally — set `PORT=8080`.

---

## 4. Claude OAuth connection

Once deployed, register Urban Store as an OAuth provider in Claude:

| Field | Value |
|-------|-------|
| Authorization URL | `https://urban-store-backend.azurewebsites.net/oauth/authorize` |
| Token URL | `https://urban-store-backend.azurewebsites.net/oauth/token` |
| Client ID | `claude` |
| Client Secret | value of `CLAUDE_CLIENT_SECRET` you set above |
| Scope | `profile cart:read cart:write checkout` |

The OpenAPI spec for Claude to discover your API:
```
https://urban-store-backend.azurewebsites.net/openapi.json
```

---

## 5. Deploy

Push to `main` — workflows trigger automatically.
- Changes inside `backend/` → only backend workflow runs
- Changes in frontend files → only frontend workflow runs
- Both can be manually triggered via **Actions → Run workflow**

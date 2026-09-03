# Urban Store — System Flowcharts

> Open this file in VS Code with the **Markdown Preview** or install the **Mermaid Preview** extension to view the diagrams.

---

## 1. Overall System Flow

```mermaid
flowchart TD
    subgraph CLIENTS["👤 Clients"]
        U[Browser User]
        C[Claude AI]
        G[ChatGPT]
    end

    subgraph FRONTEND["🖥️ Next.js Frontend · Vercel"]
        SP[Store Page]
        AI[AI Chat Panel]
        AD[Admin Dashboard]
        OA[OAuth Consent Page]
        AU[Audit Trail Page]
    end

    subgraph BACKEND["⚙️ Fastify Backend · Vercel Serverless"]
        MW[Middleware Layer\nattachUser · requireAdmin · attachAgent]
        RT[Routes Layer\n20+ endpoints]
        SV[Services Layer\nBusiness Logic]
    end

    subgraph EXTERNAL["🌐 External Services"]
        DB[(Supabase\nPostgres)]
        GR[Groq AI\ngpt-oss-20b]
        RZ[Razorpay\nPayments]
        MCP[MCP Server\n/mcp endpoint]
    end

    U --> SP & AI & AD & AU
    C --> MCP
    G --> OA

    SP & AI & AD & OA --> FRONTEND
    FRONTEND -->|Bearer Token\nHTTPS| MW
    MW --> RT --> SV
    SV --> DB
    SV --> GR
    SV --> RZ
    MCP --> SV
```

---

## 2. User Authentication Flow

```mermaid
flowchart TD
    A([User opens app]) --> B{Has token\nin localStorage?}
    B -->|Yes| C[GET /auth/me\nwith Bearer token]
    B -->|No| D[Show Login Page]
    C --> E{Valid\nsession?}
    E -->|Yes| F[Set user state\nShow store]
    E -->|No| G[Clear token] --> D
    D --> H[User enters\nemail + password]
    H --> I[POST /auth/login]
    I --> J{Credentials\nvalid?}
    J -->|No| K[Show error] --> H
    J -->|Yes| L[bcrypt.compare\npassword vs hash]
    L --> M[Create Session\nin DB · 30 day TTL]
    M --> N[Return user + token]
    N --> O[Store token\nin localStorage]
    O --> F
```

---

## 3. AI Agent Chat Flow

```mermaid
flowchart TD
    A([User sends message]) --> B[POST /api/v1/agent/chat]
    B --> C{Bearer token\nvalid?}
    C -->|No| D[401 Unauthorized]
    C -->|Yes| E{Message is YES\nand agent asked\nfor confirmation?}
    E -->|Yes| F[Mark checkout\nconfirmed · 5min TTL]
    E -->|No| G
    F --> G[runAgentTurn]

    G --> H{Query specific\nenough?}
    H -->|Vague e.g. 'shoes'| I[Ask one\nclarifying question]
    H -->|Specific enough| J[Call Groq API\nwith tools + history]

    J --> K{Groq returns\ntool_calls?}
    K -->|Yes| L[executeTool]
    K -->|No · final reply| M[Return reply\n+ products + audit]

    L --> N{Which tool?}
    N -->|search_products| O[DB keyword search]
    N -->|get_product| P[DB product detail]
    N -->|get_cart| Q[DB cart lookup]
    N -->|add_to_cart| R[DB\$transaction\nvalidate+upsert]
    N -->|create_checkout| S{Confirmed\nby user in code?}
    N -->|get_orders| T[DB order history]
    N -->|cancel_order| U[DB\$transaction\ncancel+restore stock]
    N -->|search_discounts| V[DB filter\nprice < mrp]

    S -->|No| W[Return\nCONFIRMATION_REQUIRED]
    S -->|Yes| X[Policy checks\n→ Razorpay order]

    O & P & Q & R & T & U & V & X --> Y[Append tool result\nto messages]
    Y --> J
    M --> Z([Response to frontend])
```

---

## 4. Add to Cart Flow

```mermaid
flowchart TD
    A([User clicks\nAdd to Cart]) --> B[POST /api/v1/cart/items]
    B --> C[prisma.\$transaction begins]
    C --> D[Find variant by SKU]
    D --> E{Variant exists\nand matches product?}
    E -->|No| F[Throw INVALID_PRODUCT]
    E -->|Yes| G{availabilityStatus\n!= out_of_stock?}
    G -->|No| H[Throw OUT_OF_STOCK]
    G -->|Yes| I{quantity <=\nmaxQtyPerOrder?}
    I -->|No| J[Throw INVALID_QUANTITY]
    I -->|Yes| K[Get or create\nactive cart]
    K --> L{Item already\nin cart?}
    L -->|Yes| M[Update quantity\nmin of max allowed]
    L -->|No| N[Create cart item\nwith priceSnapshot]
    M & N --> O[Transaction commits]
    O --> P[Return updated cart]
    P --> Q[Show Added to cart!]
    Q --> R[GET /api/v1/products/:id/upsell\ndirect DB · no LLM]
    R --> S{Related products\nfound?}
    S -->|Yes| T[Show Frequently\nbought together strip]
    S -->|No| U([Done])
    T --> U
```

---

## 5. Checkout & Payment Flow

```mermaid
flowchart TD
    A([User says checkout]) --> B[Agent asks\nAbout to charge ₹X\nReply YES to confirm]
    B --> C([User replies YES])
    C --> D{Server-side gate:\npendingCheckoutConfirmations\nhas this session?}
    D -->|No| E[Block · return\nCONFIRMATION_REQUIRED]
    D -->|Yes| F[createCheckout]
    F --> G{Existing pending\ncheckout for this cart?}
    G -->|Yes| H[Return existing\nRazorpay order · idempotent]
    G -->|No| I[validateCartPolicy]
    I --> J{Stock ok?\nPrice drift ok?\nLimits ok?}
    J -->|No| K[Throw POLICY_REJECTED]
    J -->|Yes| L[Razorpay.orders.create\namount in paise]
    L --> M[Save checkout to DB\nwith razorpayOrderId]
    M --> N[Frontend opens\nRazorpay modal]
    N --> O{Payment\noutcome}
    O -->|Success| P[POST /checkout/:id/confirm\nfast path]
    O -->|Tab closed| Q[Razorpay Webhook\nsource of truth]
    P & Q --> R[prisma.\$transaction]
    R --> S[Re-check stock\natomically]
    S --> T{Stock still\navailable?}
    T -->|No| U[Throw STOCK_EXHAUSTED]
    T -->|Yes| V[Decrement stock\nper variant]
    V --> W[Mark checkout paid]
    W --> X[Create Order row]
    X --> Y[Mark cart checked_out]
    Y --> Z[Clear confirmation gate]
    Z --> AA([Order confirmed 🎉])
```

---

## 6. OAuth Flow — Claude Connecting to Urban Store

```mermaid
flowchart TD
    A([Claude wants to\nshop for user]) --> B[GET /.well-known/\noauth-authorization-server]
    B --> C[Discovers:\nauthorize URL\ntoken URL\nscopes]
    C --> D[Redirect user to\nGET /oauth/authorize\nclient_id=claude]
    D --> E{User logged\ninto Urban Store?}
    E -->|No| F[Redirect to /login\nwith returnTo param]
    F --> G[User logs in] --> D
    E -->|Yes| H[Show consent page\nWhat Claude wants access to]
    H --> I{User clicks\nAllow or Deny?}
    I -->|Deny| J[POST /oauth/authorize/deny\nReturn access_denied]
    I -->|Allow| K[POST /oauth/authorize/approve\nCreate auth code · 10min TTL]
    K --> L[Redirect to\nclaude.ai/api/mcp/auth_callback\nwith code]
    L --> M[POST /oauth/token\nexchange code for tokens]
    M --> N[Return access_token\n+ refresh_token]
    N --> O[Claude stores tokens]
    O --> P[POST /mcp\nAuthorization: Bearer access_token]
    P --> Q{Token valid\nand not expired?}
    Q -->|No| R[401 · Claude refreshes\nor re-auths]
    Q -->|Yes| S[MCP tools available:\nsearch_catalog\nget_cart\nadd_to_cart\ncreate_checkout\nget_orders]
    S --> T([Claude can shop\non behalf of user])
```

---

## 7. Admin Dashboard Flow

```mermaid
flowchart TD
    A([Admin opens\n/admin]) --> B[GET /auth/me\ncheck logged in]
    B --> C{Authenticated?}
    C -->|No| D[Redirect to /login]
    C -->|Yes| E[GET /api/v1/admin/dashboard]
    E --> F{requireAdmin\nmiddleware}
    F --> G{ADMIN_OPEN=true\nor isAdmin=true?}
    G -->|No| H[403 Admin access required]
    G -->|Yes| I[getDashboardSnapshot\nall queries in parallel]
    I --> J[getRevenueStats\nlast 30 days orders]
    I --> K[getTopSellingProducts\nranked by units sold]
    I --> L[getSlowMovingProducts\nsellThrough < 20%]
    I --> M[getCartAbandonmentStats\nactive vs checked_out]
    I --> N[getStockHealth\nvariant availability ratio]
    I --> O[getUserActivityStats\ngroq calls · orders · payments]
    J & K & L & M & N & O --> P[Return dashboard data]
    P --> Q[Render KPI cards\nRevenue chart\nTop selling\nSlow moving\nLow stock alerts]

    Q --> R{Admin clicks\nGenerate Campaigns?}
    R -->|Yes| S[POST /admin/campaigns/generate]
    S --> T[Groq AI analyses\nslow moving inventory]
    T --> U[Returns campaign suggestions\nCLEARANCE · BUNDLE · URGENCY]
    U --> V{Admin approves\nor dismisses?}
    V -->|Approve| W[Campaign goes live\non storefront]
    V -->|Dismiss| X[Campaign archived]
```

---

## 8. Data Flow — Product Search to Order

```mermaid
flowchart LR
    A[urban_store_catalog.json\n504 products] -->|npm run seed\nbulk upsert 50 at a time| B[(Supabase DB\nproducts + variants)]

    B -->|keyword search\nPrisma findMany| C[Search Results]
    C -->|formatProduct\nprice · image · availability| D[Product Cards\nin frontend]

    D -->|user adds to cart\n$transaction| E[(cart_items\nwith priceSnapshot)]

    E -->|policy check\nRazorpay create| F[Checkout\n+ razorpayOrderId]

    F -->|payment success\n$transaction| G[(orders\nitemsJson snapshot)]

    G -->|getDashboardSnapshot| H[Admin Analytics\nRevenue · Top selling\nSlow moving]
```

---

## 9. Track 01 — Overall System Architecture (AI Buyer + Revenue Growth)

> **Scope:** All major layers: clients, frontend, identity/rate edge, backend route groups, service layer, and persistence. Shows how 3 AI-buyer identity paths (OAuth PKCE / API key / session) merge into a single enforcement model; how 6 route groups funnel into 8 core services; and how Razorpay + Groq + local embeddings connect as external APIs.

```mermaid
flowchart TD
    subgraph CLIENTS["👤 AI & Human Clients"]
        direction LR
        U[Browser User 💻]
        C[Claude AI 🧠]
        CH[In-App Agent Chat 💬]
        A[Admin 🛒]
    end

    subgraph FRONTEND["🖥️ Next.js Frontend · App Router · Vercel"]
        direction TB
        SP[Storefront Page<br/>/ · /product/:id]
        AIP[AI Chat Panel<br/>AIPanel.tsx]
        CART[Cart + Checkout<br/>/cart · /pay/:id]
        ADM[Admin Dashboard<br/>/admin · /admin/campaigns]
        AUD[Audit Trail Page<br/>/audit]
        CONN[Connect Page /connect<br/>MCP URL + API key]
        OAUTH[OAuth Consent<br/>/oauth/authorize]
    end

    subgraph EDGE["🔐 Identity & Rate Edge"]
        direction TB
        RL[Rate Limit Buckets<br/>Checkout=10/min · MCP=30/grant]
        AUTH["3-Way Identity Merge<br/>① Session Cookie<br/>② OAuth Bearer (PKCE)<br/>③ API Key (us_live_)"]
    end

    subgraph BACKEND["⚙️ Fastify Backend · 15 Route Groups"]
        direction TB
        CAT[Catalog Routes<br/>Semantic search · product detail]
        CRT[Cart Routes<br/>Add · Update · Remove]
        CHK[Checkout Routes<br/>Create · Confirm]
        ORD[Order Routes<br/>History · Cancel]
        AGT[Agent Routes<br/>Groq chat · reasoning trace]
        MCP[MCP Server /mcp<br/>9 tools for Claude]
        OA[OAuth Routes + Well-Known<br/>Authorize · Token · Discovery]
        ADMR[Admin Routes<br/>Campaigns · Performance]
        WH[Webhook Routes<br/>Razorpay HMAC verify]
        DISCO[Protocol Discovery<br/>/.well-known/*]
    end

    subgraph SERVICES["🧠 Service Layer · Core Logic"]
        direction TB
        CSVCAT[Catalog Service<br/>pgvector + keyword search]
        CSVCRT[Cart Service<br/>priceSnapshot enforce]
        CSVCHK[Checkout Service<br/>Razorpay + atomic stock]
        CSVAGT[Agent Service<br/>Groq + ExplainBlock]
        CSVCAM[Campaign Service<br/>4-rule margin · write-back]
        CSVPO[Policy Service<br/>Cart policy decisions]
        CSVAUD[Audit Service<br/>per-grant + per-action]
        CSVANA[Analytics Service<br/>Revenue · velocity · abandonment]
    end

    subgraph DATA["🗄️ Persistence & External APIs"]
        direction TB
        DB[(Supabase PostgreSQL<br/>pgvector · Prisma ORM)]
        EMB[Xenova all-MiniLM-L6-v2<br/>Local embeddings]
        GROQ[Groq AI API<br/>Llama 3.3 70B Versatile]
        RP[Razorpay API<br/>Orders · Payment Webhooks]
    end

    %% Client -> Frontend
    U --> SP & CART & AUD
    CH --> AIP
    A --> ADM
    C -->|MCP Streamable HTTP| MCP

    %% Frontend -> Edge
    SP & AIP & CART & ADM & AUD & CONN & OAUTH -->|HTTPS + Bearer| AUTH

    %% Edge -> Backend routes
    AUTH --> RL
    RL --> CAT & CRT & CHK & ORD & AGT & OA & ADMR & WH & DISCO
    RL --> MCP

    %% Backend -> Services
    CAT --> CSVCAT
    CRT --> CSVCRT
    CHK --> CSVCHK & CSVPO
    ORD --> CSVCHK
    AGT --> CSVAGT & CSVCAT & CSVCRT & CSVCHK
    MCP --> CSVCAT & CSVCRT & CSVCHK
    ADMR --> CSVCAM & CSVANA
    WH --> CSVCHK

    %% Services -> Data
    CSVCAT --> DB & EMB
    CSVCRT --> DB
    CSVCHK --> DB & RP
    CSVAGT --> GROQ & DB
    CSVCAM --> GROQ & DB & CSVANA
    CSVPO --> DB
    CSVAUD --> DB
    CSVANA --> DB

    style CLIENTS fill:#0f172a,stroke:#25345c,color:#e4ecff
    style FRONTEND fill:#0e1d3a,stroke:#334155,color:#e4ecff
    style EDGE fill:#1a0f2e,stroke:#581c87,color:#e4ecff
    style BACKEND fill:#0f1b2d,stroke:#1e3a5f,color:#e4ecff
    style SERVICES fill:#111827,stroke:#25345c,color:#e4ecff
    style DATA fill:#131827,stroke:#4b5563,color:#e4ecff
```

---

## 10. MCP YES-Gate Checkout (Server-Enforced Nonce Flow)

> **Scope:** Sequence diagram of the 3-step MCP money gate. Critical because the security boundary lives in code: Claude cannot fabricate the nonce, the nonce auto-invalidates on cart-change, and 5 failure modes are all explicit server-side reasons. Also shows the policy + Razorpay sub-paths after the gate passes.

```mermaid
sequenceDiagram
    actor C as Claude AI
    participant MCP as POST /mcp<br/>MCP Server
    participant G as YES Gate<br/>Nonce Store
    participant SRV as Checkout Service
    participant RP as Razorpay API
    actor U as End User 💬

    Note over C,RP: Step 1 — Prepare (cart must be known)
    C->>MCP: get_cart()
    MCP-->>C: items[] + subtotal(₹2999) + itemCount(1)

    Note over C,RP: Step 2 — Request confirmation nonce (SERVER ISSUES)
    C->>MCP: request_checkout_confirmation()
    MCP->>G: issueNonce(userA, 2999, 1)
    G-->>MCP: nonce=abc123… TTL=2min
    MCP-->>C: { confirmationNonce, summary:{subtotal, items} }

    Note over C,U: Step 3 — EXPLICIT YES from user (HUMAN IN LOOP)
    C->>U: To confirm ₹2,999 for 1 item, reply YES.
    U-->>C: YES

    Note over C,RP: Step 4 — Create checkout (NONCE REQUIRED server-side)
    C->>MCP: create_checkout(confirmationNonce="abc123…")
    MCP->>G: consumeNonce("abc123", userA, 2999)
    alt Nonce valid & unused & amount match
        G-->>MCP: ok:true
        MCP->>SRV: createCheckout(userA)
        SRV->>SRV: validateCartPolicy() (stock, drift, qty)
        alt Policy ok
            SRV->>RP: orders.create(amount=299900 paise)
            RP-->>SRV: razorpayOrderId=order_xxx
            SRV-->>MCP: { checkoutId, razorpayOrderId, paymentUrl }
            MCP-->>C: success + paymentUrl
        else Policy blocked
            SRV-->>MCP: POLICY_REJECTED (issues[])
            MCP-->>C: error (explainable to user)
        end
    else Nonce invalid
        G-->>MCP: ok:false, reason:
        MCP-->>C: GATE_CONFIRMATION_REQUIRED
        Note right of MCP: Reasons:<br/>• UNKNOWN (never issued)<br/>• REUSED (already consumed)<br/>• EXPIRED (>2 min)<br/>• WRONG_USER<br/>• AMOUNT_MISMATCH (cart changed)
    end
```

---

## 11. Campaign Revenue-Growth Closed Loop

> **Scope:** Data → AI propose → 4-rule margin check → 2nd deep-check → price write → customers buy → actuals measured → write-back → verdict (ahead/on_track/behind) → aggregate accuracy. Explicitly shows the "close the loop" part most AI marketing demos skip.

```mermaid
flowchart TD
    A[Admin triggers /campaigns/generate] --> B[Pull real store data]
    B --> B1[slowMovingProducts · sellThrough %]
    B --> B2[productVelocity · units sold · revenue]
    B --> B3[cartAbandonment · rate · valueAtRisk]
    B --> B4[stockHealth · lowStockAlerts]
    B --> B5[revenueStats · 30 day AOV]
    B1 & B2 & B3 & B4 & B5 --> C[Groq with strict rules prompt]
    C --> D[Parsed JSON campaigns · 3-5 proposals]
    D --> E[Campaign rows · status=pending]

    E --> F{Admin action}
    F -->|Dismiss| G[status=dismissed]
    F -->|Approve| H[validateCampaignPricing<br/>4 rules PRE-CHECK]

    H --> I{Pass all 4 rules?}
    I -->|No · e.g. MIN_EFFECTIVE_MARGIN_5_PCT| J[Throw CAMPAIGN_MARGIN_POLICY<br/>show specific rule + ₹numbers]
    I -->|Yes| K[executeCampaignAction<br/>DEEP-CHECK per variant]

    K --> L{Per-variant deep-check ok?}
    L -->|No| M[auditLog campaign_policy_rejected<br/>ABORT price mutation]
    L -->|Yes| N[Update variant.priceAmount · write _originalPrices snapshot · update active cart priceSnapshots]
    N --> O[status=active · expiresAt=+7d]

    O --> P[Storefront renders campaign]
    P --> Q[Customers buy · Order rows created]
    Q --> R{Lazy 1h refresh on admin view<br/>OR Campaign expired}
    R --> S[persistCampaignOutcomes]

    S --> S1[Read projected.{units, revenue, netGain}]
    S --> S2[Sum actuals from Order.itemsJson<br/>scoped to productId + approvedAt window]
    S1 & S2 --> T[Compute: deltaRevenue · deltaUnits · projectionAccuracy 0..1]
    T --> U[Write actualResults + projectionAccuracy + lastMeasuredAt to Campaign row]
    U --> V[Build performance card]
    V --> W{Verdict}
    W -->|≥+15% delta| X[ahead · extend 2-3 days]
    W -->|±15%| Y[on_track · continue to day 5]
    W -->|<-15%| Z[behind · investigate discount depth / trigger / season]
    W -->|<1 day active| AA[insufficient_data · check tomorrow]

    X & Y & Z --> AB[getCampaignProjectionSummary · aggregate accuracy 0..1 for ALL campaigns]
    Z -->|Dismiss & replace| F

    style A fill:#0ea5e9,stroke:#0369a1,color:#fff
    style C fill:#a78bfa,stroke:#7c3aed,color:#fff
    style H fill:#f59e0b,stroke:#b45309,color:#fff
    style K fill:#f59e0b,stroke:#b45309,color:#fff
    style S fill:#22d3ee,stroke:#0891b2,color:#fff
    style W fill:#10b981,stroke:#047857,color:#fff
```

---

## 12. Atomic Checkout + Stock Rollback (Graceful Failure)

> **Scope:** Sequence diagram of the concurrent-checkout failure case. Variant A has stock=10, Variant B has stock=2. User buys A×5 + B×3. A's decrement succeeds inside the `$transaction`, then B exhausts. **Everything rolls back — A is restored to 10, no partial writes, no oversell.** Also shows the happy path and signature/HMAC branch.

```mermaid
sequenceDiagram
    actor U as User / Webhook
    participant CHK as confirmCheckout()
    participant TX as Prisma $transaction
    participant DB as Postgres

    Note over U,DB: Case: Variant A qty=10, Variant B qty=2. User buys A×5 + B×3.

    U->>CHK: confirmCheckout(checkoutId, razorpaySig)
    CHK->>CHK: Verify Razorpay HMAC-SHA256 signature
    alt Signature invalid
        CHK-->>U: INVALID_SIGNATURE + auditLog signature_mismatch
    end

    CHK->>TX: BEGIN TRANSACTION
    Note over TX,DB: Loop items atomically
    TX->>DB: SELECT quantityAvailable FROM variant A (sku_A)
    DB-->>TX: qty_A = 10 ≥ required 5 ✓
    TX->>DB: UPDATE variant A SET qty = 10-5=5 · status=in_stock

    TX->>DB: SELECT quantityAvailable FROM variant B (sku_B)
    DB-->>TX: qty_B = 2 < required 3 ❌
    Note over TX,DB: 💥 MID-LOOP FAILURE — trigger THROW
    TX-->>CHK: throw STOCK_EXHAUSTED:sku_B
    CHK->>TX: ROLLBACK  ← A's 10→5 change fully reversed!
    CHK-->>U: STOCK_EXHAUSTED:sku_B (clean error · ZERO partial writes)

    Note over U,DB: Happy path — everything in stock
    CHK->>TX: BEGIN (retry with realistic qty)
    TX->>DB: decrement A qty ✓
    TX->>DB: decrement B qty=2 (realistic) ✓
    TX->>DB: UPDATE checkout SET status=paid, razorpayPaymentId=…
    TX->>DB: INSERT order (itemsJson snapshot, total)
    TX->>DB: UPDATE cart SET status=checked_out
    TX-->>CHK: COMMIT all 5 writes atomically
    CHK-->>U: orderId + status + total
    CHK->>AUD: auditLog checkout.confirmed
```

---

## 13. AI-Buyer Identity — 3 Paths to Audit-Ready Enforcement

> **Scope:** How all 3 AI-buyer identity paths (OAuth PKCE for Claude, personal API key `us_live_`, session cookie for in-app) resolve into a single user+grant identity, then feed 3 downstream enforcement points: AuditLog agentGrantId, rate-limiting keyed by grant-id, and the YES-nonce bound to userId.

```mermaid
flowchart LR
    subgraph PATHS["3 AI-Buyer Identity Paths"]
        direction LR
        P1[1. OAuth 2.0 + PKCE<br/>Claude Desktop flow]
        P2[2. Personal API Key<br/>us_live_ prefix · MCP URL]
        P3[3. Session Cookie<br/>In-app chat]
    end

    subgraph RESOLVER["Identity Resolver (MCP + Agent)"]
        R1["Bearer token?<br/>validateAccessToken(oauth)"]
        R2["X-Api-Key header<br/>or ?key= query"]
        R3["Signed cookie"]
    end

    subgraph SCOPED["Scoped Per-Agent Access"]
        G[OAuthGrant row · id · scopes[] · expiresAt]
        U[User row · id · isAdmin]
    end

    subgraph ENFORCED["Every Request Enforced"]
        AUD[AuditLog.agentGrantId → G.id]
        RL[Rate limit keyed by grantId]
        YG[YES nonce bound to userId]
    end

    P1 --> R1
    P2 --> R2
    P3 --> R3
    R1 --> G & U
    R2 --> U
    R3 --> U
    U --> AUD & RL & YG
    G --> AUD & RL

    style PATHS fill:#0f172a,stroke:#25345c,color:#e4ecff
    style RESOLVER fill:#1a0f2e,stroke:#581c87,color:#e4ecff
    style SCOPED fill:#0e1d3a,stroke:#334155,color:#e4ecff
    style ENFORCED fill:#111827,stroke:#25345c,color:#e4ecff
```

---

## 14. Campaign Margin Floor — 4 Rules × 2 Enforcement Points

> **Scope:** The 4 sequential margin rules (URGENCY badge-only, no price increases, max 70% discount, min 5% effective margin). Then the critical "defense-in-depth" pattern: same 4-rule validator runs at approve-time AND again immediately inside the price-update loop (against each individual variant, not just the first). If the deep-check fires, the mutation is aborted and a policy_rejected audit event is written.

```mermaid
flowchart TD
    IN[Campaign proposal arrives] --> C0[For product's first variant]
    C0 --> P1[Rule 1: URGENCY type<br/>MUST NOT carry discountPercent?]
    P1 -->|Violation| R1[❌ URGENCY_MUST_NOT_SET_PRICE<br/>URGENCY is badge-only psychology]
    P1 -->|OK| P2[Rule 2: finalPrice <= basePrice?]
    P2 -->|finalPrice > basePrice| R2[❌ PRICE_INCREASE_NOT_ALLOWED<br/>Campaigns only decrease]
    P2 -->|OK| P3[Rule 3: finalPrice >= basePrice × 0.30?]
    P3 -->|Below 30% of base| R3[❌ MAX_DISCOUNT_70_PCT<br/>No steeper than 70% off]
    P3 -->|OK| P4[Rule 4: finalPrice >= costPrice × 1.05?<br/>cost = base × 0.65 (industry heuristic)]
    P4 -->|Below 5% effective margin| R4[❌ MIN_EFFECTIVE_MARGIN_5_PCT<br/>Specific ₹ amount quoted]
    P4 -->|OK| PASS[✅ All 4 rules pass<br/>→ proceed to action]

    PASS --> ENFORCE["⚠️ Defense-in-depth pattern"]
    ENFORCE --> POINT1["✅ enforcePoint #1<br/>approveCampaign() BEFORE activating"]
    ENFORCE --> POINT2["✅ enforcePoint #2<br/>executeCampaignAction() loop<br/>IMMEDIATELY BEFORE<br/>ProductVariant.update(priceAmount)"]

    POINT2 --> FAIL{Deep check fails?}
    FAIL -->|Yes · race / bypassed / price-changed-between| AL[auditLog campaign_policy_rejected<br/>ABORT · no prices mutated<br/>Nullify originalPrices so expiry doesn't corrupt]
    FAIL -->|No| WR[Write new price · record _originalPrices snapshot for revert]

    style P1 fill:#f59e0b,stroke:#b45309,color:#fff
    style P2 fill:#f59e0b,stroke:#b45309,color:#fff
    style P3 fill:#f59e0b,stroke:#b45309,color:#fff
    style P4 fill:#f59e0b,stroke:#b45309,color:#fff
    style ENFORCE fill:#ef4444,stroke:#b91c1c,color:#fff
    style PASS fill:#10b981,stroke:#047857,color:#fff
    style WR fill:#22c55e,stroke:#15803d,color:#fff
    style AL fill:#ef4444,stroke:#991b1b,color:#fff
```

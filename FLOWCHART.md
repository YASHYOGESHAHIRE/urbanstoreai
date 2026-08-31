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

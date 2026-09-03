import { FastifyInstance } from "fastify";
import crypto from "crypto";

export async function protocolDiscoveryRoutes(app: FastifyInstance) {

  app.get("/.well-known/agent-commerce", async (_request, reply) => {
    return reply.send({
      schemaVersion: "1.0",
      merchant: {
        name: "Urban Store",
        logoUrl: "/favicon.ico",
      },
      capabilities: {
        checkout: {
          create: "/api/v1/checkout",
          update: "PATCH /api/v1/cart/items/:id",
          complete: "/api/v1/checkout/:id/confirm",
          cancel: "/api/v1/orders/:id/cancel",
        },
        implementedMandateShapes: ["intent (confirmation-gate)", "cart (snapshot)", "payment (Razorpay flow)"],
        paymentRails: ["razorpay_upi", "razorpay_card", "razorpay_netbanking"],
        oauthMetadata: "/.well-known/oauth-authorization-server",
      },
      primitives: {
        spendingBounds: "/.well-known/spending-mandate",
        serverSideConfirmationGate: true,
        auditPerGrantId: true,
        atomicStockDecrement: true,
      },
      negotiationEndpoint: "/api/v1/merchant-agent/negotiate",
      note:
        "Declares implemented merchant primitives. Not a claim of interoperability with any specific protocol version; see PROTOCOL_ALIGNMENT.md Deliberate non-claims section.",
    });
  });

  app.get("/.well-known/spending-mandate", async (_request, reply) => {
    const secret = process.env.MANDATE_SECRET || process.env.JWT_SECRET || "urban-store-dev-secret";
    const keyFingerprint = crypto
      .createHash("sha256")
      .update(secret)
      .digest("base64");

    return reply.send({
      schemaVersion: "1.0",
      scope: "merchant-internal",
      description:
        "Urban Store implements server-enforced spending bounds (scoped budgets + per-order caps) as database-first primitives. Signature validation below uses HS256 HMAC symmetrically for confirm-flow authenticity checks; it is NOT a third-party-verifiable credential (that would require asymmetric keys).",
      supportedScopes: ["CATEGORY", "SUB_CATEGORY", "PRODUCT", "ALL"],
      verificationEndpoint: "/api/v1/mandates/verify",
      signatureAlgorithm: "HS256 (HMAC-SHA256, symmetric — merchant-side only)",
      keyFingerprint,
      databaseModel: "SpendingMandate (see Prisma schema)",
      note:
        "For the semantic alignment of this primitive with emerging agent-commerce protocols, see PROTOCOL_ALIGNMENT.md §1 (scoped delegated authority) and the Deliberate non-claims section.",
    });
  });

  app.get("/.well-known/ucp-catalog", async (_request, reply) => {
    return reply.send({
      protocol: "ucp-v1",
      merchantId: "urban_store",
      semanticSearchEndpoint: "/api/v1/catalog/search",
      productSchema: "/schema/Product",
      categoriesEndpoint: "/api/v1/catalog/categories",
      productFeedUrl: "/feeds/catalog.json",
      embeddingModel: "Xenova/all-MiniLM-L6-v2 (vector 384 dim, pgvector cosine)",
    });
  });

  app.get("/.well-known/ai-plugin", async (_request, reply) => {
    return reply.send({
      schema_version: "v1",
      name_for_model: "urban_store",
      name_for_human: "Urban Store",
      description_for_model: "Help users buy urban lifestyle products. Supports: search products, manage cart, checkout with confirmation gate, campaign pricing, AI upsells. REQUIRES user confirmation before any money action.",
      description_for_human: "Urban fashion & lifestyle store powered by AI commerce agents.",
      auth: {
        type: "oauth",
        client_url: "/oauth/authorize",
        scope: "profile cart:read cart:write orders:read checkout",
        authorization_url: "/oauth/authorize",
        authorization_content_type: "application/x-www-form-urlencoded",
        verification_tokens: {
          openai: process.env.OPENAI_VERIFICATION_TOKEN || "verify_urban_dev",
        },
      },
      api: {
        type: "openapi",
        url: "/openapi.json",
        has_user_authentication: true,
      },
      logo_url: "/favicon.ico",
      contact_email: "support@urbanstore.example",
      legal_info_url: "/legal",
    });
  });
}

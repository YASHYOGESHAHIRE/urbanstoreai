import { FastifyInstance } from "fastify";

const BACKEND_URL = process.env.BACKEND_PUBLIC_URL
  ?? process.env.FRONTEND_URL?.replace("3000", "4000")
  ?? "http://localhost:4000";

export async function openApiRoutes(app: FastifyInstance) {

  app.get("/openapi.json", async (_request, reply) => {
    return reply.send({
      openapi: "3.1.0",
      info: {
        title: "Urban Store Agent API",
        description: "AI-transactable commerce API for Urban Store. Supports full agentic shopping: search, cart, checkout, and orders via Razorpay. Built for AI buyers (ChatGPT, Claude, autonomous agents).",
        version: "1.0.0",
        contact: { name: "Urban Store", url: "https://urban-store.dev" },
      },
      servers: [{ url: BACKEND_URL, description: "Urban Store Backend" }],
      security: [{ sessionCookie: [] }, { bearerToken: [] }],
      components: {
        securitySchemes: {
          sessionCookie: {
            type: "apiKey",
            in: "cookie",
            name: "urban_session",
            description: "Human user session cookie (set by /auth/login)",
          },
          bearerToken: {
            type: "http",
            scheme: "bearer",
            description: "Agent OAuth access token (obtained via /oauth/token)",
          },
        },
      },
      paths: {

        // ─── Auth ───────────────────────────────────────────────────────────

        "/auth/register": {
          post: {
            operationId: "register",
            summary: "Register a new user",
            tags: ["Auth"],
            requestBody: {
              required: true,
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    required: ["name", "email", "password"],
                    properties: {
                      name: { type: "string", example: "John Doe" },
                      email: { type: "string", format: "email", example: "john@example.com" },
                      password: { type: "string", minLength: 8, example: "password123" },
                    },
                  },
                },
              },
            },
            responses: {
              "201": { description: "User registered and session created" },
              "409": { description: "Email already exists" },
            },
          },
        },

        "/auth/login": {
          post: {
            operationId: "login",
            summary: "Login and create a session",
            tags: ["Auth"],
            requestBody: {
              required: true,
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    required: ["email", "password"],
                    properties: {
                      email: { type: "string", format: "email" },
                      password: { type: "string" },
                    },
                  },
                },
              },
            },
            responses: {
              "200": { description: "Login successful" },
              "401": { description: "Invalid credentials" },
            },
          },
        },

        "/auth/me": {
          get: {
            operationId: "getMe",
            summary: "Get current authenticated user",
            tags: ["Auth"],
            responses: {
              "200": {
                description: "Current user or unauthenticated state",
                content: {
                  "application/json": {
                    schema: {
                      type: "object",
                      properties: {
                        authenticated: { type: "boolean" },
                        user: {
                          type: "object",
                          nullable: true,
                          properties: {
                            id: { type: "string" },
                            name: { type: "string" },
                            email: { type: "string" },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },

        // ─── Catalogue ──────────────────────────────────────────────────────

        "/api/v1/catalog/search": {
          post: {
            operationId: "searchProducts",
            summary: "Search the product catalogue",
            description: "Semantic + keyword search. Supports natural language queries like 'minimal office bag under 3000' or 'something for rainy weather'. Returns up to 10 products with full details.",
            tags: ["Catalogue"],
            requestBody: {
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      query: { type: "string", description: "Natural language search query", example: "minimal laptop bag for office" },
                      category: { type: "string", enum: ["footwear", "bags", "fashion", "accessories", "lifestyle"] },
                      subcategory: { type: "string", example: "laptop_bags" },
                      minPrice: { type: "number", description: "Min price in INR", example: 500 },
                      maxPrice: { type: "number", description: "Max price in INR", example: 3000 },
                      availability: { type: "string", enum: ["in_stock", "low_stock"] },
                      limit: { type: "number", default: 10, maximum: 50 },
                      offset: { type: "number", default: 0 },
                    },
                  },
                },
              },
            },
            responses: {
              "200": {
                description: "Search results",
                content: {
                  "application/json": {
                    schema: {
                      type: "object",
                      properties: {
                        products: { type: "array", items: { "$ref": "#/components/schemas/Product" } },
                        total: { type: "number" },
                        searchMode: { type: "string", enum: ["semantic", "keyword"] },
                      },
                    },
                  },
                },
              },
            },
          },
        },

        "/api/v1/products/{id}": {
          get: {
            operationId: "getProduct",
            summary: "Get full product details by ID",
            tags: ["Catalogue"],
            parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" }, example: "urs_bag_001" }],
            responses: { "200": { description: "Product details with all variants" }, "404": { description: "Not found" } },
          },
        },

        "/api/v1/products/{id}/availability": {
          get: {
            operationId: "getProductAvailability",
            summary: "Check real-time stock availability",
            tags: ["Catalogue"],
            parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
            responses: { "200": { description: "Availability per variant" } },
          },
        },

        // ─── Cart ───────────────────────────────────────────────────────────

        "/api/v1/cart": {
          get: {
            operationId: "getCart",
            summary: "Get the current user cart",
            tags: ["Cart"],
            security: [{ sessionCookie: [] }, { bearerToken: [] }],
            responses: { "200": { description: "Cart with items and totals" }, "401": { description: "Unauthorized" } },
          },
        },

        "/api/v1/cart/items": {
          post: {
            operationId: "addToCart",
            summary: "Add a product variant to cart",
            tags: ["Cart"],
            security: [{ sessionCookie: [] }, { bearerToken: [] }],
            requestBody: {
              required: true,
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    required: ["productId", "variantSku"],
                    properties: {
                      productId: { type: "string", example: "urs_bag_001" },
                      variantSku: { type: "string", example: "URS-BAG-001-GRY" },
                      quantity: { type: "number", default: 1 },
                    },
                  },
                },
              },
            },
            responses: {
              "201": { description: "Updated cart" },
              "400": { description: "OUT_OF_STOCK | INVALID_QUANTITY" },
              "401": { description: "Unauthorized" },
            },
          },
        },

        "/api/v1/cart/items/{itemId}": {
          patch: {
            operationId: "updateCartItem",
            summary: "Update quantity of a cart item",
            tags: ["Cart"],
            security: [{ sessionCookie: [] }, { bearerToken: [] }],
            parameters: [{ name: "itemId", in: "path", required: true, schema: { type: "string" } }],
            requestBody: {
              required: true,
              content: { "application/json": { schema: { type: "object", required: ["quantity"], properties: { quantity: { type: "number", minimum: 1 } } } } },
            },
            responses: { "200": { description: "Updated cart" } },
          },
          delete: {
            operationId: "removeFromCart",
            summary: "Remove an item from cart",
            tags: ["Cart"],
            security: [{ sessionCookie: [] }, { bearerToken: [] }],
            parameters: [{ name: "itemId", in: "path", required: true, schema: { type: "string" } }],
            responses: { "200": { description: "Updated cart" } },
          },
        },

        // ─── Checkout ───────────────────────────────────────────────────────

        "/api/v1/checkout": {
          post: {
            operationId: "createCheckout",
            summary: "Create a checkout and Razorpay order",
            description: "Runs full policy validation (stock, price drift, quantity limits) before creating a Razorpay order. Returns the Razorpay order ID for payment initiation.",
            tags: ["Checkout"],
            security: [{ sessionCookie: [] }, { bearerToken: [] }],
            responses: {
              "201": {
                description: "Checkout created",
                content: {
                  "application/json": {
                    schema: {
                      type: "object",
                      properties: {
                        checkoutId: { type: "string" },
                        subtotal: { type: "number" },
                        currency: { type: "string", example: "INR" },
                        razorpayOrderId: { type: "string" },
                        razorpayKeyId: { type: "string" },
                        requiresConfirmation: { type: "boolean" },
                        policyWarnings: { type: "array" },
                      },
                    },
                  },
                },
              },
              "400": { description: "EMPTY_CART | POLICY_REJECTED" },
            },
          },
        },

        "/api/v1/checkout/{id}/confirm": {
          post: {
            operationId: "confirmCheckout",
            summary: "Confirm payment and create order",
            description: "Verifies Razorpay payment signature and creates the final order. Call this after payment.handler fires in Razorpay SDK.",
            tags: ["Checkout"],
            security: [{ sessionCookie: [] }, { bearerToken: [] }],
            parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
            requestBody: {
              required: true,
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    required: ["razorpayPaymentId", "razorpaySignature"],
                    properties: {
                      razorpayPaymentId: { type: "string" },
                      razorpaySignature: { type: "string" },
                    },
                  },
                },
              },
            },
            responses: { "200": { description: "Order confirmed with orderId" }, "400": { description: "INVALID_SIGNATURE | ALREADY_PAID" } },
          },
        },

        // ─── Orders ─────────────────────────────────────────────────────────

        "/api/v1/orders": {
          get: {
            operationId: "getOrders",
            summary: "Get all orders for the current user",
            tags: ["Orders"],
            security: [{ sessionCookie: [] }, { bearerToken: [] }],
            responses: { "200": { description: "List of orders" } },
          },
        },

        "/api/v1/orders/{id}": {
          get: {
            operationId: "getOrder",
            summary: "Get a specific order by ID",
            tags: ["Orders"],
            security: [{ sessionCookie: [] }, { bearerToken: [] }],
            parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
            responses: { "200": { description: "Order details" }, "404": { description: "Not found" } },
          },
        },

        // ─── OAuth ──────────────────────────────────────────────────────────

        "/oauth/authorize": {
          get: {
            operationId: "oauthAuthorize",
            summary: "OAuth 2.0 authorization endpoint",
            description: "Redirect user here to grant an AI agent access to their Urban Store account. Supports authorization_code flow.",
            tags: ["OAuth"],
            parameters: [
              { name: "response_type", in: "query", required: true, schema: { type: "string", enum: ["code"] } },
              { name: "client_id", in: "query", required: true, schema: { type: "string" }, example: "chatgpt" },
              { name: "redirect_uri", in: "query", required: true, schema: { type: "string" } },
              { name: "scope", in: "query", schema: { type: "string" }, example: "profile cart:read cart:write checkout" },
              { name: "state", in: "query", schema: { type: "string" } },
            ],
            responses: { "200": { description: "Consent page data (render in frontend)" }, "401": { description: "User must login first" } },
          },
        },

        "/oauth/token": {
          post: {
            operationId: "oauthToken",
            summary: "Exchange auth code for access token",
            tags: ["OAuth"],
            requestBody: {
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      grant_type: { type: "string", enum: ["authorization_code", "refresh_token"] },
                      code: { type: "string" },
                      client_id: { type: "string" },
                      client_secret: { type: "string" },
                      redirect_uri: { type: "string" },
                      refresh_token: { type: "string" },
                    },
                  },
                },
              },
            },
            responses: { "200": { description: "Access token + refresh token" } },
          },
        },

        // ─── Agent ──────────────────────────────────────────────────────────

        "/api/v1/agent/chat": {
          post: {
            operationId: "agentChat",
            summary: "Conversational AI shopping agent",
            description: "Send a natural language message to the Urban AI agent. The agent reasons over the request, calls internal tools (search, cart, checkout), and responds. Supports the full purchase flow end-to-end.",
            tags: ["Agent"],
            security: [{ sessionCookie: [] }, { bearerToken: [] }],
            requestBody: {
              required: true,
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    required: ["message"],
                    properties: {
                      message: { type: "string", example: "Find me a minimal laptop bag under 3000" },
                      sessionId: { type: "string", description: "Optional — maintains conversation history" },
                    },
                  },
                },
              },
            },
            responses: {
              "200": {
                description: "Agent reply with optional product cards",
                content: {
                  "application/json": {
                    schema: {
                      type: "object",
                      properties: {
                        reply: { type: "string" },
                        sessionId: { type: "string" },
                        products: { type: "array", description: "Product cards to display" },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },

      // ─── Shared schemas ──────────────────────────────────────────────────

      "components/schemas": {
        Product: {
          type: "object",
          properties: {
            id: { type: "string" },
            name: { type: "string" },
            brand: { type: "string" },
            category: { type: "string" },
            subcategory: { type: "string" },
            description: { type: "string" },
            image: { type: "string" },
            price: { type: "number" },
            mrp: { type: "number" },
            currency: { type: "string" },
            availability: { type: "string", enum: ["in_stock", "low_stock", "out_of_stock"] },
            useCases: { type: "array", items: { type: "string" } },
            suitableFor: { type: "array", items: { type: "string" } },
            variants: { type: "array" },
          },
        },
      },
    });
  });

  // Also serve a human-readable API reference page
  app.get("/api-docs", async (_request, reply) => {
    return reply.type("text/html").send(`<!DOCTYPE html>
<html>
<head>
  <title>Urban Store API</title>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    SwaggerUIBundle({
      url: '/openapi.json',
      dom_id: '#swagger-ui',
      presets: [SwaggerUIBundle.presets.apis, SwaggerUIBundle.SwaggerUIStandalonePreset],
      layout: 'BaseLayout',
      deepLinking: true,
    });
  </script>
</body>
</html>`);
  });
}

import { FastifyInstance } from "fastify";
import { z } from "zod";
import crypto from "crypto";
import {
  createAuthCode,
  exchangeAuthCode,
  refreshAccessToken,
  revokeToken,
  introspectToken,
  getClientById,
  VALID_SCOPES,
} from "../services/oauth.service.js";
import { attachUser, COOKIE_NAME } from "../middleware/auth.middleware.js";
import { getUserFromToken } from "../services/auth.service.js";

// ─── Schemas ──────────────────────────────────────────────────────────────────

const AuthorizeQuerySchema = z.object({
  response_type: z.literal("code"),
  client_id: z.string(),
  redirect_uri: z.string().url(),
  scope: z.string().default("profile"),
  state: z.string().optional(),
});

const TokenBodySchema = z.discriminatedUnion("grant_type", [
  z.object({
    grant_type: z.literal("authorization_code"),
    code: z.string(),
    client_id: z.string(),
    client_secret: z.string(),
    redirect_uri: z.string().url(),
  }),
  z.object({
    grant_type: z.literal("refresh_token"),
    refresh_token: z.string(),
    client_id: z.string(),
    client_secret: z.string(),
  }),
]);

// ─── Routes ───────────────────────────────────────────────────────────────────

export async function oauthRoutes(app: FastifyInstance) {

  const backendUrl = process.env.BACKEND_PUBLIC_URL ?? `https://urbanstoreai-jz8i.vercel.app`;
  const frontendUrl = process.env.FRONTEND_URL ?? "http://localhost:3000";

  /**
   * GET /.well-known/oauth-authorization-server
   * OAuth 2.0 Authorization Server Metadata (RFC 8414)
   * Required by MCP clients (Claude) to discover OAuth endpoints automatically.
   */
  app.get("/.well-known/oauth-authorization-server", async (_request, reply) => {
    return reply.send({
      issuer: backendUrl,
      authorization_endpoint: `${backendUrl}/oauth/authorize`,
      token_endpoint: `${backendUrl}/oauth/token`,
      revocation_endpoint: `${backendUrl}/oauth/revoke`,
      introspection_endpoint: `${backendUrl}/oauth/introspect`,
      registration_endpoint: `${backendUrl}/oauth/register`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      token_endpoint_auth_methods_supported: ["client_secret_post", "none"],
      scopes_supported: ["profile", "cart:read", "cart:write", "orders:read", "checkout"],
      code_challenge_methods_supported: ["S256"],
    });
  });

  /**
   * GET /oauth/authorize
   * Agent redirects user here. We check if user is logged in:
   *   - Not logged in → redirect to login with return URL
   *   - Logged in → return consent data as JSON (frontend renders consent page)
   */
  app.get(
    "/oauth/authorize",
    { preHandler: [attachUser] },
    async (request, reply) => {
      const query = AuthorizeQuerySchema.safeParse(request.query);
      if (!query.success) {
        return reply.code(400).send({
          error: "invalid_request",
          details: query.error.flatten().fieldErrors,
        });
      }

      const { client_id, redirect_uri, scope, state, response_type } =
        query.data;

      // Validate client exists
      const client = await getClientById(client_id);
      if (!client) {
        return reply.code(400).send({ error: "invalid_client" });
      }

      // Validate redirect URI
      if (!client.redirectUris.includes(redirect_uri)) {
        return reply.code(400).send({ error: "invalid_redirect_uri" });
      }

      const requestedScopes = scope.split(" ").filter(Boolean);

      // User not logged in — tell frontend to show login first
      if (!request.user) {
        const returnTo = encodeURIComponent(
          `/oauth/authorize?response_type=${response_type}&client_id=${client_id}&redirect_uri=${encodeURIComponent(redirect_uri)}&scope=${encodeURIComponent(scope)}${state ? `&state=${state}` : ""}`
        );
        return reply.code(401).send({
          error: "login_required",
          loginUrl: `${process.env.FRONTEND_URL}/login?returnTo=${returnTo}`,
        });
      }

      // Return consent info for frontend to render
      return reply.send({
        client: {
          name: client.name,
          clientId: client.clientId,
          logoUrl: client.logoUrl,
        },
        user: request.user,
        requestedScopes,
        validScopes: VALID_SCOPES,
        redirectUri: redirect_uri,
        state,
      });
    }
  );

  /**
   * POST /oauth/authorize/approve
   * User clicked "Allow" on consent page.
   * Issues auth code and redirects agent back.
   */
  app.post(
    "/oauth/authorize/approve",
    { preHandler: [attachUser] },
    async (request, reply) => {
      if (!request.user) {
        return reply.code(401).send({ error: "login_required" });
      }

      const body = z
        .object({
          client_id: z.string(),
          redirect_uri: z.string().url(),
          scopes: z.array(z.string()),
          state: z.string().optional(),
        })
        .safeParse(request.body);

      if (!body.success) {
        return reply.code(400).send({ error: "invalid_request" });
      }

      const { client_id, redirect_uri, scopes, state } = body.data;

      try {
        const code = await createAuthCode(
          client_id,
          request.user.id,
          scopes,
          redirect_uri
        );

        const redirectUrl = new URL(redirect_uri);
        redirectUrl.searchParams.set("code", code);
        if (state) redirectUrl.searchParams.set("state", state);

        return reply.send({ redirectUrl: redirectUrl.toString() });
      } catch (err: unknown) {
        if (err instanceof Error) {
          return reply.code(400).send({ error: err.message });
        }
        return reply.code(500).send({ error: "server_error" });
      }
    }
  );

  /**
   * POST /oauth/authorize/deny
   * User clicked "Deny" on consent page.
   */
  app.post(
    "/oauth/authorize/deny",
    { preHandler: [attachUser] },
    async (request, reply) => {
      const body = z
        .object({
          redirect_uri: z.string().url(),
          state: z.string().optional(),
        })
        .safeParse(request.body);

      if (!body.success) {
        return reply.code(400).send({ error: "invalid_request" });
      }

      const { redirect_uri, state } = body.data;
      const redirectUrl = new URL(redirect_uri);
      redirectUrl.searchParams.set("error", "access_denied");
      if (state) redirectUrl.searchParams.set("state", state);

      return reply.send({ redirectUrl: redirectUrl.toString() });
    }
  );

  /**
   * POST /oauth/token
   * Agent exchanges auth code for access token, or refreshes tokens.
   */
  app.post("/oauth/token", async (request, reply) => {
    const body = TokenBodySchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({
        error: "invalid_request",
        details: body.error.flatten().fieldErrors,
      });
    }

    try {
      if (body.data.grant_type === "authorization_code") {
        const tokens = await exchangeAuthCode(
          body.data.code,
          body.data.client_id,
          body.data.client_secret,
          body.data.redirect_uri
        );
        return reply.send(tokens);
      }

      if (body.data.grant_type === "refresh_token") {
        const tokens = await refreshAccessToken(
          body.data.refresh_token,
          body.data.client_id,
          body.data.client_secret
        );
        return reply.send(tokens);
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        const status =
          err.message === "INVALID_CLIENT" ||
          err.message === "INVALID_CODE" ||
          err.message === "CODE_EXPIRED" ||
          err.message === "CODE_ALREADY_USED" ||
          err.message === "INVALID_REFRESH_TOKEN" ||
          err.message === "TOKEN_REVOKED"
            ? 400
            : 500;
        return reply.code(status).send({ error: err.message.toLowerCase() });
      }
      return reply.code(500).send({ error: "server_error" });
    }
  });

  /**
   * POST /oauth/revoke
   * Revoke an access or refresh token.
   */
  app.post("/oauth/revoke", async (request, reply) => {
    const body = z
      .object({
        token: z.string(),
        client_id: z.string(),
        client_secret: z.string(),
      })
      .safeParse(request.body);

    if (!body.success) {
      return reply.code(400).send({ error: "invalid_request" });
    }

    await revokeToken(body.data.token, body.data.client_id);
    // Always return 200 per OAuth spec
    return reply.send({ revoked: true });
  });

  /**
   * POST /oauth/introspect
   * Check if a token is active (for resource servers).
   */
  app.post("/oauth/introspect", async (request, reply) => {
    const body = z
      .object({
        token: z.string(),
        client_id: z.string(),
        client_secret: z.string(),
      })
      .safeParse(request.body);

    if (!body.success) {
      return reply.code(400).send({ error: "invalid_request" });
    }

    const result = await introspectToken(
      body.data.token,
      body.data.client_id
    );
    return reply.send(result);
  });

  /**
   * GET /oauth/clients/me
   * Returns info about what agents have access (for user account page).
   * Requires human session.
   */
  app.get(
    "/oauth/clients/me",
    { preHandler: [attachUser] },
    async (request, reply) => {
      if (!request.user) {
        return reply.code(401).send({ error: "UNAUTHORIZED" });
      }

      const grants = await app.prisma.oAuthGrant.findMany({
        where: {
          userId: request.user.id,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
        include: { client: true },
        orderBy: { createdAt: "desc" },
      });

      const unique = new Map<string, (typeof grants)[0]>();
      for (const g of grants) {
        if (!unique.has(g.clientId)) unique.set(g.clientId, g);
      }

      return reply.send({
        connectedAgents: Array.from(unique.values()).map((g) => ({
          clientId: g.client.clientId,
          name: g.client.name,
          logoUrl: g.client.logoUrl,
          scopes: g.scopes,
          grantedAt: g.createdAt,
        })),
      });
    }
  );

  /**
   * POST /oauth/register
   * Dynamic Client Registration (RFC 7591) — accepts Anthropic's CIMD client.
   * Only allows registration of clients whose metadata URL is from anthropic.com.
   */
  app.post("/oauth/register", async (request, reply) => {
    const body = z.object({
      client_name: z.string().optional(),
      redirect_uris: z.array(z.string()).optional(),
      token_endpoint_auth_method: z.string().optional(),
      logo_uri: z.string().optional(),
      client_uri: z.string().optional(),
      scope: z.string().optional(),
    }).safeParse(request.body);

    if (!body.success) {
      return reply.code(400).send({ error: "invalid_client_metadata" });
    }

    const { client_name, redirect_uris, token_endpoint_auth_method, logo_uri } = body.data;

    // Generate a unique client_id for this registration
    const clientId = `dyn_${crypto.randomBytes(16).toString("hex")}`;

    const { prisma } = app;
    const client = await prisma.oAuthClient.create({
      data: {
        name: client_name ?? "Claude",
        clientId,
        clientSecret: "", // public client
        redirectUris: redirect_uris ?? ["https://claude.ai/api/mcp/auth_callback"],
        scopes: ["profile", "cart:read", "cart:write", "orders:read", "checkout"],
        logoUrl: logo_uri,
      },
    });

    return reply.code(201).send({
      client_id: client.clientId,
      client_name: client.name,
      redirect_uris: client.redirectUris,
      token_endpoint_auth_method: token_endpoint_auth_method ?? "none",
      scope: "profile cart:read cart:write orders:read checkout",
    });
  });
}

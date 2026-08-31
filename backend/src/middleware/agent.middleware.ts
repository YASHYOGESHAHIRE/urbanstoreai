import { FastifyRequest, FastifyReply } from "fastify";
import { validateAccessToken, Scope } from "../services/oauth.service.js";

export interface AgentContext {
  user: { id: string; name: string; email: string };
  scopes: Scope[];
  clientName: string;
  grantId: string;
}

declare module "fastify" {
  interface FastifyRequest {
    agent: AgentContext | null;
  }
}

const FRONTEND_URL = process.env.FRONTEND_URL ?? "http://localhost:3000";

export async function attachAgent(
  request: FastifyRequest,
  _reply: FastifyReply
): Promise<void> {
  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    request.agent = null;
    return;
  }
  const token = authHeader.slice(7);
  request.agent = await validateAccessToken(token);
}

export async function requireAgent(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  if (!request.agent) {
    const hasToken = !!request.headers.authorization;
    reply.code(401).send({
      error: hasToken ? "OAUTH_TOKEN_EXPIRED" : "OAUTH_TOKEN_MISSING",
      message: hasToken
        ? "Your OAuth access token has expired. Please reconnect Urban Store."
        : "No OAuth token provided. Please connect Urban Store first.",
      reauthorizeUrl: `${FRONTEND_URL}/connect`,
      hint: "Visit the reauthorizeUrl to reconnect, then retry.",
    });
  }
}

export function requireScope(scope: Scope) {
  return async function (
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    if (!request.agent) {
      reply.code(401).send({
        error: "OAUTH_TOKEN_MISSING",
        message: "No OAuth token provided.",
        reauthorizeUrl: `${FRONTEND_URL}/connect`,
      });
      return;
    }
    if (!request.agent.scopes.includes(scope)) {
      reply.code(403).send({
        error: "INSUFFICIENT_SCOPE",
        message: `This action requires the '${scope}' scope which was not granted.`,
        requiredScope: scope,
        grantedScopes: request.agent.scopes,
        hint: `Reconnect Urban Store and grant the '${scope}' permission.`,
        reauthorizeUrl: `${FRONTEND_URL}/connect`,
      });
    }
  };
}

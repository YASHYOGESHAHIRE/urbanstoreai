import { FastifyRequest, FastifyReply } from "fastify";
import { validateAccessToken, Scope } from "../services/oauth.service.js";

export interface AgentContext {
  user: { id: string; name: string; email: string };
  scopes: Scope[];
  clientName: string;
  grantId: string;
}

// Augment Fastify request
declare module "fastify" {
  interface FastifyRequest {
    agent: AgentContext | null;
  }
}

/**
 * Reads Authorization: Bearer <token> header,
 * validates it, and attaches agent context to request.agent.
 * Never trusts userId from request body.
 */
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

/**
 * Guard — requires a valid agent Bearer token.
 */
export async function requireAgent(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  if (!request.agent) {
    reply.code(401).send({ error: "INVALID_TOKEN" });
  }
}

/**
 * Scope guard factory — requireScope("cart:write")
 */
export function requireScope(scope: Scope) {
  return async function (
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    if (!request.agent) {
      reply.code(401).send({ error: "INVALID_TOKEN" });
      return;
    }
    if (!request.agent.scopes.includes(scope)) {
      reply.code(403).send({
        error: "INSUFFICIENT_SCOPE",
        required: scope,
        granted: request.agent.scopes,
      });
    }
  };
}

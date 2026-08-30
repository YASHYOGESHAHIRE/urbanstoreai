import { FastifyInstance } from "fastify";
import { z } from "zod";
import { attachUser } from "../middleware/auth.middleware.js";
import { attachAgent } from "../middleware/agent.middleware.js";
import { runAgentTurn, ChatMessage, ReasoningStep, AuditEntry, ExplainBlock } from "../services/agent.service.js";

// In-memory session store (replace with Redis for production)
const sessions = new Map<string, ChatMessage[]>();

export async function agentRoutes(app: FastifyInstance) {

  // POST /api/v1/agent/chat
  app.post(
    "/api/v1/agent/chat",
    { preHandler: [attachUser, attachAgent] },
    async (request, reply) => {
      const userId = request.user?.id ?? request.agent?.user.id;
      if (!userId) return reply.code(401).send({ error: "UNAUTHORIZED" });

      const body = z.object({
        message: z.string().min(1).max(2000),
        sessionId: z.string().optional(),
      }).safeParse(request.body);

      if (!body.success) {
        return reply.code(400).send({ error: "VALIDATION_ERROR", details: body.error.flatten().fieldErrors });
      }

      const sessionId = body.data.sessionId ?? `${userId}-default`;
      const history = sessions.get(sessionId) ?? [];

      try {
        const { reply: agentReply, updatedHistory, products, audit, explain } = await runAgentTurn(
          userId,
          body.data.message,
          history,
          request.agent?.grantId
        );

        sessions.set(sessionId, updatedHistory.slice(-20));

        return reply.send({ reply: agentReply, sessionId, products, audit, explain });
      } catch (err: unknown) {
        request.log.error(err, "agent error");
        return reply.code(500).send({ error: "AGENT_ERROR" });
      }
    }
  );

  // POST /api/v1/agent/chat/debug — same as chat but returns full reasoning steps
  app.post(
    "/api/v1/agent/chat/debug",
    { preHandler: [attachUser, attachAgent] },
    async (request, reply) => {
      const userId = request.user?.id ?? request.agent?.user.id;
      if (!userId) return reply.code(401).send({ error: "UNAUTHORIZED" });

      const body = z.object({
        message: z.string().min(1).max(2000),
        sessionId: z.string().optional(),
      }).safeParse(request.body);

      if (!body.success) {
        return reply.code(400).send({ error: "VALIDATION_ERROR" });
      }

      const sessionId = body.data.sessionId ?? `${userId}-debug`;
      const history = sessions.get(sessionId) ?? [];

      try {
        const { reply: agentReply, updatedHistory, reasoning } = await runAgentTurnWithReasoning(
          userId,
          body.data.message,
          history,
          request.agent?.grantId
        );

        sessions.set(sessionId, updatedHistory.slice(-20));

        // Extract products from tool results in reasoning
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let products: any[] = [];
        for (const step of reasoning) {
          if (step.type === "tool_result" && step.toolName === "search_products") {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const r = step.toolResult as any;
            if (r?.products) { products = r.products.slice(0, 5); break; }
          }
          if (step.type === "tool_result" && step.toolName === "get_product") {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const r = step.toolResult as any;
            if (r?.id) { products = [r]; break; }
          }
        }

        return reply.send({ reply: agentReply, sessionId, reasoning, products });
      } catch (err: unknown) {
        request.log.error(err, "agent debug error");
        return reply.code(500).send({ error: "AGENT_ERROR" });
      }
    }
  );

  // DELETE /api/v1/agent/session/:sessionId
  app.delete(
    "/api/v1/agent/session/:sessionId",
    { preHandler: [attachUser] },
    async (request, reply) => {
      const { sessionId } = request.params as { sessionId: string };
      sessions.delete(sessionId);
      return reply.send({ cleared: true });
    }
  );
}

// ─── Import reasoning variant ─────────────────────────────────────────────────
import { runAgentTurnWithReasoning } from "../services/agent.service.js";

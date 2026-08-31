import { FastifyInstance } from "fastify";
import { z } from "zod";
import { attachUser } from "../middleware/auth.middleware.js";
import { attachAgent } from "../middleware/agent.middleware.js";
import { runAgentTurn, ChatMessage, ReasoningStep, AuditEntry, ExplainBlock } from "../services/agent.service.js";

// In-memory session store (replace with Redis for production)
const sessions = new Map<string, ChatMessage[]>();

// ─── Server-side checkout confirmation gate ───────────────────────────────────
// Tracks which sessions have explicitly said YES to a pending checkout.
// This is a code-level guard — the LLM cannot bypass it regardless of prompt.
const pendingCheckoutConfirmations = new Map<string, { amount: number; expiresAt: number }>();

const YES_PATTERNS = /^\s*(yes|confirm|proceed|ok|sure|yep|yeah|go ahead|do it|pay|buy)\s*[.!]?\s*$/i;

function sessionHasConfirmed(sessionId: string): boolean {
  const entry = pendingCheckoutConfirmations.get(sessionId);
  if (!entry) return false;
  if (Date.now() > entry.expiresAt) {
    pendingCheckoutConfirmations.delete(sessionId);
    return false;
  }
  return true;
}

function markCheckoutConfirmed(sessionId: string, amount: number) {
  // Confirmation valid for 5 minutes only
  pendingCheckoutConfirmations.set(sessionId, {
    amount,
    expiresAt: Date.now() + 5 * 60 * 1000,
  });
}

function clearCheckoutConfirmation(sessionId: string) {
  pendingCheckoutConfirmations.delete(sessionId);
}

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
      const userMessage = body.data.message;

      // ── Server-side YES gate ──────────────────────────────────────────────
      // If the last agent message contained a checkout confirmation request
      // AND this message is a YES → mark confirmed so the agent can proceed.
      // The agent tool executor checks this before allowing create_checkout.
      if (YES_PATTERNS.test(userMessage)) {
        const lastMessages = history.slice(-4);
        const agentAskedForConfirm = lastMessages.some(
          (m) => m.role === "assistant" &&
            (m.content.toLowerCase().includes("confirm") ||
             m.content.toLowerCase().includes("reply yes") ||
             m.content.toLowerCase().includes("type yes"))
        );
        if (agentAskedForConfirm) {
          markCheckoutConfirmed(sessionId, 0);
        }
      }

      try {
        const { reply: agentReply, updatedHistory, products, audit, explain } = await runAgentTurn(
          userId,
          userMessage,
          history,
          request.agent?.grantId,
          sessionId,
          (sid) => sessionHasConfirmed(sid),
          (sid) => clearCheckoutConfirmation(sid)
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

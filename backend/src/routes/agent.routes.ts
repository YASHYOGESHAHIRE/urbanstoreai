import { FastifyInstance } from "fastify";
import { z } from "zod";
import { attachUser } from "../middleware/auth.middleware.js";
import { attachAgent } from "../middleware/agent.middleware.js";
import { runAgentTurn, ChatMessage, ReasoningStep, AuditEntry, ExplainBlock } from "../services/agent.service.js";

// In-memory session store (replace with Redis for production)
const sessions = new Map<string, ChatMessage[]>();

// ─── Per-user rate limit — 20 agent calls per minute ─────────────────────────
const userCallCounts = new Map<string, { count: number; windowStart: number }>();
const AGENT_RATE_LIMIT = 20;
const AGENT_RATE_WINDOW = 60_000; // 1 minute

function checkUserRateLimit(userId: string): boolean {
  const now = Date.now();
  const entry = userCallCounts.get(userId);
  if (!entry || now - entry.windowStart > AGENT_RATE_WINDOW) {
    userCallCounts.set(userId, { count: 1, windowStart: now });
    return true; // allowed
  }
  if (entry.count >= AGENT_RATE_LIMIT) return false; // blocked
  entry.count++;
  return true;
}

// ─── Message sanitiser — strip non-printable and control characters ───────────
function sanitiseMessage(raw: string): string {
  return raw
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, "") // control chars
    .replace(/\uFEFF/g, "")   // BOM
    .trim()
    .slice(0, 2000);
}

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
      const userMessage = sanitiseMessage(body.data.message);

      // ── Per-user rate limit ───────────────────────────────────────────────
      if (!checkUserRateLimit(userId)) {
        return reply.code(429).send({ error: "RATE_LIMIT_EXCEEDED", message: "Too many requests. Please wait a moment." });
      }

      // ── Server-side YES gate ──────────────────────────────────────────────
      // Check both the in-memory map AND the conversation history for YES
      // This makes the gate survive Vercel cold starts
      if (YES_PATTERNS.test(userMessage)) {
        const lastMessages = history.slice(-4);
        const agentAskedForConfirm = lastMessages.some(
          (m) => m.role === "assistant" &&
            (m.content.toLowerCase().includes("confirm") ||
             m.content.toLowerCase().includes("reply yes") ||
             m.content.toLowerCase().includes("type yes") ||
             m.content.toLowerCase().includes("₹") && m.content.toLowerCase().includes("proceed"))
        );
        if (agentAskedForConfirm) {
          markCheckoutConfirmed(sessionId, 0);
        }
      }

      // Also check history directly — if last assistant message asked for confirm
      // and current message is YES, allow checkout even if Map was reset
      const isYesAfterConfirmRequest = YES_PATTERNS.test(userMessage) &&
        history.slice(-4).some((m) =>
          m.role === "assistant" &&
          (m.content.toLowerCase().includes("reply yes") ||
           m.content.toLowerCase().includes("confirm") && m.content.includes("₹"))
        );

      try {
        const { reply: agentReply, updatedHistory, products, audit, explain } = await runAgentTurn(
          userId,
          userMessage,
          history,
          request.agent?.grantId,
          sessionId,
          // Gate: confirmed if Map has entry OR history-based YES detection
          (sid) => sessionHasConfirmed(sid) || isYesAfterConfirmRequest,
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

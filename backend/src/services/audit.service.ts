import { prisma } from "../db/prisma.js";

interface AuditEntry {
  userId?: string;
  agentGrantId?: string;
  action: string;
  payload?: object;
  ipAddress?: string;
  userAgent?: string;
}

export async function auditLog(entry: AuditEntry): Promise<void> {
  try {
    // Cap payload to ~1KB to prevent audit table bloat
    const payloadStr = JSON.stringify(entry.payload ?? {});
    const payload = payloadStr.length > 1024
      ? { _truncated: true, preview: payloadStr.slice(0, 900) + "…" }
      : (entry.payload ?? {});

    await prisma.auditLog.create({
      data: {
        userId: entry.userId,
        agentGrantId: entry.agentGrantId,
        action: entry.action,
        payload,
        ipAddress: entry.ipAddress,
        userAgent: entry.userAgent,
      },
    });
  } catch {
    // Never throw from audit — log silently
    console.error("[audit] failed to write:", entry.action);
  }
}

// ─── Read audit logs (for persistent audit trail page) ───────────────────────

export async function getUserAuditLogs(userId: string, limit = 200) {
  const logs = await prisma.auditLog.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    take: limit,
    select: {
      id: true,
      action: true,
      payload: true,
      createdAt: true,
    },
  });
  return logs.map((l) => ({
    id: l.id,
    event: actionToEvent(l.action),
    detail: (l.payload ?? {}) as Record<string, unknown>,
    timestamp: l.createdAt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
    createdAt: l.createdAt,
  }));
}

export async function getAllUsersAuditLogs(limit = 500) {
  const logs = await prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { user: { select: { id: true, name: true, email: true } } },
  });
  return logs.map((l) => ({
    id: l.id,
    user: l.user,
    event: actionToEvent(l.action),
    detail: (l.payload ?? {}) as Record<string, unknown>,
    timestamp: l.createdAt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
    createdAt: l.createdAt,
  }));
}

function actionToEvent(action: string): string {
  const map: Record<string, string> = {
    "agent.message": "USER_REQUEST",
    "cart.add": "CART_ACTION",
    "cart.update": "CART_ACTION",
    "cart.remove": "CART_ACTION",
    "checkout.create": "POLICY",
    "checkout.confirmed": "RAZORPAY",
    "checkout.signature_mismatch": "ERROR",
    "order.cancel": "CART_ACTION",
    "webhook.payment_captured": "RAZORPAY",
    "webhook.payment_failed": "ERROR",
  };
  return map[action] ?? "TOOL_RESULT";
}

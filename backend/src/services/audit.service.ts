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
    await prisma.auditLog.create({
      data: {
        userId: entry.userId,
        agentGrantId: entry.agentGrantId,
        action: entry.action,
        payload: entry.payload ?? {},
        ipAddress: entry.ipAddress,
        userAgent: entry.userAgent,
      },
    });
  } catch {
    // Never throw from audit — log silently
    console.error("[audit] failed to write:", entry.action);
  }
}

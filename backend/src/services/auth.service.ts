import bcrypt from "bcryptjs";
import crypto from "crypto";
import { prisma } from "../db/prisma.js";

// 30-day session lifetime
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface SafeUser {
  id: string;
  name: string;
  email: string;
}

function safeUser(user: { id: string; name: string; email: string }): SafeUser {
  return { id: user.id, name: user.name, email: user.email };
}

// ─── Register ────────────────────────────────────────────────────────────────

export async function registerUser(
  name: string,
  email: string,
  password: string
): Promise<{ user: SafeUser; sessionToken: string }> {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    const err = new Error("EMAIL_ALREADY_EXISTS");
    err.name = "EMAIL_ALREADY_EXISTS";
    throw err;
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const user = await prisma.user.create({
    data: { name, email, passwordHash },
  });

  const session = await prisma.session.create({
    data: {
      userId: user.id,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    },
  });

  return { user: safeUser(user), sessionToken: session.token };
}

// ─── Login ────────────────────────────────────────────────────────────────────

export async function loginUser(
  email: string,
  password: string
): Promise<{ user: SafeUser; sessionToken: string }> {
  // Generic error — never reveal which field failed
  const invalidErr = new Error("INVALID_CREDENTIALS");
  invalidErr.name = "INVALID_CREDENTIALS";

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw invalidErr;

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) throw invalidErr;

  // Rotate session on each login — delete old ones for this user
  await prisma.session.deleteMany({ where: { userId: user.id } });

  const session = await prisma.session.create({
    data: {
      userId: user.id,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    },
  });

  return { user: safeUser(user), sessionToken: session.token };
}

// ─── Logout ───────────────────────────────────────────────────────────────────

export async function logoutSession(token: string): Promise<void> {
  await prisma.session.deleteMany({ where: { token } });
}

// ─── Validate session ─────────────────────────────────────────────────────────

export async function getUserFromToken(
  token: string
): Promise<SafeUser | null> {
  const session = await prisma.session.findUnique({
    where: { token },
    include: { user: true },
  });

  if (!session) return null;
  if (session.expiresAt < new Date()) {
    // Expired — clean up
    await prisma.session.delete({ where: { id: session.id } });
    return null;
  }

  return safeUser(session.user);
}

// ─── API Key ──────────────────────────────────────────────────────────────────

export function generateApiKeyValue(): string {
  // Format: us_live_<32 hex chars> — recognisable, unguessable
  return `us_live_${crypto.randomBytes(24).toString("hex")}`;
}

export async function getOrCreateApiKey(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { apiKey: true },
  });

  if (user?.apiKey) return user.apiKey;

  // Generate and store a new key
  const key = generateApiKeyValue();
  await prisma.user.update({
    where: { id: userId },
    data: { apiKey: key },
  });
  return key;
}

export async function regenerateApiKey(userId: string): Promise<string> {
  const key = generateApiKeyValue();
  await prisma.user.update({
    where: { id: userId },
    data: { apiKey: key },
  });
  return key;
}

export async function getUserByApiKey(
  apiKey: string
): Promise<SafeUser | null> {
  if (!apiKey?.startsWith("us_live_")) return null;
  const user = await prisma.user.findUnique({
    where: { apiKey },
    select: { id: true, name: true, email: true },
  });
  if (!user) return null;
  return safeUser(user);
}

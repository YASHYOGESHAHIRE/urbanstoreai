import argon2 from "argon2";
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

  const passwordHash = await argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 1,
  });

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

  const valid = await argon2.verify(user.passwordHash, password);
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

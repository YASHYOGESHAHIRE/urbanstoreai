import crypto from "crypto";
import argon2 from "argon2";
import { prisma } from "../db/prisma.js";

// Token lifetimes
const AUTH_CODE_TTL_MS = 10 * 60 * 1000;         // 10 minutes
const ACCESS_TOKEN_TTL_MS = 60 * 60 * 1000;       // 1 hour
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// All supported scopes
export const VALID_SCOPES = [
  "profile",      // read user name + email
  "cart:read",    // read cart
  "cart:write",   // add/remove from cart
  "orders:read",  // read order history
  "checkout",     // initiate checkout
] as const;

export type Scope = (typeof VALID_SCOPES)[number];

function generateToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("hex");
}

function validateScopes(requested: string[]): Scope[] {
  return requested.filter((s): s is Scope =>
    VALID_SCOPES.includes(s as Scope)
  );
}

// ─── Client validation ────────────────────────────────────────────────────────

export async function validateClient(
  clientId: string,
  clientSecret: string
): Promise<boolean> {
  const client = await prisma.oAuthClient.findUnique({ where: { clientId } });
  if (!client) return false;
  return argon2.verify(client.clientSecret, clientSecret);
}

export async function getClientById(clientId: string) {
  return prisma.oAuthClient.findUnique({ where: { clientId } });
}

// ─── Authorization code flow ──────────────────────────────────────────────────

export async function createAuthCode(
  clientId: string,
  userId: string,
  requestedScopes: string[],
  redirectUri: string
) {
  const client = await prisma.oAuthClient.findUnique({ where: { clientId } });
  if (!client) throw new Error("CLIENT_NOT_FOUND");

  // Validate redirect URI
  if (!client.redirectUris.includes(redirectUri)) {
    throw new Error("INVALID_REDIRECT_URI");
  }

  // Only grant scopes the client is allowed
  const allowedScopes = validateScopes(
    requestedScopes.filter((s) => client.scopes.includes(s))
  );

  const code = generateToken(24);

  await prisma.oAuthAuthCode.create({
    data: {
      code,
      clientId: client.id,
      userId,
      scopes: allowedScopes,
      redirectUri,
      expiresAt: new Date(Date.now() + AUTH_CODE_TTL_MS),
    },
  });

  return code;
}

// ─── Exchange auth code for tokens ───────────────────────────────────────────

export async function exchangeAuthCode(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string
) {
  const client = await prisma.oAuthClient.findUnique({ where: { clientId } });
  if (!client) throw new Error("INVALID_CLIENT");

  const secretValid = await argon2.verify(client.clientSecret, clientSecret);
  if (!secretValid) throw new Error("INVALID_CLIENT");

  const authCode = await prisma.oAuthAuthCode.findUnique({ where: { code } });
  if (!authCode) throw new Error("INVALID_CODE");
  if (authCode.used) throw new Error("CODE_ALREADY_USED");
  if (authCode.expiresAt < new Date()) throw new Error("CODE_EXPIRED");
  if (authCode.clientId !== client.id) throw new Error("INVALID_CODE");
  if (authCode.redirectUri !== redirectUri) throw new Error("INVALID_REDIRECT_URI");

  // Mark code as used — one-time only
  await prisma.oAuthAuthCode.update({
    where: { id: authCode.id },
    data: { used: true },
  });

  // Issue tokens
  const accessToken = generateToken(32);
  const refreshToken = generateToken(32);

  const grant = await prisma.oAuthGrant.create({
    data: {
      accessToken,
      refreshToken,
      clientId: client.id,
      userId: authCode.userId,
      scopes: authCode.scopes,
      expiresAt: new Date(Date.now() + ACCESS_TOKEN_TTL_MS),
    },
    include: { user: true },
  });

  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    token_type: "Bearer",
    expires_in: ACCESS_TOKEN_TTL_MS / 1000,
    scope: grant.scopes.join(" "),
    user: {
      id: grant.user.id,
      name: grant.user.name,
      email: grant.user.email,
    },
  };
}

// ─── Refresh token ────────────────────────────────────────────────────────────

export async function refreshAccessToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string
) {
  const client = await prisma.oAuthClient.findUnique({ where: { clientId } });
  if (!client) throw new Error("INVALID_CLIENT");

  const secretValid = await argon2.verify(client.clientSecret, clientSecret);
  if (!secretValid) throw new Error("INVALID_CLIENT");

  const grant = await prisma.oAuthGrant.findUnique({
    where: { refreshToken },
    include: { user: true },
  });

  if (!grant) throw new Error("INVALID_REFRESH_TOKEN");
  if (grant.revokedAt) throw new Error("TOKEN_REVOKED");
  if (grant.clientId !== client.id) throw new Error("INVALID_CLIENT");

  // Rotate: revoke old, issue new
  await prisma.oAuthGrant.update({
    where: { id: grant.id },
    data: { revokedAt: new Date() },
  });

  const newAccessToken = generateToken(32);
  const newRefreshToken = generateToken(32);

  const newGrant = await prisma.oAuthGrant.create({
    data: {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      clientId: client.id,
      userId: grant.userId,
      scopes: grant.scopes,
      expiresAt: new Date(Date.now() + ACCESS_TOKEN_TTL_MS),
    },
    include: { user: true },
  });

  return {
    access_token: newAccessToken,
    refresh_token: newRefreshToken,
    token_type: "Bearer",
    expires_in: ACCESS_TOKEN_TTL_MS / 1000,
    scope: newGrant.scopes.join(" "),
  };
}

// ─── Validate Bearer token (used by middleware) ───────────────────────────────

export async function validateAccessToken(token: string) {
  const grant = await prisma.oAuthGrant.findUnique({
    where: { accessToken: token },
    include: { user: true, client: true },
  });

  if (!grant) return null;
  if (grant.revokedAt) return null;
  if (grant.expiresAt < new Date()) return null;

  return {
    user: {
      id: grant.user.id,
      name: grant.user.name,
      email: grant.user.email,
    },
    scopes: grant.scopes as Scope[],
    clientName: grant.client.name,
    grantId: grant.id,
  };
}

// ─── Revoke token ─────────────────────────────────────────────────────────────

export async function revokeToken(token: string, clientId: string) {
  const client = await prisma.oAuthClient.findUnique({ where: { clientId } });
  if (!client) return;

  await prisma.oAuthGrant.updateMany({
    where: {
      OR: [{ accessToken: token }, { refreshToken: token }],
      clientId: client.id,
    },
    data: { revokedAt: new Date() },
  });
}

// ─── Introspect token ─────────────────────────────────────────────────────────

export async function introspectToken(token: string, clientId: string) {
  const client = await prisma.oAuthClient.findUnique({ where: { clientId } });
  if (!client) return { active: false };

  const grant = await prisma.oAuthGrant.findFirst({
    where: {
      OR: [{ accessToken: token }, { refreshToken: token }],
      clientId: client.id,
    },
    include: { user: true },
  });

  if (!grant || grant.revokedAt || grant.expiresAt < new Date()) {
    return { active: false };
  }

  return {
    active: true,
    scope: grant.scopes.join(" "),
    client_id: clientId,
    username: grant.user.email,
    exp: Math.floor(grant.expiresAt.getTime() / 1000),
    sub: grant.user.id,
  };
}

// ─── Seed helper — create OAuth client ───────────────────────────────────────

export async function createOAuthClient(data: {
  name: string;
  clientId: string;
  clientSecret: string;
  redirectUris: string[];
  scopes: string[];
  logoUrl?: string;
}) {
  const hashedSecret = await argon2.hash(data.clientSecret, {
    type: argon2.argon2id,
  });

  return prisma.oAuthClient.upsert({
    where: { clientId: data.clientId },
    update: {},
    create: {
      name: data.name,
      clientId: data.clientId,
      clientSecret: hashedSecret,
      redirectUris: data.redirectUris,
      scopes: data.scopes,
      logoUrl: data.logoUrl,
    },
  });
}

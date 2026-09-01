/**
 * One-off script: ensure the claude OAuth client has all required redirect URIs
 * and the correct secret hash (bcrypt, not argon2).
 *
 * Run with: npx tsx src/fix-claude-redirect.ts
 */
import { prisma } from "./db/prisma.js";
import bcrypt from "bcryptjs";

async function main() {
  const secret = process.env.CLAUDE_CLIENT_SECRET ?? "claude-dev-secret-change-me";
  const hashedSecret = await bcrypt.hash(secret, 12);

  const updated = await prisma.oAuthClient.upsert({
    where: { clientId: "claude" },
    update: {
      clientSecret: hashedSecret,
      redirectUris: [
        "https://claude.ai/api/mcp/auth_callback",
        "https://claude.ai/oauth/callback",
        "http://localhost:3000/oauth/callback",
      ],
    },
    create: {
      name: "Claude",
      clientId: "claude",
      clientSecret: hashedSecret,
      redirectUris: [
        "https://claude.ai/api/mcp/auth_callback",
        "https://claude.ai/oauth/callback",
        "http://localhost:3000/oauth/callback",
      ],
      scopes: ["profile", "cart:read", "cart:write", "orders:read", "checkout"],
      logoUrl: "https://upload.wikimedia.org/wikipedia/commons/8/8a/Claude_AI_logo.svg",
    },
  });

  console.log("✓ Claude client updated:");
  console.log("  clientId:", updated.clientId);
  console.log("  redirectUris:", updated.redirectUris);
  console.log("  secret: rehashed with bcrypt");
}

main().catch(console.error).finally(() => prisma.$disconnect());

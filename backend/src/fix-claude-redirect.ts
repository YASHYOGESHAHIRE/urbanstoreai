/**
 * One-off script: add Claude's MCP auth callback URI to the claude OAuth client.
 * Run with: npx tsx src/fix-claude-redirect.ts
 */
import { prisma } from "./db/prisma.js";

async function main() {
  const updated = await prisma.oAuthClient.update({
    where: { clientId: "claude" },
    data: {
      redirectUris: [
        "https://claude.ai/api/mcp/auth_callback",
        "https://claude.ai/oauth/callback",
        "http://localhost:3000/oauth/callback",
      ],
    },
  });
  console.log("✓ Updated redirectUris:", updated.redirectUris);
}

main().catch(console.error).finally(() => prisma.$disconnect());

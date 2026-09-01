/**
 * Fix OAuth clients:
 * 1. Clear secret on claude client (public client — no secret needed)
 * 2. Delete orphaned dyn_ clients
 * Run: npx tsx src/fix-oauth-clients.ts
 */
import { prisma } from "./db/prisma.js";

async function main() {
  // 1. Clear secret on claude client
  const claude = await prisma.oAuthClient.update({
    where: { clientId: "claude" },
    data: {
      clientSecret: "",
      redirectUris: [
        "https://claude.ai/api/mcp/auth_callback",
        "https://claude.ai/oauth/callback",
        "http://localhost:3000/oauth/callback",
      ],
    },
  });
  console.log("✓ claude client secret cleared, redirectUris updated");
  console.log("  clientId:", claude.clientId);
  console.log("  hasSecret:", !!claude.clientSecret);

  // 2. Delete orphaned dyn_ clients
  const deleted = await prisma.oAuthClient.deleteMany({
    where: { clientId: { startsWith: "dyn_" } },
  });
  console.log(`✓ Deleted ${deleted.count} orphaned dyn_ clients`);

  // 3. Show final state
  const clients = await prisma.oAuthClient.findMany({
    select: { clientId: true, name: true, clientSecret: true },
  });
  console.log("\nFinal OAuth clients:");
  clients.forEach(c => console.log(`  ${c.clientId} (${c.name}) hasSecret=${!!c.clientSecret}`));
}

main().catch(console.error).finally(() => prisma.$disconnect());

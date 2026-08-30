/**
 * Generates and stores embeddings for all products.
 * Uses local all-MiniLM-L6-v2 model — FREE, no API key needed.
 * Model (~23MB) downloads automatically on first run.
 *
 * Run with: npm run embed
 *
 * Requirements:
 *   - Products already seeded (npm run seed)
 *   - pgvector migration applied (npx prisma migrate dev)
 */

import { prisma } from "./db/prisma.js";
import { embed, buildProductText, vectorToSql } from "./services/embedding.service.js";

async function embedCatalogue() {
  console.log("\n Urban Store — Generating product embeddings (local model)\n");
  console.log(" No API key needed. Model downloads once on first run.\n");

  const products = await prisma.product.findMany({
    select: {
      id: true,
      name: true,
      brand: true,
      description: true,
      categoryName: true,
      subcategoryName: true,
      useCases: true,
      suitableFor: true,
      notSuitableFor: true,
      characteristics: true,
    },
  });

  console.log(`Found ${products.length} products\n`);

  let success = 0;
  let failed = 0;

  for (const product of products) {
    process.stdout.write(`  ${product.id.padEnd(20)} ${product.name.slice(0, 35).padEnd(36)}... `);

    try {
      const text = buildProductText({
        ...product,
        characteristics: product.characteristics as Record<string, unknown>,
      });

      const vector = await embed(text);

      await prisma.$executeRawUnsafe(
        `UPDATE products SET embedding = $1::vector WHERE id = $2`,
        vectorToSql(vector),
        product.id
      );

      console.log("✓");
      success++;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`✗ ${msg}`);
      failed++;
    }
  }

  console.log(`\n Done: ${success} embedded, ${failed} failed`);
  console.log(` Semantic search is now active!\n`);
}

embedCatalogue()
  .catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

/**
 * Quick test script — run with: npm run test:search
 * Tests keyword search, semantic search, and embedding generation.
 */

import { prisma } from "./db/prisma.js";
import { searchProducts } from "./services/catalog.service.js";
import { embed, buildProductText } from "./services/embedding.service.js";

async function testSearch() {
  console.log("\n====== Urban Store Search Test ======\n");

  // 1. Check DB connection
  console.log("1. Testing DB connection...");
  const count = await prisma.product.count();
  console.log(`   ✓ Connected — ${count} products in DB\n`);

  // 2. Check embeddings
  console.log("2. Checking embeddings...");
  const withEmbedding = await prisma.$queryRaw<[{ count: bigint }]>`
    SELECT COUNT(*) as count FROM products WHERE embedding IS NOT NULL
  `;
  const embCount = Number(withEmbedding[0].count);
  console.log(`   ${embCount > 0 ? "✓" : "✗"} ${embCount}/${count} products have embeddings`);
  if (embCount === 0) {
    console.log("   → Run: npm run embed  to generate embeddings\n");
  } else {
    console.log();
  }

  // 3. Test embedding generation
  console.log("3. Testing local embedding model...");
  try {
    const vec = await embed("minimal black backpack for office");
    console.log(`   ✓ Embedding generated — ${vec.length} dimensions\n`);
  } catch (err) {
    console.log(`   ✗ Embedding failed: ${err}\n`);
  }

  // 4. Test searches
  const queries = [
    { label: "Exact keyword",     query: "backpack",                         maxPrice: undefined },
    { label: "Semantic — vague",  query: "something for rainy days",         maxPrice: undefined },
    { label: "Semantic — gift",   query: "gift for someone who loves travel", maxPrice: undefined },
    { label: "Semantic + price",  query: "minimal office wear",              maxPrice: 2000 },
    { label: "Semantic — casual", query: "cozy winter evening outfit",       maxPrice: undefined },
  ];

  console.log("4. Running search tests...\n");

  for (const { label, query, maxPrice } of queries) {
    const result = await searchProducts({ query, maxPrice, limit: 3 });
    console.log(`   [${label}]`);
    console.log(`   Query: "${query}"${maxPrice ? ` (max ₹${maxPrice})` : ""}`);
    console.log(`   Mode:  ${result.searchMode}`);
    console.log(`   Found: ${result.products.length} products`);
    result.products.forEach((p, i) => {
      const score = (p as { relevanceScore?: number }).relevanceScore;
      console.log(`     ${i + 1}. ${p.name} — ₹${p.price}${score ? ` (score: ${score})` : ""}`);
    });
    console.log();
  }

  console.log("====== Test Complete ======\n");
}

testSearch()
  .catch((err) => {
    console.error("Test failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

/**
 * Seeds:
 *  1. OAuth clients (ChatGPT + Claude)
 *  2. Full product catalogue from urban_store_catalog.json
 *
 * Run with: npm run seed
 */

import { createOAuthClient } from "./services/oauth.service.js";
import { prisma } from "./db/prisma.js";
import catalogRaw from "../urban_store_catalog.json";

const ALL_SCOPES = [
  "profile",
  "cart:read",
  "cart:write",
  "orders:read",
  "checkout",
];

// ─── Seed OAuth clients ───────────────────────────────────────────────────────

async function seedOAuthClients() {
  console.log("\n── OAuth Clients ────────────────────────────────────────");

  const chatgptSecret =
    process.env.CHATGPT_CLIENT_SECRET ?? "chatgpt-dev-secret-change-me";
  await createOAuthClient({
    name: "ChatGPT",
    clientId: "chatgpt",
    clientSecret: chatgptSecret,
    redirectUris: [
      "https://chat.openai.com/aip/g-PLUGIN_ID/oauth/callback",
      "http://localhost:3000/oauth/callback",
    ],
    scopes: ALL_SCOPES,
    logoUrl:
      "https://upload.wikimedia.org/wikipedia/commons/0/04/ChatGPT_logo.svg",
  });
  console.log("✓ ChatGPT client");

  const claudeSecret =
    process.env.CLAUDE_CLIENT_SECRET ?? "claude-dev-secret-change-me";
  await createOAuthClient({
    name: "Claude",
    clientId: "claude",
    clientSecret: claudeSecret,
    redirectUris: [
      "https://claude.ai/oauth/callback",
      "http://localhost:3000/oauth/callback",
    ],
    scopes: ALL_SCOPES,
    logoUrl:
      "https://upload.wikimedia.org/wikipedia/commons/8/8a/Claude_AI_logo.svg",
  });
  console.log("✓ Claude client");
}

// ─── Seed products ────────────────────────────────────────────────────────────

async function seedProducts() {
  console.log("\n── Products ─────────────────────────────────────────────");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const catalog = catalogRaw as any[];

  // Build flat arrays for bulk operations
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const productData: any[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const variantData: any[] = [];

  for (const entry of catalog) {
    const p = entry.product;

    productData.push({
      id: p.id,
      merchantId: entry.merchant_id ?? "urban_store",
      name: p.name,
      brand: p.brand,
      categoryId: p.category.id,
      categoryName: p.category.name,
      subcategoryId: p.subcategory?.id ?? p.category.id,
      subcategoryName: p.subcategory?.name ?? p.category.name,
      description: p.description,
      imageAlt: p.media?.primary_image?.alt ?? "",
      useCases: p.semantic_profile?.use_cases ?? [],
      suitableFor: p.semantic_profile?.suitable_for ?? [],
      notSuitableFor: p.semantic_profile?.not_suitable_for ?? [],
      characteristics: p.semantic_profile?.characteristics ?? {},
      similarTo: p.relationships?.similar_to ?? [],
      alternativeTo: p.relationships?.alternative_to ?? [],
      compatibleWith: p.relationships?.compatible_with ?? [],
      complements: p.relationships?.complements ?? [],
      upgradeTo: p.relationships?.upgrade_to ?? [],
      frequentlyBoughtWith: p.relationships?.frequently_bought_with ?? [],
      requiresVariantSelect: p.purchase_constraints?.requires_variant_selection ?? false,
      maxQtyPerOrder: p.purchase_constraints?.max_quantity_per_order ?? 5,
    });

    for (const v of p.variants ?? []) {
      variantData.push({
        sku: v.sku,
        productId: p.id,
        attributes: v.attributes,
        priceAmount: v.commerce.price.amount,
        priceCurrency: v.commerce.price.currency,
        mrpAmount: v.commerce.mrp.amount,
        mrpCurrency: v.commerce.mrp.currency,
        availabilityStatus: v.commerce.availability.status,
        quantityAvailable: v.commerce.availability.quantity_available,
        lastUpdated: new Date(v.commerce.last_updated),
      });
    }
  }

  // Bulk upsert products in chunks of 50
  const CHUNK = 50;
  let productsDone = 0;
  for (let i = 0; i < productData.length; i += CHUNK) {
    const chunk = productData.slice(i, i + CHUNK);
    await Promise.all(
      chunk.map((p) =>
        prisma.product.upsert({
          where: { id: p.id },
          update: p,
          create: p,
        })
      )
    );
    productsDone += chunk.length;
    process.stdout.write(`\r  Products: ${productsDone}/${productData.length}`);
  }

  // Bulk upsert variants in chunks of 100
  let variantsDone = 0;
  for (let i = 0; i < variantData.length; i += CHUNK * 2) {
    const chunk = variantData.slice(i, i + CHUNK * 2);
    await Promise.all(
      chunk.map((v) =>
        prisma.productVariant.upsert({
          where: { sku: v.sku },
          update: v,
          create: v,
        })
      )
    );
    variantsDone += chunk.length;
    process.stdout.write(`\r  Variants: ${variantsDone}/${variantData.length} `);
  }

  console.log(`\n\n${productData.length} products, ${variantData.length} variants seeded.`);
}

// ─── Run ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("Urban Store seed starting...");
  await seedOAuthClients();
  await seedProducts();
  console.log("\n✓ Seed complete.\n");
}

main()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

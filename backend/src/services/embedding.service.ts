/**
 * Local embedding service using @xenova/transformers
 * Model: all-MiniLM-L6-v2 — 384 dimensions, free, runs on CPU
 * No API key required. Model downloads once (~23MB) on first use.
 */

// Use require to avoid ESM/CJS type conflicts with @xenova/transformers
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { pipeline, env } = require("@xenova/transformers");

export const EMBEDDING_DIM = 384;

// Cache model after first load
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let embedder: any = null;

// Tell transformers where to cache the model
env.cacheDir = "./.model-cache";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getEmbedder(): Promise<any> {
  if (!embedder) {
    console.log("[embedding] Loading all-MiniLM-L6-v2 model (first time only)...");
    embedder = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
    console.log("[embedding] Model ready.");
  }
  return embedder;
}

/**
 * Generate a 384-dim embedding vector for a text string.
 * Runs entirely locally — no API call, no cost.
 */
export async function embed(text: string): Promise<number[]> {
  const model = await getEmbedder();

  const output = await model(text.slice(0, 512), {
    pooling: "mean",
    normalize: true,
  });

  // Convert Float32Array → plain number[]
  return Array.from(output.data as Float32Array);
}

/**
 * Build a rich text representation of a product for embedding.
 */
export function buildProductText(product: {
  name: string;
  brand: string;
  description: string;
  categoryName: string;
  subcategoryName: string;
  useCases: string[];
  suitableFor: string[];
  notSuitableFor: string[];
  characteristics: Record<string, unknown>;
}): string {
  const parts: string[] = [
    `Product: ${product.name}`,
    `Brand: ${product.brand}`,
    `Category: ${product.categoryName}`,
    `Type: ${product.subcategoryName}`,
    `Description: ${product.description}`,
  ];

  if (product.useCases.length > 0) parts.push(`Use cases: ${product.useCases.join(", ")}`);
  if (product.suitableFor.length > 0) parts.push(`Suitable for: ${product.suitableFor.join(", ")}`);
  if (product.notSuitableFor.length > 0) parts.push(`Not suitable for: ${product.notSuitableFor.join(", ")}`);

  const chars = product.characteristics;
  if (Object.keys(chars).length > 0) {
    const charStr = Object.entries(chars)
      .map(([k, v]) => {
        const label = k.replace(/_/g, " ");
        const val = Array.isArray(v) ? v.join(", ") : String(v);
        return `${label}: ${val}`;
      })
      .join("; ");
    parts.push(`Specifications: ${charStr}`);
  }

  return parts.join(". ");
}

/**
 * Format a vector array as PostgreSQL vector literal.
 */
export function vectorToSql(vec: number[]): string {
  return `[${vec.join(",")}]`;
}

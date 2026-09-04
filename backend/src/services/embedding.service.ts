/**
 * Local embedding service using @xenova/transformers
 * Model: all-MiniLM-L6-v2 — 384 dimensions, free, runs on CPU
 * No API key required. Model downloads once (~23MB) on first use.
 *
 * IMPORTANT: @xenova/transformers is a pure ES Module. It cannot be
 * require()'d in a CommonJS build. We use a lazy dynamic import() inside
 * getEmbedder() so the module is only loaded when embed() is first called,
 * not at server startup. This means a cold-start request that triggers
 * semantic search will load the model on demand — subsequent calls use
 * the cached embedder instance.
 *
 * On Vercel serverless: the model download won't work (no persistent FS,
 * 50MB layer limit). vectorSearch() in catalog.service.ts catches the
 * failure and falls back to keyword search automatically — the server
 * never crashes.
 */

export const EMBEDDING_DIM = 384;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let embedder: any = null;
let loadAttempted = false;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getEmbedder(): Promise<any> {
  if (embedder) return embedder;

  // Only attempt to load once per process — if it fails, don't retry
  if (loadAttempted) return null;
  loadAttempted = true;

  try {
    // Dynamic import — avoids ERR_REQUIRE_ESM crash at startup
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const transformers = await import("@xenova/transformers") as any;
    const { pipeline, env } = transformers;

    // Tell transformers where to cache the model
    env.cacheDir = "./.model-cache";

    console.log("[embedding] Loading all-MiniLM-L6-v2 model (first time only)...");
    embedder = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
    console.log("[embedding] Model ready.");
    return embedder;
  } catch (err) {
    // On Vercel or environments where the model can't load,
    // this silently returns null — catalog.service.ts falls back to keyword search
    console.warn("[embedding] Model load failed (expected on Vercel serverless):", String(err).slice(0, 120));
    return null;
  }
}

/**
 * Generate a 384-dim embedding vector for a text string.
 * Returns null if the model is not available (Vercel, no model cache).
 * Callers must handle null — catalog.service.ts falls back to keyword search.
 */
export async function embed(text: string): Promise<number[] | null> {
  const model = await getEmbedder();
  if (!model) return null;

  try {
    const output = await model(text.slice(0, 512), {
      pooling: "mean",
      normalize: true,
    });
    return Array.from(output.data as Float32Array);
  } catch {
    return null;
  }
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

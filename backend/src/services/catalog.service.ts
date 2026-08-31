import { prisma } from "../db/prisma.js";

export interface SearchParams {
  query?: string;
  category?: string;
  subcategory?: string;
  minPrice?: number;
  maxPrice?: number;
  availability?: string;
  hasDiscount?: boolean;   // ← new: filter to only discounted products
  limit?: number;
  offset?: number;
}

// ─── Unsplash images by subcategory ──────────────────────────────────────────

const SUBCATEGORY_IMAGES: Record<string, string> = {
  running_shoes:      "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=600&h=600&fit=crop",
  casual_shoes:       "https://images.unsplash.com/photo-1525966222134-fcfa99b8ae77?w=600&h=600&fit=crop",
  formal_shoes:       "https://images.unsplash.com/photo-1614252369475-531eba835eb1?w=600&h=600&fit=crop",
  laptop_bags:        "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=600&h=600&fit=crop",
  backpacks:          "https://images.unsplash.com/photo-1622560480605-d83c853bc5c3?w=600&h=600&fit=crop",
  travel_bags:        "https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=600&h=600&fit=crop",
  travel_accessories: "https://images.unsplash.com/photo-1473188588951-666fce8e7c68?w=600&h=600&fit=crop",
  t_shirts:           "https://images.unsplash.com/photo-1618354691373-d851c5c3a990?w=600&h=600&fit=crop",
  shirts:             "https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=600&h=600&fit=crop",
  jeans:              "https://images.unsplash.com/photo-1542272604-787c3835535d?w=600&h=600&fit=crop",
  jackets:            "https://images.unsplash.com/photo-1591047139829-d91aecb6caea?w=600&h=600&fit=crop",
  dresses:            "https://images.unsplash.com/photo-1572804013309-59a88b7e92f1?w=600&h=600&fit=crop",
  watches:            "https://images.unsplash.com/photo-1524592094714-0f0654e20314?w=600&h=600&fit=crop",
  watch_straps:       "https://images.unsplash.com/photo-1547996160-81dfa63595aa?w=600&h=600&fit=crop",
  wallets:            "https://images.unsplash.com/photo-1627123424574-724758594e93?w=600&h=600&fit=crop",
  belts:              "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=600&h=600&fit=crop",
  sunglasses:         "https://images.unsplash.com/photo-1511499767150-a48a237f0083?w=600&h=600&fit=crop",
  gifting:            "https://images.unsplash.com/photo-1549465220-1a8b9238cd48?w=600&h=600&fit=crop",
  default:            "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600&h=600&fit=crop",
};

export function getProductImage(subcategoryId: string): string {
  return SUBCATEGORY_IMAGES[subcategoryId] ?? SUBCATEGORY_IMAGES.default;
}

// ─── Format product for API response ─────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function formatProduct(product: any) {
  const variants = product.variants ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const inStock = variants.filter((v: any) => v.availabilityStatus === "in_stock");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lowestPrice = inStock.length > 0
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ? Math.min(...inStock.map((v: any) => v.priceAmount))
    : variants[0]?.priceAmount ?? 0;
  const lowestMrp = inStock.length > 0
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ? Math.min(...inStock.map((v: any) => v.mrpAmount))
    : variants[0]?.mrpAmount ?? 0;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const availability = variants.some((v: any) => v.availabilityStatus === "in_stock")
    ? "in_stock"
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    : variants.some((v: any) => v.availabilityStatus === "low_stock")
    ? "low_stock"
    : "out_of_stock";

  return {
    id: product.id,
    name: product.name,
    brand: product.brand,
    category: product.categoryName,
    subcategory: product.subcategoryName,
    subcategoryId: product.subcategoryId,
    description: product.description,
    image: getProductImage(product.subcategoryId),
    price: lowestPrice,
    mrp: lowestMrp,
    currency: "INR",
    availability,
    useCases: product.useCases,
    suitableFor: product.suitableFor,
    notSuitableFor: product.notSuitableFor,
    characteristics: product.characteristics,
    relationships: {
      similarTo: product.similarTo,
      complements: product.complements,
      frequentlyBoughtWith: product.frequentlyBoughtWith,
    },
    requiresVariantSelection: product.requiresVariantSelect,
    maxQtyPerOrder: product.maxQtyPerOrder,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    variants: variants.map((v: any) => ({
      sku: v.sku,
      attributes: v.attributes,
      price: v.priceAmount,
      mrp: v.mrpAmount,
      availability: v.availabilityStatus,
      quantity: v.quantityAvailable,
    })),
  };
}

// ─── Keyword search ───────────────────────────────────────────────────────────

async function keywordSearch(params: SearchParams) {
  const {
    query, category, subcategory,
    minPrice, maxPrice, availability, hasDiscount,
    limit = 10, offset = 0,
  } = params;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {};

  if (category) {
    where.categoryId = { equals: category.toLowerCase(), mode: "insensitive" };
  }
  if (subcategory) {
    where.subcategoryId = { equals: subcategory.toLowerCase(), mode: "insensitive" };
  }
  if (query) {
    where.OR = [
      { name: { contains: query, mode: "insensitive" } },
      { brand: { contains: query, mode: "insensitive" } },
      { description: { contains: query, mode: "insensitive" } },
      { subcategoryName: { contains: query, mode: "insensitive" } },
    ];
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const variantWhere: any = {};
  if (minPrice !== undefined) variantWhere.priceAmount = { ...variantWhere.priceAmount, gte: minPrice };
  if (maxPrice !== undefined) variantWhere.priceAmount = { ...variantWhere.priceAmount, lte: maxPrice };
  if (availability) variantWhere.availabilityStatus = availability;
  if (Object.keys(variantWhere).length > 0) where.variants = { some: variantWhere };

  const [products, total] = await Promise.all([
    prisma.product.findMany({
      where,
      include: { variants: true },
      take: limit,
      skip: offset,
      orderBy: { name: "asc" },
    }),
    prisma.product.count({ where }),
  ]);

  return { products: products.map(formatProduct), total };
}

// ─── Main search ──────────────────────────────────────────────────────────────

export async function searchProducts(params: SearchParams) {
  const limit = params.limit ?? 10;
  const offset = params.offset ?? 0;

  const result = await keywordSearch({ ...params, limit, offset });
  return {
    ...result,
    limit,
    offset,
    searchMode: "keyword",
  };
}

// ─── Get single product ───────────────────────────────────────────────────────

export async function getProduct(id: string) {
  const product = await prisma.product.findUnique({
    where: { id },
    include: { variants: true },
  });
  if (!product) return null;
  return formatProduct(product);
}

// ─── Availability check ───────────────────────────────────────────────────────

export async function getProductAvailability(id: string) {
  const product = await prisma.product.findUnique({
    where: { id },
    include: {
      variants: {
        select: {
          sku: true,
          attributes: true,
          availabilityStatus: true,
          quantityAvailable: true,
          priceAmount: true,
        },
      },
    },
  });
  if (!product) return null;
  return {
    productId: id,
    name: product.name,
    variants: product.variants.map((v) => ({
      sku: v.sku,
      attributes: v.attributes,
      availability: v.availabilityStatus,
      quantity: v.quantityAvailable,
      price: v.priceAmount,
    })),
  };
}

// ─── Upsell — frequently bought with + complements ────────────────────────────

export async function getUpsells(productId: string) {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { name: true, frequentlyBoughtWith: true, complements: true },
  });
  if (!product) return { upsells: [] };

  const relatedIds = [
    ...product.frequentlyBoughtWith,
    ...product.complements,
  ].filter(Boolean).slice(0, 3);

  if (relatedIds.length === 0) return { upsells: [] };

  const related = await prisma.product.findMany({
    where: {
      id: { in: relatedIds },
      variants: { some: { availabilityStatus: { in: ["in_stock", "low_stock"] } } },
    },
    include: { variants: true },
    take: 2,
  });

  return {
    upsells: related.map(formatProduct),
    message: `Customers who bought ${product.name} also loved these:`,
  };
}

// ─── Upgrade — upgrade_to relationships ──────────────────────────────────────

export async function getUpgrades(productId: string) {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { name: true, upgradeTo: true, variants: { select: { priceAmount: true } } },
  });
  if (!product) return { upgrade: null, message: "Product not found." };

  if (product.upgradeTo.length === 0) {
    return { upgrade: null, message: `${product.name} is already the top option in this range.` };
  }

  const upgrades = await prisma.product.findMany({
    where: {
      id: { in: product.upgradeTo },
      variants: { some: { availabilityStatus: { in: ["in_stock", "low_stock"] } } },
    },
    include: { variants: true },
  });

  const currentPrice = Math.min(...(product.variants.map((v) => v.priceAmount)));

  return {
    upgrades: upgrades.map(formatProduct),
    currentPrice,
    message: upgrades.length > 0
      ? `There's a better version of ${product.name}:`
      : `No upgrade available for ${product.name}.`,
  };
}

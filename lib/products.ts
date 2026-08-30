export interface ProductVariant {
  sku: string;
  attributes: Record<string, string>;
  price: number;
  mrp: number;
  availability: "in_stock" | "out_of_stock" | "low_stock";
  quantity: number;
}

export interface Product {
  id: string;
  brand: string;
  name: string;
  description: string;
  category: "Fashion" | "Footwear" | "Bags" | "Accessories" | "Lifestyle";
  subcategory: string;
  image: string;
  price: number;       // lowest variant price
  mrp: number;
  attributes: string[];
  availability: "In stock" | "Out of stock" | "Low stock";
  variants: ProductVariant[];
  useCases: string[];
  suitableFor: string[];
  notSuitableFor: string[];
  characteristics: Record<string, string | number | boolean | string[]>;
  maxQtyPerOrder: number;
  isNew?: boolean;
}

// ─── Unsplash images by subcategory — dark themed ─────────────────────────────
const IMAGES: Record<string, string> = {
  // Footwear
  running_shoes:    "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=600&h=600&fit=crop",
  casual_shoes:     "https://images.unsplash.com/photo-1525966222134-fcfa99b8ae77?w=600&h=600&fit=crop",
  formal_shoes:     "https://images.unsplash.com/photo-1614252369475-531eba835eb1?w=600&h=600&fit=crop",
  // Bags
  laptop_bags:      "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=600&h=600&fit=crop",
  backpacks:        "https://images.unsplash.com/photo-1622560480605-d83c853bc5c3?w=600&h=600&fit=crop",
  travel_bags:      "https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=600&h=600&fit=crop",
  travel_accessories: "https://images.unsplash.com/photo-1473188588951-666fce8e7c68?w=600&h=600&fit=crop",
  // Fashion
  t_shirts:         "https://images.unsplash.com/photo-1618354691373-d851c5c3a990?w=600&h=600&fit=crop",
  shirts:           "https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=600&h=600&fit=crop",
  jeans:            "https://images.unsplash.com/photo-1542272604-787c3835535d?w=600&h=600&fit=crop",
  jackets:          "https://images.unsplash.com/photo-1591047139829-d91aecb6caea?w=600&h=600&fit=crop",
  dresses:          "https://images.unsplash.com/photo-1572804013309-59a88b7e92f1?w=600&h=600&fit=crop",
  // Accessories
  watches:          "https://images.unsplash.com/photo-1524592094714-0f0654e20314?w=600&h=600&fit=crop",
  watch_straps:     "https://images.unsplash.com/photo-1547996160-81dfa63595aa?w=600&h=600&fit=crop",
  wallets:          "https://images.unsplash.com/photo-1627123424574-724758594e93?w=600&h=600&fit=crop",
  belts:            "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=600&h=600&fit=crop",
  sunglasses:       "https://images.unsplash.com/photo-1511499767150-a48a237f0083?w=600&h=600&fit=crop",
  // Lifestyle / default
  default:          "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600&h=600&fit=crop",
};

function getImage(subcategoryId: string): string {
  return IMAGES[subcategoryId] ?? IMAGES.default;
}

function mapAvailability(status: string): "In stock" | "Out of stock" | "Low stock" {
  if (status === "in_stock") return "In stock";
  if (status === "low_stock") return "Low stock";
  return "Out of stock";
}

function mapCategory(catId: string): Product["category"] {
  const map: Record<string, Product["category"]> = {
    footwear: "Footwear",
    bags: "Bags",
    fashion: "Fashion",
    accessories: "Accessories",
    lifestyle: "Lifestyle",
  };
  return map[catId] ?? "Lifestyle";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fromCatalog(entry: any): Product {
  const p = entry.product;
  const variants: ProductVariant[] = p.variants.map((v: any) => ({
    sku: v.sku,
    attributes: v.attributes,
    price: v.commerce.price.amount,
    mrp: v.commerce.mrp.amount,
    availability: v.commerce.availability.status,
    quantity: v.commerce.availability.quantity_available,
  }));

  const lowestVariant = variants.reduce((a, b) => (a.price <= b.price ? a : b));
  const worstAvailability = variants.some((v) => v.availability === "in_stock")
    ? "In stock"
    : variants.some((v) => v.availability === "low_stock")
    ? "Low stock"
    : "Out of stock";

  const chars = p.semantic_profile?.characteristics ?? {};
  const attrStrings: string[] = [];
  if (chars.material) attrStrings.push(String(chars.material));
  if (chars.fit) attrStrings.push(String(chars.fit));
  if (chars.style) attrStrings.push(String(chars.style));
  if (chars.water_resistance) attrStrings.push("Water Resistant");
  if (chars.capacity_litres) attrStrings.push(`${chars.capacity_litres}L`);
  if (chars.laptop_sizes_supported) attrStrings.push(`Up to ${Math.max(...(chars.laptop_sizes_supported as number[]))}`);
  if (chars.weight_grams) attrStrings.push(`${chars.weight_grams}g`);
  if (attrStrings.length === 0 && variants[0]?.attributes) {
    Object.values(variants[0].attributes).forEach((v) => attrStrings.push(String(v)));
  }

  return {
    id: p.id,
    brand: p.brand,
    name: p.name,
    description: p.description,
    category: mapCategory(p.category.id),
    subcategory: p.subcategory?.name ?? p.category.name,
    image: getImage(p.subcategory?.id ?? ""),
    price: lowestVariant.price,
    mrp: lowestVariant.mrp,
    attributes: attrStrings.slice(0, 3),
    availability: worstAvailability,
    variants,
    useCases: p.semantic_profile?.use_cases ?? [],
    suitableFor: p.semantic_profile?.suitable_for ?? [],
    notSuitableFor: p.semantic_profile?.not_suitable_for ?? [],
    characteristics: chars,
    maxQtyPerOrder: p.purchase_constraints?.max_quantity_per_order ?? 5,
  };
}

// Import catalogue — resolve via alias to backend folder
// eslint-disable-next-line @typescript-eslint/no-var-requires
const catalogRaw: unknown[] = require("../backend/urban_store_catalog.json");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const products: Product[] = (catalogRaw as any[]).map(fromCatalog);

export const chatProducts = products.filter((p) => p.category === "Bags").slice(0, 3);

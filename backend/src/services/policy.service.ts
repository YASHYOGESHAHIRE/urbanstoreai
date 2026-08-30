import { prisma } from "../db/prisma.js";

export interface PolicyResult {
  approved: boolean;
  requiresConfirmation: boolean;
  reason: string;
  issues: PolicyIssue[];
  summary: string;
}

export interface PolicyIssue {
  type: "warning" | "error";
  code: string;
  message: string;
  itemId?: string;
}

// ─── Validate cart before checkout ───────────────────────────────────────────

export async function validateCartPolicy(
  cartId: string,
  userId: string
): Promise<PolicyResult> {
  const cart = await prisma.cart.findUnique({
    where: { id: cartId },
    include: {
      items: {
        include: {
          product: true,
          variant: true,
        },
      },
    },
  });

  if (!cart) return block("CART_NOT_FOUND", "Cart not found.");
  if (cart.userId !== userId) return block("UNAUTHORIZED", "Not your cart.");
  if (cart.status !== "active") return block("CART_NOT_ACTIVE", "Cart is not active.");
  if (cart.items.length === 0) return block("EMPTY_CART", "Cart is empty.");

  const issues: PolicyIssue[] = [];

  for (const item of cart.items) {
    const variant = item.variant;

    // Stock check
    if (variant.availabilityStatus === "out_of_stock") {
      issues.push({
        type: "error",
        code: "OUT_OF_STOCK",
        message: `${item.product.name} is out of stock.`,
        itemId: item.id,
      });
    } else if (variant.availabilityStatus === "low_stock") {
      issues.push({
        type: "warning",
        code: "LOW_STOCK",
        message: `${item.product.name} has limited stock (${variant.quantityAvailable} left).`,
        itemId: item.id,
      });
    }

    // Qty check
    if (item.quantity > item.product.maxQtyPerOrder) {
      issues.push({
        type: "error",
        code: "QTY_EXCEEDED",
        message: `${item.product.name}: max ${item.product.maxQtyPerOrder} per order.`,
        itemId: item.id,
      });
    }

    // Qty vs available stock
    if (
      variant.availabilityStatus !== "out_of_stock" &&
      item.quantity > variant.quantityAvailable
    ) {
      issues.push({
        type: "error",
        code: "INSUFFICIENT_STOCK",
        message: `${item.product.name}: only ${variant.quantityAvailable} available.`,
        itemId: item.id,
      });
    }

    // Price drift — if price changed since added to cart
    if (item.priceSnapshot !== variant.priceAmount) {
      issues.push({
        type: "warning",
        code: "PRICE_CHANGED",
        message: `${item.product.name} price changed from ₹${item.priceSnapshot} to ₹${variant.priceAmount}.`,
        itemId: item.id,
      });
    }
  }

  const hasErrors = issues.some((i) => i.type === "error");
  const hasWarnings = issues.some((i) => i.type === "warning");

  if (hasErrors) {
    return {
      approved: false,
      requiresConfirmation: false,
      reason: "Cart has errors that must be resolved.",
      issues,
      summary: `${issues.filter((i) => i.type === "error").length} error(s) found.`,
    };
  }

  if (hasWarnings) {
    return {
      approved: true,
      requiresConfirmation: true,
      reason: "Cart has warnings. User confirmation required.",
      issues,
      summary: `${issues.length} warning(s). Please confirm to proceed.`,
    };
  }

  const subtotal = cart.items.reduce(
    (s, i) => s + i.priceSnapshot * i.quantity,
    0
  );

  return {
    approved: true,
    requiresConfirmation: false,
    reason: "All checks passed.",
    issues: [],
    summary: `${cart.items.length} item(s) · ₹${subtotal.toLocaleString("en-IN")}. Ready to checkout.`,
  };
}

function block(code: string, message: string): PolicyResult {
  return {
    approved: false,
    requiresConfirmation: false,
    reason: message,
    issues: [{ type: "error", code, message }],
    summary: message,
  };
}

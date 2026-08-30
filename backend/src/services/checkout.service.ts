import { prisma } from "../db/prisma.js";
import { validateCartPolicy } from "./policy.service.js";
import { auditLog } from "./audit.service.js";
import Razorpay from "razorpay";
import crypto from "crypto";

function getRazorpay() {
  return new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID ?? "",
    key_secret: process.env.RAZORPAY_KEY_SECRET ?? "",
  });
}

// ─── Create checkout ──────────────────────────────────────────────────────────

export async function createCheckout(userId: string, agentGrantId?: string) {
  // Find active cart
  const cart = await prisma.cart.findFirst({
    where: { userId, status: "active" },
    include: {
      items: {
        include: { product: true, variant: true },
      },
    },
  });

  if (!cart || cart.items.length === 0) {
    throw new Error("EMPTY_CART");
  }

  // Run policy validation
  const policy = await validateCartPolicy(cart.id, userId);

  if (!policy.approved) {
    throw Object.assign(new Error("POLICY_REJECTED"), { policy });
  }

  // Calculate subtotal from current prices (revalidated)
  const subtotal = cart.items.reduce(
    (s, i) => s + i.variant.priceAmount * i.quantity,
    0
  );

  // Create checkout record
  const checkout = await prisma.checkout.create({
    data: {
      cartId: cart.id,
      userId,
      status: "pending",
      policyResult: policy as object,
      subtotal,
    },
  });

  // Create Razorpay order
  const razorpay = getRazorpay();
  const rpOrder = await razorpay.orders.create({
    amount: subtotal * 100, // Razorpay expects paise
    currency: "INR",
    receipt: checkout.id,
    notes: {
      checkoutId: checkout.id,
      userId,
    },
  });

  // Save Razorpay order ID
  const updated = await prisma.checkout.update({
    where: { id: checkout.id },
    data: { razorpayOrderId: rpOrder.id, status: "confirmed" },
  });

  await auditLog({
    userId,
    agentGrantId,
    action: "checkout.create",
    payload: { checkoutId: checkout.id, razorpayOrderId: rpOrder.id, subtotal },
  });

  return {
    checkoutId: checkout.id,
    subtotal,
    currency: "INR",
    razorpayOrderId: rpOrder.id,
    razorpayKeyId: process.env.RAZORPAY_KEY_ID ?? "",
    requiresConfirmation: policy.requiresConfirmation,
    policyWarnings: policy.issues.filter((i) => i.type === "warning"),
    status: updated.status,
  };
}

// ─── Get checkout ─────────────────────────────────────────────────────────────

export async function getCheckout(checkoutId: string, userId: string) {
  const checkout = await prisma.checkout.findUnique({
    where: { id: checkoutId },
    include: {
      cart: {
        include: {
          items: { include: { product: true, variant: true } },
        },
      },
    },
  });

  if (!checkout || checkout.userId !== userId) {
    throw new Error("CHECKOUT_NOT_FOUND");
  }

  return checkout;
}

// ─── Confirm checkout (verify Razorpay payment) ───────────────────────────────

export async function confirmCheckout(
  checkoutId: string,
  userId: string,
  razorpayPaymentId: string,
  razorpaySignature: string,
  agentGrantId?: string
) {
  const checkout = await prisma.checkout.findUnique({
    where: { id: checkoutId },
    include: {
      cart: {
        include: {
          items: { include: { product: true, variant: true } },
        },
      },
    },
  });

  if (!checkout || checkout.userId !== userId) {
    throw new Error("CHECKOUT_NOT_FOUND");
  }
  if (checkout.status === "paid") {
    throw new Error("ALREADY_PAID");
  }
  if (!checkout.razorpayOrderId) {
    throw new Error("NO_RAZORPAY_ORDER");
  }

  // Verify Razorpay signature
  const expectedSig = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET ?? "")
    .update(`${checkout.razorpayOrderId}|${razorpayPaymentId}`)
    .digest("hex");

  if (expectedSig !== razorpaySignature) {
    await auditLog({
      userId,
      agentGrantId,
      action: "checkout.signature_mismatch",
      payload: { checkoutId },
    });
    throw new Error("INVALID_SIGNATURE");
  }

  // Mark checkout as paid
  await prisma.checkout.update({
    where: { id: checkoutId },
    data: {
      status: "paid",
      razorpayPaymentId,
      razorpaySignature,
    },
  });

  // Build order items snapshot
  const itemsSnapshot = checkout.cart.items.map((i) => ({
    productId: i.productId,
    productName: i.product.name,
    brand: i.product.brand,
    variantSku: i.variantSku,
    attributes: i.variant.attributes,
    quantity: i.quantity,
    price: i.variant.priceAmount,
    subtotal: i.variant.priceAmount * i.quantity,
  }));

  const total = itemsSnapshot.reduce((s, i) => s + i.subtotal, 0);

  // Create order
  const order = await prisma.order.create({
    data: {
      checkoutId,
      userId,
      status: "placed",
      total,
      itemsJson: itemsSnapshot,
    },
  });

  // Mark cart as checked out
  await prisma.cart.update({
    where: { id: checkout.cartId },
    data: { status: "checked_out" },
  });

  await auditLog({
    userId,
    agentGrantId,
    action: "checkout.confirmed",
    payload: { checkoutId, orderId: order.id, total },
  });

  return {
    orderId: order.id,
    status: order.status,
    total,
    currency: "INR",
    items: itemsSnapshot,
  };
}

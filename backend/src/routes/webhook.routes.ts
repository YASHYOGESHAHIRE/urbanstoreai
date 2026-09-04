/**
 * Razorpay server-to-server webhook handler.
 *
 * Razorpay sends payment events directly to this endpoint — independent of the
 * browser tab. This means an order is confirmed even if the user closes the tab
 * right after payment.
 *
 * Security: every request is verified with HMAC-SHA256 using RAZORPAY_WEBHOOK_SECRET.
 * Reject any request that fails signature verification — do not process it.
 *
 * Setup in Razorpay Dashboard → Settings → Webhooks:
 *   URL: https://your-backend.com/webhooks/razorpay
 *   Events: payment.captured, payment.failed
 *   Secret: set RAZORPAY_WEBHOOK_SECRET in your env
 */

import { FastifyInstance, FastifyRequest } from "fastify";
import { createHmac } from "crypto";
import { prisma } from "../db/prisma.js";
import { confirmCheckout } from "../services/checkout.service.js";
import { auditLog } from "../services/audit.service.js";

const WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET ?? "";

function verifyWebhookSignature(body: Buffer, signature: string): boolean {
  if (!WEBHOOK_SECRET) {
    // If no secret is configured, skip verification (dev-only fallback)
    console.warn("[webhook] RAZORPAY_WEBHOOK_SECRET not set — skipping signature check");
    return true;
  }
  const expected = createHmac("sha256", WEBHOOK_SECRET)
    .update(body)
    .digest("hex");
  return expected === signature;
}

export async function webhookRoutes(app: FastifyInstance) {

  // POST /webhooks/razorpay
  // The raw body bytes stored by the content-type parser in server.ts MUST be
  // used for HMAC verification — JSON.stringify(request.body) does NOT produce
  // byte-identical output to the original Razorpay payload (key ordering,
  // whitespace, and unicode escapes all diverge) and would cause every
  // signature check to fail in production.
  app.post(
    "/webhooks/razorpay",
    async (request: FastifyRequest, reply) => {
      const signature = request.headers["x-razorpay-signature"] as string | undefined;
      const rawBodyBuffer =
        (request as unknown as { rawBodyBuffer?: Buffer }).rawBodyBuffer ??
        // Fallback only if the content-type parser somehow did not attach it
        // (e.g. empty body). Empty JSON bodies can't contain Razorpay data,
        // so this is defensive.
        Buffer.from("");

      // ── Signature verification ─────────────────────────────────────────────
      if (!signature || !verifyWebhookSignature(rawBodyBuffer, signature)) {
        await auditLog({
          action: "webhook.signature_mismatch",
          payload: { source: "razorpay", reason: "invalid_signature" },
        });
        return reply.code(400).send({ error: "INVALID_SIGNATURE" });
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const event = request.body as any;
      const eventType: string = event?.event ?? "";

      // ── payment.captured ──────────────────────────────────────────────────
      if (eventType === "payment.captured") {
        const payment = event?.payload?.payment?.entity;
        if (!payment) return reply.send({ ok: true });

        const razorpayOrderId: string = payment.order_id;
        const razorpayPaymentId: string = payment.id;

        // Find the checkout by razorpayOrderId
        const checkout = await prisma.checkout.findFirst({
          where: { razorpayOrderId },
        });

        if (!checkout) {
          // May have been confirmed already via browser — that's fine
          return reply.send({ ok: true, note: "checkout_not_found" });
        }

        if (checkout.status === "paid") {
          // Already confirmed — idempotent, nothing to do
          return reply.send({ ok: true, note: "already_paid" });
        }

        try {
          // Webhook events don't carry the Razorpay signature that frontend does
          // (that's the order|payment HMAC). We bypass it here since we already
          // verified the webhook's own signature above. Pass empty string for sig.
          await confirmCheckout(
            checkout.id,
            checkout.userId,
            razorpayPaymentId,
            "", // signature verified at webhook level — skip payment-level check
            undefined,
            true  // skipSignatureVerification flag
          );

          await auditLog({
            userId: checkout.userId,
            action: "webhook.payment_captured",
            payload: { razorpayOrderId, razorpayPaymentId, checkoutId: checkout.id },
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          await auditLog({
            userId: checkout.userId,
            action: "webhook.payment_failed",
            payload: { razorpayOrderId, razorpayPaymentId, error: msg },
          });
          // Return 200 to Razorpay to prevent retries on stock errors
          return reply.send({ ok: false, error: msg });
        }

        return reply.send({ ok: true });
      }

      // ── payment.failed ────────────────────────────────────────────────────
      if (eventType === "payment.failed") {
        const payment = event?.payload?.payment?.entity;
        const razorpayOrderId: string = payment?.order_id ?? "";
        const errorCode: string = payment?.error_code ?? "UNKNOWN";

        const checkout = await prisma.checkout.findFirst({
          where: { razorpayOrderId },
        });

        if (checkout && checkout.status !== "paid") {
          await prisma.checkout.update({
            where: { id: checkout.id },
            data: { status: "failed" },
          });
          await auditLog({
            userId: checkout.userId,
            action: "webhook.payment_failed",
            payload: { razorpayOrderId, errorCode, checkoutId: checkout.id },
          });
        }

        return reply.send({ ok: true });
      }

      // Unhandled event — acknowledge to prevent Razorpay retries
      return reply.send({ ok: true, note: "unhandled_event" });
    }
  );
}

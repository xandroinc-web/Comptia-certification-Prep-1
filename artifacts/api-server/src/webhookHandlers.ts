import Stripe from "stripe";
import { getStripeSync } from "./stripeClient.js";
import { handleOneTimeGrantEvent, type GrantStripeClient } from "./lib/oneTimeGrants.js";
import { handleMembershipSubscriptionEvent } from "./lib/membershipGrants.js";
import { logger } from "./lib/logger.js";

export class WebhookHandlers {
  static async processWebhook(payload: Buffer, signature: string): Promise<void> {
    if (!Buffer.isBuffer(payload)) {
      throw new Error(
        "STRIPE WEBHOOK ERROR: Payload must be a Buffer. " +
        "This usually means express.json() parsed the body before reaching this handler. " +
        "FIX: Ensure webhook route is registered BEFORE app.use(express.json())."
      );
    }

    const sync = await getStripeSync();
    // Mirrors the raw Stripe object into the `stripe.*` tables. It verifies
    // the signature internally but does NOT write entitlements — that is
    // the grant step below.
    await sync.processWebhook(payload, signature);

    // One-time purchases → entitlements. The event is re-constructed
    // locally (HMAC verification only, no Stripe API call) because
    // StripeSync does not return the parsed event.
    try {
      const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
      if (!webhookSecret) {
        logger.warn("STRIPE_WEBHOOK_SECRET is not set; skipping one-time entitlement grant step");
        return;
      }
      const secretKey = process.env.STRIPE_SECRET_KEY;
      if (!secretKey) {
        logger.warn("STRIPE_SECRET_KEY is not set; skipping one-time entitlement grant step");
        return;
      }
      const stripe = new Stripe(secretKey);
      const event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
      // The Stripe SDK client structurally satisfies GrantStripeClient
      // (listLineItems / prices.retrieve / customers.retrieve /
      // subscriptions.retrieve); the cast bridges the SDK's narrower
      // param types.
      const result = await handleOneTimeGrantEvent(event, stripe as unknown as GrantStripeClient);
      if (result.handled) {
        logger.info({ detail: result.detail }, "One-time purchase entitlement granted via webhook");
      } else {
        logger.debug({ detail: result.detail, eventType: event.type }, "Webhook: no one-time grant");
      }
      // Practice Membership subscriptions → entitlements row (grant on
      // checkout, extend on renewal, revoke when the subscription
      // ends). Runs after the one-time step; both are idempotent, so a
      // redelivery is safe.
      try {
        const membership = await handleMembershipSubscriptionEvent(
          event,
          stripe as unknown as GrantStripeClient,
        );
        if (membership.handled) {
          logger.info({ detail: membership.detail }, "Practice Membership updated via webhook");
        } else {
          logger.debug({ detail: membership.detail, eventType: event.type }, "Webhook: no membership change");
        }
      } catch (membershipErr) {
        logger.error({ err: membershipErr }, "Membership grant failed after Stripe sync");
        throw membershipErr;
      }
    } catch (err) {
      // A failure here must fail the webhook (non-2xx → Stripe redelivers)
      // rather than silently dropping a paid purchase. The sync above is
      // an upsert, and the grant is idempotent, so redelivery is safe.
      logger.error({ err }, "One-time entitlement grant failed after Stripe sync");
      throw err;
    }
  }
}

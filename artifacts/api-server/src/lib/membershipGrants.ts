/**
 * Practice Membership subscription → entitlement grants (new pricing
 * model, Nov 13 2026 — "Taste. Train. Prove.").
 *
 * A Practice Membership checkout ($20/mo, mode = "subscription") grants
 * practice access via an `entitlements` row (plan = 'membership') that
 * lasts until the end of the current billing period. Renewals extend
 * it; when the subscription ends, the row is revoked. Membership
 * grants NO sim attempts — those come only from one-time test
 * purchases (see oneTimeGrants.ts).
 *
 * EVENTS HANDLED
 * --------------
 *  checkout.session.completed / .async_payment_succeeded (mode =
 *    "subscription"): grant membership to the end of the period, but
 *    only when the subscription has a price with metadata
 *    plan=membership. Other subscriptions are ignored.
 *  customer.subscription.updated: extend the membership row while the
 *    subscription is active/trialing with a membership price; revoke
 *    it when a membership-priced subscription ends (canceled /
 *    past_due / unpaid / incomplete_expired). Stripe keeps a
 *    cancel-at-period-end subscription 'active' until the period ends,
 *    so revoking on 'canceled' is safe.
 *  customer.subscription.deleted: revoke the membership row (only when
 *    the deleted subscription was membership-priced).
 *  invoice.payment_succeeded: renewal safety net — extend the row to
 *    the new period end.
 *
 * USER RESOLUTION: same order as one-time grants (see
 * resolveCheckoutUserId / resolveUserIdByCustomer in oneTimeGrants.ts).
 * If no Supabase user resolves, the event is logged and skipped — never
 * granted to the wrong user, never guessed.
 */
import type Stripe from "stripe";
import { db } from "@workspace/db";
import { entitlementsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { logger } from "./logger.js";
import {
  resolveCheckoutUserId,
  resolveUserIdByCustomer,
  type GrantStripeClient,
} from "./oneTimeGrants.js";
import { subscriptionPeriodEnd } from "./access.js";

function hasMembershipPrice(subscription: Stripe.Subscription): boolean {
  return subscription.items.data.some((item) => item.price.metadata?.plan === "membership");
}

function periodEnd(subscription: Stripe.Subscription): Date | null {
  return subscriptionPeriodEnd(subscription);
}

/**
 * Write (or extend) a membership row. Idempotent: a row already
 * expiring at or after the new expiry is kept.
 */
export async function applyMembershipGrant(
  userId: string,
  expiresAt: Date | null,
  stripeCustomerId: string | null,
): Promise<{ applied: boolean; reason: string }> {
  const [existing] = await db
    .select()
    .from(entitlementsTable)
    .where(eq(entitlementsTable.userId, userId))
    .limit(1);

  if (
    existing &&
    existing.plan === "membership" &&
    existing.expiresAt &&
    expiresAt &&
    existing.expiresAt.getTime() >= expiresAt.getTime()
  ) {
    return { applied: false, reason: "same membership grant already held" };
  }

  await db
    .insert(entitlementsTable)
    .values({
      userId,
      plan: "membership",
      examScope: null,
      expiresAt,
      stripeCustomerId: stripeCustomerId ?? existing?.stripeCustomerId ?? null,
    })
    .onConflictDoUpdate({
      target: entitlementsTable.userId,
      set: {
        plan: "membership",
        examScope: null,
        expiresAt,
        stripeCustomerId: stripeCustomerId ?? existing?.stripeCustomerId ?? null,
        updatedAt: new Date(),
      },
    });

  logger.info(
    { userId, expiresAt: expiresAt?.toISOString() ?? null },
    "Practice Membership granted",
  );
  return { applied: true, reason: "grant applied" };
}

/** End practice access when the subscription ends. A no-op when the user holds no membership row. */
export async function revokeMembershipGrant(
  userId: string,
): Promise<{ applied: boolean; reason: string }> {
  const [existing] = await db
    .select()
    .from(entitlementsTable)
    .where(eq(entitlementsTable.userId, userId))
    .limit(1);
  if (!existing || existing.plan !== "membership") {
    return { applied: false, reason: "no membership row to revoke" };
  }
  await db
    .update(entitlementsTable)
    .set({ plan: "free", expiresAt: null, updatedAt: new Date() })
    .where(eq(entitlementsTable.userId, userId));
  logger.info({ userId }, "Practice Membership revoked (subscription ended)");
  return { applied: true, reason: "grant revoked" };
}

async function handleSubscriptionCheckout(
  session: Stripe.Checkout.Session,
  stripe: GrantStripeClient,
): Promise<{ handled: boolean; detail: string }> {
  if (session.mode !== "subscription") {
    return { handled: false, detail: "not a subscription checkout" };
  }
  const subscriptionId =
    typeof session.subscription === "string" ? session.subscription : session.subscription?.id ?? null;
  if (!subscriptionId) {
    return { handled: false, detail: "subscription checkout has no subscription id" };
  }
  const userId = await resolveCheckoutUserId(session, stripe);
  if (!userId) {
    logger.error(
      { sessionId: session.id, customer: session.customer ?? null },
      "Paid subscription checkout could not be linked to a Supabase user; grant SKIPPED — manual follow-up needed",
    );
    return { handled: false, detail: "subscription checkout could not be linked to a Supabase user" };
  }
  const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
    expand: ["items.data.price"],
  });
  if (!hasMembershipPrice(subscription)) {
    return { handled: false, detail: "subscription is not a Practice Membership price" };
  }
  const customerId =
    typeof session.customer === "string" ? session.customer : session.customer?.id ?? null;
  const result = await applyMembershipGrant(userId, periodEnd(subscription), customerId);
  return {
    handled: result.applied,
    detail: `membership → ${userId}: ${result.reason}`,
  };
}

async function handleSubscriptionChange(
  subscription: Stripe.Subscription,
  stripe: GrantStripeClient,
  isDelete: boolean,
): Promise<{ handled: boolean; detail: string }> {
  // The event object may carry unexpanded prices, so re-fetch with the
  // price expanded to check the plan metadata authoritatively.
  const fresh = await stripe.subscriptions.retrieve(subscription.id, {
    expand: ["items.data.price"],
  });
  if (!hasMembershipPrice(fresh)) {
    return { handled: false, detail: "subscription is not a Practice Membership price" };
  }
  const customerId =
    typeof fresh.customer === "string" ? fresh.customer : fresh.customer?.id ?? null;
  if (!customerId) {
    return { handled: false, detail: "subscription event has no customer" };
  }
  const userId = await resolveUserIdByCustomer(customerId, stripe);
  if (!userId) {
    logger.error(
      { subscriptionId: subscription.id, customer: customerId },
      "Subscription event could not be linked to a Supabase user; SKIPPED — manual follow-up needed",
    );
    return { handled: false, detail: "subscription event could not be linked to a Supabase user" };
  }
  if (isDelete || (fresh.status !== "active" && fresh.status !== "trialing")) {
    const result = await revokeMembershipGrant(userId);
    return {
      handled: result.applied,
      detail: `membership revoked (${fresh.status}) → ${userId}: ${result.reason}`,
    };
  }
  const result = await applyMembershipGrant(userId, periodEnd(fresh), customerId);
  return {
    handled: result.applied,
    detail: `membership renewed/extended → ${userId}: ${result.reason}`,
  };
}

/**
 * Handle one verified Stripe event for Practice Membership. Returns what
 * happened for logging / tests. Events that are not membership-related
 * return handled=false (never throws for "not applicable").
 */
export async function handleMembershipSubscriptionEvent(
  event: Stripe.Event,
  stripe: GrantStripeClient,
): Promise<{ handled: boolean; detail: string }> {
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const session = event.data.object as Stripe.Checkout.Session;
      return handleSubscriptionCheckout(session, stripe);
    }
    case "customer.subscription.updated": {
      const subscription = event.data.object as Stripe.Subscription;
      return handleSubscriptionChange(subscription, stripe, false);
    }
    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      return handleSubscriptionChange(subscription, stripe, true);
    }
    case "invoice.payment_succeeded": {
      const invoice = event.data.object as Stripe.Invoice;
      // In this Stripe SDK version the subscription lives under
      // parent.subscription_details, not invoice.subscription.
      const parentSub = invoice.parent?.subscription_details?.subscription ?? null;
      const subscriptionId =
        typeof parentSub === "string" ? parentSub : parentSub?.id ?? null;
      if (!subscriptionId) {
        return { handled: false, detail: "invoice has no subscription" };
      }
      const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
        expand: ["items.data.price"],
      });
      if (
        !hasMembershipPrice(subscription) ||
        (subscription.status !== "active" && subscription.status !== "trialing")
      ) {
        return { handled: false, detail: "invoice is not for an active Practice Membership" };
      }
      const customerId =
        typeof subscription.customer === "string"
          ? subscription.customer
          : subscription.customer?.id ?? null;
      if (!customerId) {
        return { handled: false, detail: "subscription has no customer" };
      }
      const userId = await resolveUserIdByCustomer(customerId, stripe);
      if (!userId) {
        return { handled: false, detail: "invoice could not be linked to a Supabase user" };
      }
      const result = await applyMembershipGrant(userId, periodEnd(subscription), customerId);
      return {
        handled: result.applied,
        detail: `membership renewed (invoice) → ${userId}: ${result.reason}`,
      };
    }
    default:
      return { handled: false, detail: `event ${event.type} cannot grant membership` };
  }
}

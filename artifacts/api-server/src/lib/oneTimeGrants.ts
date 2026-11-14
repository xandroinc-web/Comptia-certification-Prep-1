/**
 * One-time purchase → sim-attempt grants (new pricing model, Nov 13 2026 —
 * "Taste. Train. Prove.").
 *
 * The Stripe webhook sync (stripe-replit-sync) only mirrors raw Stripe
 * objects into the `stripe.*` tables — it never writes entitlements.
 * This module is the bridge: after the sync runs, the webhook handler
 * passes a verified `checkout.session.completed` event here, and a paid
 * one-time (mode = "payment") session grants sim attempts in the
 * `sim_attempts` table — never an `entitlements` row. Practice and the
 * test are two different products: a test purchase grants NO practice,
 * and membership grants NO sims (see membershipGrants.ts).
 *
 * HOW A GRANT IS DECIDED
 * -----------------------
 * The grant comes from the PRICE's Stripe metadata — the source of truth
 * set when the price was created (see scripts/src/seed-products.ts):
 *
 *   metadata.grant = "test"         + metadata.exam = "A+" | "Network+" | "Security+"
 *   metadata.grant = "bundle_tests"
 *
 * SUPERSEDED (Nov 13): the old grant keys "single" and "bundle" — and
 * any unknown grant key — return NO grant. Their Stripe TEST prices were
 * archived, so a checkout with one cannot be created; if one somehow
 * reaches the webhook (e.g. an in-flight session from before the
 * change), it grants nothing. The Pro $129 / $149 one-time prices were
 * dropped earlier and never had grant keys.
 *
 * Subscription-mode sessions are ignored here: Practice Membership is
 * handled by membershipGrants.ts, not from this table.
 *
 * DURATIONS — owner-locked assumptions, named here in one place so the
 * owner can change them without touching the mapping:
 *   Full Test (one attempt) → 90 days
 *   Trifecta Tests (one attempt per exam) → 90 days
 *
 * USER RESOLUTION (in order): session.metadata.supabaseUserId (set at
 * checkout creation) → session.client_reference_id → the
 * `stripe_customers` table (customer → Supabase user) → the Stripe
 * customer's metadata.userId. If none resolves, the grant is logged
 * and skipped — never granted to the wrong user, never guessed.
 *
 * IDEMPOTENCY: applyTestAttemptGrant() records the Stripe checkout
 * session id on each attempt row (`lastSessionId`). A re-delivered
 * webhook with the same session id is a no-op for that exam. Buying
 * a second Full Test for the same exam stacks +1 attempt and extends
 * the expiry to the later of the two.
 */
import type Stripe from "stripe";
import { db } from "@workspace/db";
import { simAttemptsTable, type ExamScope } from "@workspace/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { logger } from "./logger.js";
import { EXAMS } from "./questionBank.js";

/**
 * One-time grant durations (owner-locked assumptions — change the numbers
 * here and the webhook, seed script and docs all follow).
 * Full Test = 90 days, Trifecta Tests = 90 days.
 */
export const ONE_TIME_GRANT_DURATIONS = {
  TEST_ATTEMPT_DAYS: 90,
  BUNDLE_TESTS_DAYS: 90,
} as const;

export type TestAttemptGrantKind = "test" | "bundle_tests";

export interface TestAttemptGrant {
  kind: TestAttemptGrantKind;
  /** Exams this grant covers (one exam for a Full Test, all three for Trifecta Tests). */
  exams: ExamScope[];
  expiresAt: Date;
  /** Price metadata grant key that produced this grant (audit trail). */
  grantKey: string;
}

function addDays(now: Date, days: number): Date {
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
}

function isExamScope(value: unknown): value is ExamScope {
  return typeof value === "string" && (EXAMS as string[]).includes(value);
}

/**
 * Pure mapping: Stripe price metadata → sim-attempt grant.
 * Returns null when the metadata does not describe a test-attempt grant
 * — including the superseded 'single' / 'bundle' keys, which grant
 * nothing under the new model.
 */
export function grantForPriceMetadata(
  metadata: Record<string, string | null | undefined> | null | undefined,
  now = new Date(),
): TestAttemptGrant | null {
  const grant = metadata?.grant;
  if (!grant) return null;
  switch (grant) {
    case "test": {
      const exam = metadata?.exam;
      if (!isExamScope(exam)) {
        logger.warn({ grant, exam: exam ?? null }, "Full Test grant price is missing a valid exam in metadata; skipping");
        return null;
      }
      return {
        kind: "test",
        exams: [exam],
        expiresAt: addDays(now, ONE_TIME_GRANT_DURATIONS.TEST_ATTEMPT_DAYS),
        grantKey: "test",
      };
    }
    case "bundle_tests":
      return {
        kind: "bundle_tests",
        exams: [...(EXAMS as ExamScope[])],
        expiresAt: addDays(now, ONE_TIME_GRANT_DURATIONS.BUNDLE_TESTS_DAYS),
        grantKey: "bundle_tests",
      };
    case "single":
    case "bundle":
      logger.warn(
        { grant },
        "Superseded one-time grant key in price metadata (old Single/Bundle product); no grant under the new model",
      );
      return null;
    default:
      logger.warn({ grant }, "Unknown one-time grant key in price metadata; skipping");
      return null;
  }
}

/** Minimal Stripe surface this module needs (lets tests pass a stub). */
export interface GrantStripeClient {
  checkout: {
    sessions: {
      listLineItems: (
        sessionId: string,
        params?: Record<string, unknown>,
      ) => Promise<{ data: Array<{ price?: { id?: string } | string | null }> }>;
    };
  };
  prices: {
    retrieve: (priceId: string) => Promise<{ id: string; metadata?: Record<string, string> | null }>;
  };
  customers: {
    retrieve: (customerId: string) => Promise<{ metadata?: Record<string, string> | null }>;
  };
  subscriptions: {
    retrieve: (
      subscriptionId: string,
      params?: Record<string, unknown>,
    ) => Promise<Stripe.Subscription>;
  };
}

export interface ResolvedTestAttemptGrant {
  userId: string;
  stripeCustomerId: string | null;
  grant: TestAttemptGrant;
  priceId: string;
}

/**
 * Resolve a completed one-time Checkout session to a test-attempt grant.
 * Returns null when the session is not a paid one-time purchase, when no
 * line item maps to a grant, or when no Supabase user can be resolved.
 * Never throws for "not applicable" sessions; throws only on Stripe/DB
 * failures so the webhook caller can retry (non-2xx → Stripe redelivers).
 */
export async function resolveTestAttemptGrant(
  session: Stripe.Checkout.Session,
  stripe: GrantStripeClient,
  now = new Date(),
): Promise<ResolvedTestAttemptGrant | null> {
  if (session.mode !== "payment") return null;
  if (session.payment_status !== "paid") {
    logger.info(
      { sessionId: session.id, paymentStatus: session.payment_status },
      "Checkout session completed but not paid; no test attempt granted",
    );
    return null;
  }

  const userId = await resolveCheckoutUserId(session, stripe);
  if (!userId) {
    logger.error(
      { sessionId: session.id, customer: session.customer ?? null },
      "Paid one-time checkout could not be linked to a Supabase user; grant SKIPPED — manual follow-up needed",
    );
    return null;
  }

  const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id ?? null;

  const lineItems = await stripe.checkout.sessions.listLineItems(session.id, {
    limit: 100,
    expand: ["data.price"],
  });
  for (const item of lineItems.data) {
    const priceId = typeof item.price === "string" ? item.price : item.price?.id;
    if (!priceId) continue;
    const price = await stripe.prices.retrieve(priceId);
    const grant = grantForPriceMetadata(price.metadata ?? {}, now);
    if (!grant) continue;
    return { userId, stripeCustomerId: customerId, grant, priceId };
  }

  logger.warn(
    { sessionId: session.id, userId },
    "Paid one-time checkout has no line item with a known grant mapping; no test attempt granted",
  );
  return null;
}

export async function resolveCheckoutUserId(
  session: Stripe.Checkout.Session,
  stripe: GrantStripeClient,
): Promise<string | null> {
  const fromSession =
    session.metadata?.supabaseUserId ?? session.client_reference_id ?? null;
  if (fromSession) return fromSession;

  const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id ?? null;
  if (!customerId) return null;
  return resolveUserIdByCustomer(customerId, stripe);
}

/** Supabase user id for a Stripe customer: the mirrored table first, then the customer's metadata. */
export async function resolveUserIdByCustomer(
  customerId: string,
  stripe: GrantStripeClient,
): Promise<string | null> {
  try {
    const row = await db.execute(
      sql`SELECT clerk_user_id FROM stripe_customers WHERE stripe_customer_id = ${customerId} LIMIT 1`,
    );
    // NOTE: the stripe_customers.clerk_user_id column predates the
    // Supabase Auth migration and now stores Supabase user UUIDs
    // (the column was kept to avoid a live-DB rename; it is TEXT).
    const supabaseUserId = (row.rows[0] as { clerk_user_id?: string } | undefined)?.clerk_user_id;
    if (supabaseUserId) return supabaseUserId;
  } catch (err) {
    logger.error({ err, customerId }, "stripe_customers lookup failed during grant resolution");
    throw err;
  }

  try {
    const customer = await stripe.customers.retrieve(customerId);
    return customer.metadata?.userId ?? null;
  } catch (err) {
    logger.error({ err, customerId }, "Stripe customer retrieve failed during grant resolution");
    throw err;
  }
}

/**
 * Grant sim attempts for a purchase. A second purchase of the same exam
 * stacks +1 attempt and extends the expiry to the later of the two.
 * Idempotent: a re-delivered webhook (same checkout session id) is a
 * no-op for that exam. An expired row is reset to exactly 1 attempt
 * with the new expiry (stale attempts never stack onto an expired row).
 */
export async function applyTestAttemptGrant(
  userId: string,
  grant: TestAttemptGrant,
  stripeCustomerId: string | null,
  sessionId: string,
): Promise<{ applied: boolean; reason: string }> {
  let appliedAny = false;
  const skipped: string[] = [];
  for (const exam of grant.exams) {
    const [existing] = await db
      .select()
      .from(simAttemptsTable)
      .where(and(eq(simAttemptsTable.userId, userId), eq(simAttemptsTable.exam, exam)))
      .limit(1);

    if (existing && existing.lastSessionId === sessionId) {
      skipped.push(exam);
      continue;
    }

    const now = Date.now();
    const expired = !existing || !existing.expiresAt || existing.expiresAt.getTime() <= now;
    const remaining = expired ? 1 : (existing?.remaining ?? 0) + 1;
    const expiresAt = expired
      ? grant.expiresAt
      : new Date(Math.max(existing!.expiresAt!.getTime(), grant.expiresAt.getTime()));

    await db
      .insert(simAttemptsTable)
      .values({
        userId,
        exam,
        remaining,
        expiresAt,
        lastSessionId: sessionId,
      })
      .onConflictDoUpdate({
        target: [simAttemptsTable.userId, simAttemptsTable.exam],
        set: {
          remaining,
          expiresAt,
          lastSessionId: sessionId,
          updatedAt: new Date(),
        },
      });
    appliedAny = true;
    logger.info(
      { userId, exam, remaining, expiresAt: expiresAt.toISOString() },
      "Full-test attempt granted",
    );
  }

  if (!appliedAny) {
    return { applied: false, reason: `already granted for this session (${skipped.join(", ")})` };
  }
  return {
    applied: true,
    reason: skipped.length > 0 ? `grant applied; already held for ${skipped.join(", ")}` : "grant applied",
  };
}

/**
 * Handle one verified Stripe event. Only `checkout.session.completed`
 * (and its async-payment sibling) can grant; everything else is ignored.
 * Returns what happened for logging / tests.
 */
export async function handleOneTimeGrantEvent(
  event: Stripe.Event,
  stripe: GrantStripeClient,
  now = new Date(),
): Promise<{ handled: boolean; detail: string }> {
  if (
    event.type !== "checkout.session.completed" &&
    event.type !== "checkout.session.async_payment_succeeded"
  ) {
    return { handled: false, detail: `event ${event.type} cannot grant test attempts` };
  }
  const session = event.data.object as Stripe.Checkout.Session;
  const resolved = await resolveTestAttemptGrant(session, stripe, now);
  if (!resolved) {
    return { handled: false, detail: "no test-attempt grant resolved for this session" };
  }
  const result = await applyTestAttemptGrant(
    resolved.userId,
    resolved.grant,
    resolved.stripeCustomerId,
    session.id,
  );
  return {
    handled: result.applied,
    detail: `${resolved.grant.grantKey} (${resolved.grant.exams.join("+")}) → ${resolved.userId}: ${result.reason}`,
  };
}

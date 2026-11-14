/**
 * Access resolution under the new pricing model (Nov 13 2026 —
 * "Taste. Train. Prove.").
 *
 * Practice and the test are two different products:
 *  - Practice Membership ($20/mo) grants unlimited PRACTICE (fast/full/
 *    tier quizzes, drills, all exams). It grants NO full-test attempts.
 *  - A Full Test purchase ($9.99/exam, one-time) grants ONE sim attempt
 *    for that exam (90 days). A Trifecta Tests purchase ($24.99) grants
 *    ONE attempt per exam (90 days). A test purchase grants NO practice.
 *  - Admins (ADMIN_USER_IDS) bypass everything — the no-lockout rule.
 *
 * Membership is true when ANY of these hold:
 *  1. The Supabase user id is in ADMIN_USER_IDS.
 *  2. The `entitlements` table has a 'membership' row that is not expired.
 *  3. Stripe reports an active/trialing subscription whose price carries
 *     metadata plan=membership (live SDK check; a Stripe failure
 *     soft-fails to "not a member via Stripe" rather than 500ing).
 *
 * Legacy 'pro' / 'bundle' / 'single' entitlement rows grant NOTHING.
 * Their Stripe prices were archived and the webhook no longer writes
 * them. Test attempts live in the `sim_attempts` table and are
 * consumed atomically on sim start (consumeTestAttempt).
 */
import Stripe from "stripe";
import { db } from "@workspace/db";
import { entitlementsTable, simAttemptsTable, type ExamScope } from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";
import { isAdminUser } from "./entitlements.js";
import { logger } from "./logger.js";
import { EXAMS } from "./questionBank.js";

export interface MemberStatus {
  isMember: boolean;
  source: "admin" | "entitlement" | "stripe" | null;
  expiresAt: string | null;
}

/** Current period end of a subscription (lives on the items in this Stripe SDK version). */
export function subscriptionPeriodEnd(subscription: Stripe.Subscription): Date | null {
  const ends = subscription.items.data
    .map((item) => item.current_period_end)
    .filter((n): n is number => typeof n === "number");
  if (ends.length === 0) return null;
  return new Date(Math.max(...ends) * 1000);
}

export async function resolveMembership(userId: string | null): Promise<MemberStatus> {
  const notMember: MemberStatus = { isMember: false, source: null, expiresAt: null };
  if (!userId) return notMember;
  if (isAdminUser(userId)) return { isMember: true, source: "admin", expiresAt: null };

  const [row] = await db
    .select()
    .from(entitlementsTable)
    .where(eq(entitlementsTable.userId, userId))
    .limit(1);
  if (row && row.plan === "membership") {
    const expiresAt = row.expiresAt ? row.expiresAt.toISOString() : null;
    if (!row.expiresAt || row.expiresAt.getTime() > Date.now()) {
      return { isMember: true, source: "entitlement", expiresAt };
    }
  }

  // Live Stripe check: an active/trialing subscription only counts when
  // one of its prices carries plan=membership. An old Pro subscription,
  // if one still existed, must NOT grant practice.
  try {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) return notMember;
    const customerRow = await db.execute(
      sql`SELECT stripe_customer_id FROM stripe_customers WHERE clerk_user_id = ${userId} LIMIT 1`,
    );
    const customerId = (customerRow.rows[0] as { stripe_customer_id?: string } | undefined)?.stripe_customer_id;
    if (!customerId) return notMember;
    const stripe = new Stripe(secretKey);
    for (const status of ["active", "trialing"] as const) {
      const subs = await stripe.subscriptions.list({
        customer: customerId,
        status,
        limit: 10,
        expand: ["data.items.data.price"],
      });
      for (const sub of subs.data) {
        const isMembership = sub.items.data.some((item) => item.price.metadata?.plan === "membership");
        if (!isMembership) continue;
        return { isMember: true, source: "stripe", expiresAt: subscriptionPeriodEnd(sub)?.toISOString() ?? null };
      }
    }
  } catch (err) {
    logger.warn({ err, userId }, "Live Stripe membership check failed; treating as not a member via Stripe");
  }
  return notMember;
}

export interface TestAttemptState {
  remaining: number;
  expiresAt: string | null;
}

export type TestAttemptMap = Record<ExamScope, TestAttemptState>;

export function emptyTestAttempts(): TestAttemptMap {
  const out = {} as TestAttemptMap;
  for (const exam of EXAMS as ExamScope[]) out[exam] = { remaining: 0, expiresAt: null };
  return out;
}

/** Unexpired sim attempts per exam for a user (anonymous callers have none). */
export async function getTestAttempts(userId: string): Promise<TestAttemptMap> {
  const out = emptyTestAttempts();
  const rows = await db.select().from(simAttemptsTable).where(eq(simAttemptsTable.userId, userId));
  const now = Date.now();
  for (const row of rows) {
    if (row.expiresAt && row.expiresAt.getTime() <= now) continue;
    out[row.exam] = {
      remaining: Math.max(0, row.remaining),
      expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
    };
  }
  return out;
}

/**
 * Atomically consume one sim attempt for (user, exam). Returns true when
 * an attempt was consumed, false when none was left (or it expired).
 * Admins never call this — they bypass attempts entirely.
 */
export async function consumeTestAttempt(userId: string, exam: ExamScope): Promise<boolean> {
  const result = await db.execute(sql`
    UPDATE sim_attempts
    SET remaining = remaining - 1, updated_at = NOW()
    WHERE user_id = ${userId}
      AND exam = ${exam}
      AND remaining > 0
      AND (expires_at IS NULL OR expires_at > NOW())
    RETURNING remaining
  `);
  return result.rows.length > 0;
}

export interface AccessState {
  isAdmin: boolean;
  isMember: boolean;
  membershipSource: MemberStatus["source"];
  membershipExpiresAt: string | null;
  testAttempts: TestAttemptMap;
}

export async function resolveAccess(userId: string | null): Promise<AccessState> {
  const membership = await resolveMembership(userId);
  const testAttempts = userId ? await getTestAttempts(userId) : emptyTestAttempts();
  return {
    isAdmin: userId !== null && isAdminUser(userId),
    isMember: membership.isMember,
    membershipSource: membership.source,
    membershipExpiresAt: membership.expiresAt,
    testAttempts,
  };
}

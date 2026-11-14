/**
 * Entitlements + free-usage helpers (P0-4).
 *
 * Membership (Practice Membership, $20/mo) is resolved in lib/access.ts
 * (resolveMembership): admin (ADMIN_USER_IDS — the no-lockout rule:
 * admin access never depends on billing), an unexpired 'membership'
 * row in the `entitlements` table, or a live Stripe subscription whose
 * price carries metadata plan=membership. Legacy 'pro' / 'bundle' /
 * 'single' rows grant nothing under the new model (Nov 13 2026,
 * "Taste. Train. Prove."). One-time test purchases grant sim attempts
 * in the `sim_attempts` table instead (see lib/access.ts +
 * lib/oneTimeGrants.ts), never entitlements rows.
 *
 * Free trial — ONE-TIME ONLY per user, ever (server-enforced, never
 * trusted from the client). No daily reset, no refills. The user
 * spends it ONE of two ways:
 *  (a) up to 30 free questions total (`FREE_QUESTIONS_TOTAL`), or
 *  (b) ONE free half-simulation (45 questions / 45 minutes).
 * Either/or: free questions are allowed only while lifetime questions
 * used < 30 AND no free sim has ever been used; a free sim is allowed
 * only while lifetime questions used == 0 AND no free sim has ever
 * been used. Once the taste is spent, further questions/sims need a
 * paid plan (or admin). Simulation questions do NOT consume the
 * question allowance.
 *  - Lifetime question count: sum of `free_usage` kind='question'
 *    across ALL dates for the identity.
 *  - Lifetime sim count: sum of `free_usage` kind='simulation'
 *    across ALL dates (1 total, not per exam); `exam` is still set
 *    on sim rows for telemetry.
 *  - kind='exam' rows are attempt telemetry only; nothing caps them.
 *
 * Identity: signed-in users are keyed by Supabase user id (a UUID);
 * anonymous users by `anonId`, a client-generated fingerprint stored in
 * localStorage. Anonymous callers can never be Pro and can never pass
 * a tier gate (tier unlocks are verified against signed-in results).
 */
import type { Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { freeUsageTable, quizResultsTable, type FreeUsageKind } from "@workspace/db/schema";
import { eq, and, isNull, sql } from "drizzle-orm";

export const FREE_QUESTIONS_TOTAL = 30;
export const FREE_SIMS_TOTAL = 1;
export const TIER_PASS_SCALED_SCORE = 750;

/** UTC calendar day (YYYY-MM-DD). Only the `usedDate` telemetry stamp on free-usage rows — the free-trial cap itself is lifetime, not daily. */
export function todayDateString(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

function getAdminIds(): Set<string> {
  return new Set(
    (process.env.ADMIN_USER_IDS ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
}

export function isAdminUser(userId: string | null): boolean {
  return userId !== null && getAdminIds().has(userId);
}

/** Supabase user id from the session (attached by supabaseAuth middleware), or null when anonymous / unauthenticated. Never throws. */
export function getOptionalUserId(req: Request): string | null {
  const userId = (req as unknown as { authUserId?: unknown })?.authUserId;
  return typeof userId === "string" ? userId : null;
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const userId = getOptionalUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  (req as unknown as { userId: string }).userId = userId;
  next();
}

export function getUserId(req: Request): string {
  return (req as unknown as { userId: string }).userId;
}

/** Has this signed-in user passed the given tier (>= 750 scaled) before? */
export async function hasPassedTier(userId: string, tier: number): Promise<boolean> {
  const rows = await db
    .select({ scaledScore: quizResultsTable.scaledScore })
    .from(quizResultsTable)
    .where(
      and(
        eq(quizResultsTable.userId, userId),
        eq(quizResultsTable.tier, tier),
        sql`${quizResultsTable.scaledScore} >= ${TIER_PASS_SCALED_SCORE}`,
      ),
    )
    .limit(1);
  return rows.length > 0;
}

export interface FreeUsageLifetime {
  /** Lifetime free questions used (all dates). */
  questionsUsed: number;
  /** Lifetime free sims used (all dates, all exams). */
  simsUsedTotal: number;
  /** Lifetime free sims used, by exam (telemetry/display). */
  simsUsedByExam: Record<string, number>;
  /** Lifetime exam attempts started (telemetry only). */
  examsUsed: number;
}

function identityCondition(userId: string | null, anonId: string | null) {
  if (userId) return eq(freeUsageTable.userId, userId);
  if (anonId) return and(isNull(freeUsageTable.userId), eq(freeUsageTable.anonId, anonId));
  return sql`FALSE`;
}

/**
 * Lifetime free usage for an identity — sums across ALL dates.
 * The one-time free trial never resets, so the cap is checked
 * against these lifetime totals, never a single day.
 */
export async function getFreeUsageLifetime(
  userId: string | null,
  anonId: string | null,
): Promise<FreeUsageLifetime> {
  const out: FreeUsageLifetime = { questionsUsed: 0, simsUsedTotal: 0, simsUsedByExam: {}, examsUsed: 0 };
  if (!userId && !anonId) return out;
  const rows = await db
    .select()
    .from(freeUsageTable)
    .where(identityCondition(userId, anonId));
  for (const row of rows) {
    if (row.kind === "question") out.questionsUsed += row.count;
    else if (row.kind === "simulation") {
      out.simsUsedTotal += row.count;
      if (row.exam) out.simsUsedByExam[row.exam] = (out.simsUsedByExam[row.exam] ?? 0) + row.count;
    } else if (row.kind === "exam") out.examsUsed += row.count;
  }
  return out;
}

/**
 * One-time free-trial state for an identity (lifetime, either/or).
 * Free questions are available only while lifetime questions used
 * is under the total AND no free sim has ever been taken; the free
 * sim is available only while NO free questions have ever been
 * answered AND no free sim has ever been taken.
 */
export interface FreeTrialState extends FreeUsageLifetime {
  /** Free questions left of the one-time 30 (before the either/or lock). */
  questionsRemaining: number;
  /** Free questions currently allowed (under 30 AND no sim ever used). */
  questionsAvailable: boolean;
  /** Free sim currently allowed (no questions ever used AND no sim ever used). */
  simAvailable: boolean;
}

export async function getFreeTrialState(
  userId: string | null,
  anonId: string | null,
): Promise<FreeTrialState> {
  const usage = await getFreeUsageLifetime(userId, anonId);
  const questionsRemaining = Math.max(0, FREE_QUESTIONS_TOTAL - usage.questionsUsed);
  return {
    ...usage,
    questionsRemaining,
    questionsAvailable: usage.questionsUsed < FREE_QUESTIONS_TOTAL && usage.simsUsedTotal === 0,
    simAvailable: usage.questionsUsed === 0 && usage.simsUsedTotal === 0,
  };
}

/** Increment a free-usage counter (upsert by identity + kind + day + exam). `usedDate` is telemetry only — the free-trial cap is lifetime, so a new day never refills anything. */
export async function recordFreeUsage(
  userId: string | null,
  anonId: string | null,
  kind: FreeUsageKind,
  exam: string | null,
  count = 1,
): Promise<void> {
  if (!userId && !anonId) return;
  const today = todayDateString();
  const conditions = [identityCondition(userId, anonId), eq(freeUsageTable.usedDate, today), eq(freeUsageTable.kind, kind)];
  if (exam) conditions.push(eq(freeUsageTable.exam, exam));
  else conditions.push(isNull(freeUsageTable.exam));
  const existing = await db
    .select()
    .from(freeUsageTable)
    .where(and(...conditions))
    .limit(1);
  if (existing.length > 0) {
    await db
      .update(freeUsageTable)
      .set({ count: sql`${freeUsageTable.count} + ${count}` })
      .where(eq(freeUsageTable.id, existing[0].id));
  } else {
    await db.insert(freeUsageTable).values({
      userId: userId ?? null,
      anonId: userId ? null : anonId,
      kind,
      exam: exam ?? null,
      usedDate: today,
      count,
    });
  }
}

/** Validate a client-supplied anon fingerprint: short, opaque, no PII expected. */
export function normalizeAnonId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 128) return null;
  if (!/^[A-Za-z0-9._-]+$/.test(trimmed)) return null;
  return trimmed;
}

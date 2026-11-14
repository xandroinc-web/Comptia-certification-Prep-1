/**
 * Trial / free-tier gating, backed by the server (P0-4).
 *
 * This replaces the old 6-line stub in which every function returned
 * `true` / `Infinity` unconditionally. The free allowance now lives in
 * the server (`GET /api/entitlements`, enforced again at serve time);
 * this module is only the client-side cache + synchronous readers for
 * it, because the existing callers in App.tsx are synchronous.
 *
 * HOW IT WORKS
 * - The integration agent calls `refreshEntitlements()` once on app
 *   load (and again after sign-in/out). It fetches
 *   `GET /api/entitlements` (signed-in usage when logged in, anonymous
 *   usage keyed by the local anon id otherwise) and caches the result.
 * - The synchronous getters read the cache. Before the first load
 *   they fail OPEN (assume the full one-time allowance) — the server is
 *   the authority and will 403 / serve a partial set if the allowance
 *   is actually spent, at which point the caller should refresh.
 * - `recordTrialUsed()` posts one `kind: 'exam'` usage row (attempt
 *   telemetry — the enforced cap is the one-time 30-question-or-one-sim
 *   trial, counted server-side at serve time) and refreshes the cache.
 *
 * SIGNATURES: the original exported names and `(isSignedIn, isPro)`
 * signatures are preserved so existing call sites keep compiling.
 * `isPro` here is the caller's subscription-derived flag; when the
 * cache is loaded, the server's `isPro` (entitlements row / Stripe /
 * admin) wins over the parameter. New exports: `refreshEntitlements`,
 * `getCachedEntitlements`, `hasTrialWarningBeenShown`.
 */
import { getEntitlements, recordFreeUsage, type Entitlements } from "./quiz-api.js";

export const FREE_QUESTIONS_TOTAL = 30;

const TRIAL_WARNING_KEY = "comptia_trial_warning_shown";

let cachedEntitlements: Entitlements | null = null;
let loadPromise: Promise<Entitlements> | null = null;

function defaultFreeEntitlements(): Entitlements {
  const noAttempts = { remaining: 0, expiresAt: null };
  return {
    isPro: false,
    isMember: false,
    plan: "free",
    proSource: null,
    membershipSource: null,
    expiresAt: null,
    membershipExpiresAt: null,
    testAttempts: { "A+": noAttempts, "Network+": noAttempts, "Security+": noAttempts },
    freeQuestionsUsed: 0,
    freeQuestionsCap: FREE_QUESTIONS_TOTAL,
    freeQuestionsRemaining: FREE_QUESTIONS_TOTAL,
    freeQuestionsAvailable: true,
    freeSimsUsed: 0,
    freeSimsCap: 1,
    freeSimsByExam: {},
    freeSimAvailable: true,
    examsStarted: 0,
    tierPassScaledScore: 750,
  };
}

/**
 * Fetch the server entitlements state and cache it. Safe to call
 * repeatedly (in-flight requests are shared). Never throws: on a
 * network/server failure it returns the previous cache, or the
 * fail-open free default when nothing was ever loaded.
 */
export function refreshEntitlements(): Promise<Entitlements> {
  if (!loadPromise) {
    loadPromise = getEntitlements()
      .then((entitlements) => {
        cachedEntitlements = entitlements;
        return entitlements;
      })
      .catch(() => cachedEntitlements ?? defaultFreeEntitlements())
      .finally(() => {
        loadPromise = null;
      });
  }
  return loadPromise;
}

/** The last loaded entitlements state, or null before the first load. */
export function getCachedEntitlements(): Entitlements | null {
  return cachedEntitlements;
}

/** Effective Pro: server cache wins when loaded, else the caller's flag. */
function effectiveIsPro(isPro: boolean): boolean {
  if (cachedEntitlements) return cachedEntitlements.isPro;
  return isPro;
}

/**
 * Free questions left of the one-time trial: server cache when
 * loaded, else the full allowance. Returns 0 when free questions
 * are locked under the either/or rule (e.g. the free sim was taken),
 * even if the 30 were never used.
 */
function remainingTrials(): number {
  if (cachedEntitlements) {
    return cachedEntitlements.freeQuestionsAvailable
      ? cachedEntitlements.freeQuestionsRemaining
      : 0;
  }
  return FREE_QUESTIONS_TOTAL;
}

export function hasRemainingTrials(isSignedIn: boolean, isPro: boolean): boolean {
  void isSignedIn;
  if (effectiveIsPro(isPro)) return true;
  return remainingTrials() > 0;
}

export function getRemainingTrials(isSignedIn: boolean, isPro: boolean): number {
  void isSignedIn;
  // Pro is genuinely unlimited — the only branch that returns Infinity,
  // and only when the user is actually Pro.
  if (effectiveIsPro(isPro)) return Infinity;
  return remainingTrials();
}

export function getTrialStatusMessage(isSignedIn: boolean, isPro: boolean): string | null {
  void isSignedIn;
  if (effectiveIsPro(isPro)) return null;
  if (remainingTrials() > 0) return null;
  return "Your one-time free trial is used up — 30 free questions, once only. Get a Practice Membership for unlimited practice, or a Full Test for one full 90-question simulation.";
}

export function markTrialWarningShown(): void {
  try {
    sessionStorage.setItem(TRIAL_WARNING_KEY, "1");
  } catch {
    // Storage unavailable — warning state is best-effort only.
  }
}

export function hasTrialWarningBeenShown(): boolean {
  try {
    return sessionStorage.getItem(TRIAL_WARNING_KEY) === "1";
  } catch {
    return false;
  }
}

export function canStartTrial(isSignedIn: boolean, isPro: boolean): boolean {
  return hasRemainingTrials(isSignedIn, isPro);
}

/**
 * Record that a quiz was started (attempt telemetry) and refresh the
 * cached allowance. Fire-and-forget: never throws. Pro users do not
 * consume free trials, so nothing is recorded for them.
 */
export async function recordTrialUsed(isSignedIn: boolean, isPro: boolean): Promise<void> {
  void isSignedIn;
  try {
    if (!effectiveIsPro(isPro)) {
      await recordFreeUsage({ kind: "exam" });
    }
    await refreshEntitlements();
  } catch {
    // Telemetry failure must never block starting a quiz.
  }
}

/** Trial limit tracking.
 *  - Non-registered (signed-out): 1 trial
 *  - Free members (signed-in, non-Pro): 3 trials
 *  - Pro members: unlimited
 *
 *  Anonymous trials and free-member trials are tracked separately so signing in
 *  gives a fresh free-member allowance.
 */

const ANON_TRIAL_KEY = "comptia_trials_used_anon";
const FREE_TRIAL_KEY = "comptia_trials_used_free";
const TRIAL_WARNING_SHOWN_KEY = "comptia_trial_warning_shown";

function getStorageKey(isSignedIn: boolean, isPro: boolean): string | null {
  if (isPro) return null;
  return isSignedIn ? FREE_TRIAL_KEY : ANON_TRIAL_KEY;
}

export function getTrialsUsed(isSignedIn: boolean, isPro: boolean): number {
  const key = getStorageKey(isSignedIn, isPro);
  if (!key) return 0;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return 0;
    const parsed = JSON.parse(raw);
    return typeof parsed === "number" ? parsed : 0;
  } catch {
    return 0;
  }
}

export function recordTrialUsed(isSignedIn: boolean, isPro: boolean): number {
  if (isPro) return 0;
  const key = getStorageKey(isSignedIn, isPro)!;
  const used = getTrialsUsed(isSignedIn, isPro) + 1;
  try {
    localStorage.setItem(key, JSON.stringify(used));
  } catch {
    // ignore
  }
  return used;
}

export function resetTrials(): void {
  try {
    localStorage.removeItem(ANON_TRIAL_KEY);
    localStorage.removeItem(FREE_TRIAL_KEY);
    localStorage.removeItem(TRIAL_WARNING_SHOWN_KEY);
  } catch {
    // ignore
  }
}

export function getTrialLimit(isSignedIn: boolean, isPro: boolean): number {
  if (isPro) return Infinity;
  return isSignedIn ? 3 : 1;
}

export function canStartTrial(isSignedIn: boolean, isPro: boolean): boolean {
  if (isPro) return true;
  const used = getTrialsUsed(isSignedIn, isPro);
  const limit = getTrialLimit(isSignedIn, isPro);
  return used < limit;
}

export function getRemainingTrials(isSignedIn: boolean, isPro: boolean): number {
  if (isPro) return Infinity;
  const limit = getTrialLimit(isSignedIn, isPro);
  const used = getTrialsUsed(isSignedIn, isPro);
  return Math.max(0, limit - used);
}

export function getTrialStatusMessage(isSignedIn: boolean, isPro: boolean): string | null {
  if (isPro) return null;
  const remaining = getRemainingTrials(isSignedIn, isPro);
  const limit = getTrialLimit(isSignedIn, isPro);
  if (remaining === 0) {
    return isSignedIn
      ? "You've used all 3 free trials. Upgrade to Pro for unlimited practice."
      : "You've used your free trial. Sign in for 3 free trials, or upgrade to Pro.";
  }
  return `${remaining} of ${limit} free trial${limit === 1 ? "" : "s"} remaining`;
}

export function markTrialWarningShown(): void {
  try {
    localStorage.setItem(TRIAL_WARNING_SHOWN_KEY, "1");
  } catch {
    // ignore
  }
}

export function wasTrialWarningShown(): boolean {
  try {
    return localStorage.getItem(TRIAL_WARNING_SHOWN_KEY) === "1";
  } catch {
    return false;
  }
}

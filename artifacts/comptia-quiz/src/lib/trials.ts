export function hasRemainingTrials(isSignedIn: boolean, isPro: boolean): boolean { return true; }
export function getRemainingTrials(isSignedIn: boolean, isPro: boolean): number { return Infinity; }
export function getTrialStatusMessage(isSignedIn: boolean, isPro: boolean): string | null { return null; }
export function markTrialWarningShown(): void {}
export function canStartTrial(isSignedIn: boolean, isPro: boolean): boolean { return true; }
export function recordTrialUsed(isSignedIn: boolean, isPro: boolean): Promise<void> { return Promise.resolve(); }

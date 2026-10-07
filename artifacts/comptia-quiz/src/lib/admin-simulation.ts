export type AdminSimulationProfile = "free" | "pro" | "hellmode" | "restricted";

export interface AdminSimulationFlags {
  timedSimulations: boolean;
  topicStudy: boolean;
  tierProgression: boolean;
  bonusQuestions: boolean;
}

export interface AdminSimulationConfig {
  profile: AdminSimulationProfile;
  dailyQuizLimit: number;
  featureFlags: AdminSimulationFlags;
}

const CONFIG_KEY = "comptia_admin_simulation";
const RUN_COUNT_KEY = "comptia_admin_simulation_runs";

export const DEFAULT_ADMIN_SIMULATION: AdminSimulationConfig = {
  profile: "free",
  dailyQuizLimit: 3,
  featureFlags: {
    timedSimulations: true,
    topicStudy: true,
    tierProgression: true,
    bonusQuestions: true,
  },
};

const validProfiles: AdminSimulationProfile[] = ["free", "pro", "hellmode", "restricted"];

export function saveAdminSimulationConfig(config: AdminSimulationConfig): void {
  sessionStorage.setItem(CONFIG_KEY, JSON.stringify(config));
  sessionStorage.setItem(RUN_COUNT_KEY, "0");
}

export function loadAdminSimulationConfig(): AdminSimulationConfig | null {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(CONFIG_KEY) || "null");
    if (
      !parsed ||
      !validProfiles.includes(parsed.profile) ||
      !Number.isInteger(parsed.dailyQuizLimit) ||
      parsed.dailyQuizLimit < 0 ||
      !parsed.featureFlags ||
      typeof parsed.featureFlags !== "object"
    ) {
      return null;
    }
    return {
      profile: parsed.profile,
      dailyQuizLimit: Math.min(parsed.dailyQuizLimit, 100),
      featureFlags: {
        timedSimulations: parsed.featureFlags.timedSimulations === true,
        topicStudy: parsed.featureFlags.topicStudy === true,
        tierProgression: parsed.featureFlags.tierProgression === true,
        bonusQuestions: parsed.featureFlags.bonusQuestions === true,
      },
    };
  } catch {
    return null;
  }
}

export function getAdminSimulationRuns(): number {
  const runs = Number(sessionStorage.getItem(RUN_COUNT_KEY) || 0);
  return Number.isInteger(runs) && runs >= 0 ? runs : 0;
}

export function recordAdminSimulationRun(): number {
  const next = getAdminSimulationRuns() + 1;
  sessionStorage.setItem(RUN_COUNT_KEY, String(next));
  return next;
}

export function clearAdminSimulation(): void {
  sessionStorage.removeItem(CONFIG_KEY);
  sessionStorage.removeItem(RUN_COUNT_KEY);
}

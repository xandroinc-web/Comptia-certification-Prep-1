import type { Question, Difficulty, ExamCategory } from "./questions";
import { getQuestionsByCategory, getAllQuestions, shuffleArray } from "./questions";

/** Performance-Based Question (PBQ) style.
 *  Simulates the CompTIA exam scenario questions where a situation
 *  is presented and the test-taker must answer follow-up questions.
 */
export interface SimulationQuestion extends Question {
  isPBQ?: boolean;
  scenario?: string;
  pbqPart?: number; // 1, 2, 3 for multi-part PBQs
  pbqTotalParts?: number;
}

/** Simulation configuration mimics the real CompTIA exam. */
export interface SimulationConfig {
  name: string;
  description: string;
  totalQuestions: number;
  timeMinutes: number;
  pbqCount: number;
  mcqCount: number;
  difficulty: Difficulty | "mixed";
  category: ExamCategory | "all";
  isProRequired: boolean;
}

export const SIMULATION_CONFIGS: Record<string, SimulationConfig> = {
  a_plus: {
    name: "CompTIA A+ 220-1101/1102",
    description: "90 questions · 90 minutes · 5 PBQs · 750 to pass",
    totalQuestions: 90,
    timeMinutes: 90,
    pbqCount: 5,
    mcqCount: 85,
    difficulty: "mixed",
    category: "A+",
    isProRequired: false, // first sim free
  },
  network_plus: {
    name: "CompTIA Network+ N10-009",
    description: "90 questions · 90 minutes · 5 PBQs · 720 to pass",
    totalQuestions: 90,
    timeMinutes: 90,
    pbqCount: 5,
    mcqCount: 85,
    difficulty: "mixed",
    category: "Network+",
    isProRequired: false,
  },
  security_plus: {
    name: "CompTIA Security+ SY0-701",
    description: "90 questions · 90 minutes · 5 PBQs · 750 to pass",
    totalQuestions: 90,
    timeMinutes: 90,
    pbqCount: 5,
    mcqCount: 85,
    difficulty: "mixed",
    category: "Security+",
    isProRequired: false,
  },
};

/** Generate a simulation question set.
 *  For mixed difficulty: ~30% easy, ~40% medium, ~30% hard.
 *  For specific difficulty: all questions at that level.
 */
export function generateSimulation(
  category: ExamCategory | "all",
  difficulty: Difficulty | "mixed" = "mixed",
  isPro: boolean = false,
): SimulationQuestion[] {
  const configKey = category === "A+" ? "a_plus" : category === "Network+" ? "network_plus" : "security_plus";
  const config = SIMULATION_CONFIGS[configKey];

  // Get pool of questions
  let pool: Question[];
  if (category === "all") {
    pool = getAllQuestions();
  } else {
    pool = getQuestionsByCategory(category);
  }

  // For non-Pro users after first sim, restrict to easy/medium only
  if (!isPro && difficulty === "mixed") {
    // Still include some hard for "mixed" feel but fewer
    const easyPool = pool.filter((q) => q.difficulty === "easy");
    const mediumPool = pool.filter((q) => q.difficulty === "medium");
    const hardPool = pool.filter((q) => q.difficulty === "hard");

    // Mix: 40% easy, 45% medium, 15% hard (lighter than Pro's 30/40/30)
    const easyTarget = Math.round(config.mcqCount * 0.40);
    const mediumTarget = Math.round(config.mcqCount * 0.45);
    const hardTarget = config.mcqCount - easyTarget - mediumTarget;

    const mcqs = [
      ...shuffleArray(easyPool).slice(0, easyTarget),
      ...shuffleArray(mediumPool).slice(0, mediumTarget),
      ...shuffleArray(hardPool).slice(0, Math.max(0, hardTarget)),
    ];

    // Build PBQs from hard pool
    const pbqPool = shuffleArray(hardPool).slice(0, config.pbqCount);
    const pbqs = pbqPool.map((q: Question, i: number) => createPBQ(q, i + 1, config.pbqCount));

    return shuffleArray([...mcqs, ...pbqs]).slice(0, config.totalQuestions);
  }

  // Pro or specific difficulty
  if (difficulty !== "mixed") {
    pool = pool.filter((q: Question) => q.difficulty === difficulty || (difficulty === "medium" && q.difficulty === "hard"));
  }

  const mcqs = shuffleArray(pool).slice(0, config.mcqCount);
  const pbqs = shuffleArray(pool.filter((q: Question) => q.difficulty === "hard"))
    .slice(0, config.pbqCount)
    .map((q: Question, i: number) => createPBQ(q, i + 1, config.pbqCount));

  return shuffleArray([...mcqs, ...pbqs]).slice(0, config.totalQuestions);
}

/** Convert a hard question into a PBQ-style simulation question. */
function createPBQ(q: Question, part: number, totalParts: number): SimulationQuestion {
  // Generate a scenario wrapper for the question
  const scenarios = PBQ_SCENARIOS[q.category] || [];
  const scenario = scenarios[Math.floor(Math.random() * scenarios.length)];

  return {
    ...q,
    isPBQ: true,
    scenario: scenario.replace("{{ISSUE}}", q.question),
    pbqPart: part,
    pbqTotalParts: totalParts,
  };
}

const PBQ_SCENARIOS: Record<ExamCategory, string[]> = {
  "A+": [
    "A help desk technician receives a ticket stating: \"{{ISSUE}}\" What should the technician do FIRST?",
    "After a recent Windows update, a user calls reporting: \"{{ISSUE}}\" What is the MOST likely cause?",
    "A new employee brings a laptop to the IT department. The tech notes: \"{{ISSUE}}\" What is the best resolution?",
    "During routine maintenance, a system shows the following symptom: \"{{ISSUE}}\" Which component should be checked first?",
    "A remote worker emails: \"{{ISSUE}}\" What is the BEST troubleshooting step?",
  ],
  "Network+": [
    "The NOC receives an alert: \"{{ISSUE}}\" What should the network engineer verify FIRST?",
    "After deploying new switches, users report: \"{{ISSUE}}\" What is the root cause?",
    "A site-to-site VPN tunnel drops intermittently. Logs show: \"{{ISSUE}}\" Which protocol setting should be adjusted?",
    "A network scan reveals: \"{{ISSUE}}\" What security measure should be implemented immediately?",
    "A VoIP deployment is experiencing quality issues. Diagnostic data: \"{{ISSUE}}\" What QoS configuration is needed?",
  ],
  "Security+": [
    "The SOC analyst detects: \"{{ISSUE}}\" What is the FIRST step in the incident response process?",
    "A penetration test reveals: \"{{ISSUE}}\" Which compensating control should be prioritized?",
    "A phishing simulation shows: \"{{ISSUE}}\" What user awareness training should be deployed?",
    "Compliance audit flags: \"{{ISSUE}}\" Which policy update addresses this finding?",
    "Threat intel reports active exploitation of: \"{{ISSUE}}\" What is the MOST effective mitigation?",
  ],
};

/** Track free simulation usage. */
const SIM_STORAGE_KEY = "comptia_free_simulations_used";

export function getFreeSimulationsUsed(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(SIM_STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

export function recordSimulationUsed(category: string): void {
  const used = getFreeSimulationsUsed();
  used[category] = (used[category] || 0) + 1;
  localStorage.setItem(SIM_STORAGE_KEY, JSON.stringify(used));
}

export function hasFreeSimulationRemaining(category: string): boolean {
  return (getFreeSimulationsUsed()[category] || 0) < 1;
}

export function getSimulationStatus(category: string, isPro: boolean): {
  canStart: boolean;
  reason?: string;
} {
  if (isPro) return { canStart: true };
  if (hasFreeSimulationRemaining(category)) return { canStart: true };
  return {
    canStart: false,
    reason: "Your free simulation is complete. Upgrade to Pro for unlimited simulations and hard questions.",
  };
}

/** Format seconds as MM:SS for simulation timer. */
export function formatSimulationTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

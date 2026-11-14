import type { Question, Difficulty, ExamCategory } from "./questions.js";
import { getQuestionsByCategory, getAllQuestions, shuffleArray } from "./questions.js";

/** Scenario-style simulation question.
 *  These are single-select multiple-choice questions wrapped in a
 *  scenario sentence — NOT real CompTIA performance-based questions
 *  (no multi-select, drag-and-drop, CLI, matching, or log interaction
 *  exists in this app). They are labelled "scenario questions"
 *  everywhere user-facing. `isPBQ` is kept only so older saved/derived
 *  data keeps working; new code should read `isScenario`.
 */
export interface SimulationQuestion extends Question {
  isPBQ?: boolean;
  isScenario?: boolean;
  scenario?: string;
  pbqPart?: number; // 1, 2, 3 for multi-part scenario questions
  pbqTotalParts?: number;
}

/** Simulation configuration mimics the real CompTIA exam. */
export interface SimulationConfig {
  name: string;
  description: string;
  /** What a free (non-Pro) user actually gets: one half-simulation. */
  freeDescription: string;
  totalQuestions: number;
  timeMinutes: number;
  scenarioCount: number;
  mcqCount: number;
  difficulty: Difficulty | "mixed";
  category: ExamCategory | "all";
  isProRequired: boolean;
}

export const SIMULATION_CONFIGS: Record<string, SimulationConfig> = {
  a_plus: {
    name: "CompTIA A+ 220-1101/1102",
    description: "Up to 90 questions · up to 90 minutes · scenario-style questions · 750 to pass",
    freeDescription: "Free half-simulation: 45 questions · 45 minutes · scenario-style questions · 750 to pass",
    totalQuestions: 90,
    timeMinutes: 90,
    scenarioCount: 5,
    mcqCount: 85,
    difficulty: "mixed",
    category: "A+",
    isProRequired: false, // first sim free
  },
  network_plus: {
    name: "CompTIA Network+ N10-009",
    description: "Up to 90 questions · up to 90 minutes · scenario-style questions · 750 to pass",
    freeDescription: "Free half-simulation: 45 questions · 45 minutes · scenario-style questions · 750 to pass",
    totalQuestions: 90,
    timeMinutes: 90,
    scenarioCount: 5,
    mcqCount: 85,
    difficulty: "mixed",
    category: "Network+",
    isProRequired: false,
  },
  security_plus: {
    name: "CompTIA Security+ SY0-701",
    description: "Up to 90 questions · up to 90 minutes · scenario-style questions · 750 to pass",
    freeDescription: "Free half-simulation: 45 questions · 45 minutes · scenario-style questions · 750 to pass",
    totalQuestions: 90,
    timeMinutes: 90,
    scenarioCount: 5,
    mcqCount: 85,
    difficulty: "mixed",
    category: "Security+",
    isProRequired: false,
  },
};

/** Pick up to `target` questions from each difficulty pool, capped at
 *  what the pool actually holds, then top the selection up to
 *  `totalTarget` from whatever pool capacity remains — so the delivered
 *  count is the advertised count whenever the bank allows it, and never
 *  silently short (the old code targeted 34/38/13 from exact 30/30/30
 *  tercile pools and delivered 78 instead of 90). */
function pickCappedMix(
  pools: Record<Difficulty, Question[]>,
  targets: Record<Difficulty, number>,
  totalTarget: number,
): Question[] {
  const picked: Question[] = [];
  const pickedIds = new Set<number>();
  for (const d of ["easy", "medium", "hard"] as Difficulty[]) {
    const take = Math.min(targets[d], pools[d].length);
    for (const q of shuffleArray(pools[d]).slice(0, take)) {
      picked.push(q);
      pickedIds.add(q.id);
    }
  }
  if (picked.length < totalTarget) {
    const leftovers = shuffleArray(
      (["easy", "medium", "hard"] as Difficulty[]).flatMap((d) => pools[d]),
    ).filter((q) => !pickedIds.has(q.id));
    for (const q of leftovers.slice(0, totalTarget - picked.length)) {
      picked.push(q);
      pickedIds.add(q.id);
    }
  }
  return picked;
}

/** Generate a simulation question set.
 *  For mixed difficulty: ~30% easy, ~40% medium, ~30% hard.
 *  For specific difficulty: all questions at that level.
 *  The returned array IS the delivered set — the timer is set from its
 *  length (60 seconds per delivered question), never from the target.
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

    // Mix: 40% easy, 45% medium, 15% hard (lighter than Pro's 30/40/30),
    // each capped at its actual pool size.
    const easyTarget = Math.round(config.mcqCount * 0.40);
    const mediumTarget = Math.round(config.mcqCount * 0.45);
    const hardTarget = config.mcqCount - easyTarget - mediumTarget;

    const mcqs = pickCappedMix(
      { easy: easyPool, medium: mediumPool, hard: hardPool },
      { easy: easyTarget, medium: mediumTarget, hard: hardTarget },
      config.mcqCount,
    );

    // Build scenario questions from the hard pool, excluding questions
    // already selected as plain MCQs (no question twice in one sim).
    const usedIds = new Set(mcqs.map((q) => q.id));
    const scenarioPool = shuffleArray(hardPool).filter((q) => !usedIds.has(q.id));
    const scenarios = scenarioPool
      .slice(0, config.scenarioCount)
      .map((q: Question, i: number) => createScenarioQuestion(q, i + 1, config.scenarioCount));

    return shuffleArray([...mcqs, ...scenarios]).slice(0, config.totalQuestions);
  }

  // Pro or specific difficulty
  if (difficulty !== "mixed") {
    pool = pool.filter((q: Question) => q.difficulty === difficulty || (difficulty === "medium" && q.difficulty === "hard"));
  }

  const mcqs = shuffleArray(pool).slice(0, config.mcqCount);
  const usedIds = new Set(mcqs.map((q) => q.id));
  const scenarios = shuffleArray(pool.filter((q: Question) => q.difficulty === "hard" && !usedIds.has(q.id)))
    .slice(0, config.scenarioCount)
    .map((q: Question, i: number) => createScenarioQuestion(q, i + 1, config.scenarioCount));

  return shuffleArray([...mcqs, ...scenarios]).slice(0, config.totalQuestions);
}

/** Convert a hard question into a scenario-style simulation question.
 *  The question stays a single-select MCQ; only a scenario sentence is
 *  wrapped around it. */
function createScenarioQuestion(q: Question, part: number, totalParts: number): SimulationQuestion {
  // Generate a scenario wrapper for the question
  const scenarios = SCENARIO_PROMPTS[q.category] || [];
  const scenario = scenarios[Math.floor(Math.random() * scenarios.length)];

  return {
    ...q,
    isPBQ: true,
    isScenario: true,
    scenario: scenario.replace("{{ISSUE}}", q.question),
    pbqPart: part,
    pbqTotalParts: totalParts,
  };
}

const SCENARIO_PROMPTS: Record<ExamCategory, string[]> = {
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

/** Track free simulation usage. Legacy localStorage ledger — nothing
 *  imports this module anymore; the server is the authority under the
 *  one-time free-trial model (30 questions OR one sim, either/or). */
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
    reason: "Your one-time free trial is used up. Get a Full Test ($9.99) for one full 90-question attempt for this exam.",
  };
}

/** Format seconds as MM:SS for simulation timer. */
export function formatSimulationTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

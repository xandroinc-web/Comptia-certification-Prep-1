/**
 * Bank-free display constants (P0-4 follow-up: keep the answer key out
 * of the browser bundle).
 *
 * NOTHING in this module imports the question bank (`@/data/questions`,
 * `@/data/exam-bank`, `exam-bank.json`, `hellmode-bank.ts`). Every value
 * here is a static literal, verified against the real bank by script
 * (`/tmp/bank-meta-probe.ts` — esbuild bundle of the data modules):
 *
 *   EXAM_COUNTS ......... A+ 358, Network+ 190, Security+ 262, all 810
 *   Difficulty breakdown . all 270/270/270; A+ 131/137/90;
 *                         Network+ 56/44/90; Security+ 83/89/90
 *   Topic pool counts ... 9 A+ domains, 38–365 (see TOPIC_POOL_COUNTS)
 *
 * If the bank changes, re-run the probe and update these literals —
 * the server (`artifacts/api-server/src/lib/questionBank.ts`) remains
 * the runtime authority for counts; these literals are display-only.
 * Scoring primitives live in `./scoring` (also bank-free).
 */
import type { Difficulty, ExamCategory } from "./scoring.js";
import { getCachedEntitlements } from "./trials.js";

export const EXAMS: ExamCategory[] = ["A+", "Network+", "Security+"];

export const EXAM_DESCRIPTIONS: Record<ExamCategory, string> = {
  "A+": "Hardware, operating systems, networking, and troubleshooting",
  "Network+": "Network infrastructure, protocols, and operations",
  "Security+": "Cybersecurity concepts, threats, and risk management",
};

/** Per-exam question counts in the served 810-question bank. */
export const EXAM_COUNTS: Record<ExamCategory | "all", number> = {
  "A+": 358,
  "Network+": 190,
  "Security+": 262,
  all: 810,
};

/** Difficulty breakdown of the served bank (tier = difficulty). */
const DIFFICULTY_BREAKDOWN: Record<ExamCategory | "all", Record<Difficulty, number>> = {
  all: { easy: 270, medium: 270, hard: 270 },
  "A+": { easy: 131, medium: 137, hard: 90 },
  "Network+": { easy: 56, medium: 44, hard: 90 },
  "Security+": { easy: 83, medium: 89, hard: 90 },
};

export function getDifficultyCount(difficulty?: Difficulty): number {
  if (!difficulty) return EXAM_COUNTS.all;
  return DIFFICULTY_BREAKDOWN.all[difficulty];
}

export function getDifficultyBreakdown(category?: ExamCategory): Record<Difficulty, number> {
  return { ...(category ? DIFFICULTY_BREAKDOWN[category] : DIFFICULTY_BREAKDOWN.all) };
}

/** Topic-pool sizes (keyword-scored pools over the 810 + 10 bonus
 *  questions, definition questions penalised — same computation the
 *  old `src/data/topic-pool.ts` did at import time, now frozen as
 *  literals so the pool builder no longer pulls the bank in). */
export const TOPIC_POOL_COUNTS: Record<string, number> = {
  "1.0 Mobile Devices": 38,
  "2.0 Networking": 365,
  "3.0 Hardware": 119,
  "4.0 Virtualization & Cloud Computing": 66,
  "5.0 Hardware & Network Troubleshooting": 199,
  "1.0 Operating Systems": 279,
  "2.0 Security": 261,
  "3.0 Software Troubleshooting": 215,
  "4.0 Operational Procedures": 267,
};

// ---------------------------------------------------------------------------
// Simulation display config (static; the server enforces the real rules)
// ---------------------------------------------------------------------------

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

/**
 * Full-simulation display hint (new pricing model, Nov 13 2026).
 * The SERVER is the authority (it 403s when no attempt is left);
 * this only decides what the simulation card shows before a start.
 * A sim can start when: the user is an admin, they hold a paid test
 * attempt for this exam, or their one-time free half-sim is still
 * available. Practice Membership alone grants NO sims.
 * When the server entitlements cache is loaded, the one-time
 * either/or flag (`freeSimAvailable`) decides the free sim; before
 * the cache loads, fall back to the legacy localStorage ledger
 * (fail open — the server still enforces). Client-side recording was
 * removed — the server records usage.
 */
const SIM_STORAGE_KEY = "comptia_free_simulations_used";

export function getFreeSimulationsUsed(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(SIM_STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

export function hasFreeSimulationRemaining(category: string): boolean {
  const cached = getCachedEntitlements();
  if (cached) return cached.freeSimAvailable;
  return (getFreeSimulationsUsed()[category] || 0) < 1;
}

export function getSimulationStatus(
  category: string,
  isAdmin: boolean,
  testAttempts?: Record<string, { remaining: number; expiresAt: string | null }>,
): { canStart: boolean; reason?: string } {
  if (isAdmin) return { canStart: true };
  if ((testAttempts?.[category]?.remaining ?? 0) > 0) return { canStart: true };
  if (hasFreeSimulationRemaining(category)) return { canStart: true };
  return {
    canStart: false,
    reason:
      "Your one-time free trial is used up. Get a Full Test ($9.99) for one full 90-question attempt for this exam.",
  };
}

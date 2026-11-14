/** The unified question bank.
 *
 * There is ONE bank: the 810 served tier questions (Tier 1 + Tier 2 +
 * HellMode Tier 3 — see `src/data/exam-bank.ts`, `getAllTierQuestions`).
 * The old 270-question quick bank that used to live in this file is
 * retired: its questions were merged into the tier bank (dedupe +
 * backfill, P0-1), and Fast / Full / Topic / Simulation / Weak-area
 * modes now draw from the same 810 questions as the tier exams.
 *
 * This module keeps the exact public surface every other file imports
 * from `@/data/questions` — types, the `questions` array, the accessors,
 * and the scoring helpers (which live in `src/lib/scoring.ts` and are
 * re-exported here) — so no caller had to change.
 */
import { assignTopic } from "./topics.js";
import type { DomainTopic } from "./topics.js";
export type { DomainTopic } from "./topics.js";

export type { ExamCategory, Difficulty, Question } from "../lib/scoring.js";
export {
  DIFFICULTY_LABELS,
  DIFFICULTY_COLORS,
  SECONDS_PER_QUESTION,
  DIFFICULTY_WEIGHT,
  shuffleArray,
  scrambleOptions,
  COMPTIA_PASS_SCORE,
  COMPTIA_MIN_SCORE,
  COMPTIA_MAX_SCORE,
  COMPTIA_PASS_RAW_PCT,
  comptiaScaledScore,
  isCompTiaPass,
  isRawPass,
  getTimeLimitSeconds,
  weightedScore,
} from "../lib/scoring.js";

import { shuffleArray, scrambleOptions } from "../lib/scoring.js";
import { getAllTierQuestions } from "./exam-bank.js";
import type { ExamCategory, Difficulty, Question } from "../lib/scoring.js";

export const EXAMS: ExamCategory[] = ["A+", "Network+", "Security+"];

export const EXAM_DESCRIPTIONS: Record<ExamCategory, string> = {
  "A+": "Hardware, operating systems, networking, and troubleshooting",
  "Network+": "Network infrastructure, protocols, and operations",
  "Security+": "Cybersecurity concepts, threats, and risk management",
};

function assignTopics(qs: Question[]): Question[] {
  return qs.map((q) => {
    const topic = assignTopic(q.question, q.explanation);
    return topic ? { ...q, topic } : q;
  });
}

/** The unified bank: 810 questions (270 per tier). Difficulty is the
 *  tier's difficulty — Tier 1 easy, Tier 2 medium, HellMode hard. */
export const questions: Question[] = assignTopics(getAllTierQuestions());

/** Per-exam counts, computed from the unified bank — the single source
 *  of truth for every count shown in the UI. Must agree with
 *  `allTiersQuestionCount()` (810). */
export const EXAM_COUNTS: Record<ExamCategory | "all", number> = {
  "A+": questions.filter((q) => q.category === "A+").length,
  "Network+": questions.filter((q) => q.category === "Network+").length,
  "Security+": questions.filter((q) => q.category === "Security+").length,
  all: questions.length,
};

export function getQuestionsByTopic(topic: DomainTopic, count?: number): Question[] {
  const qs = questions.filter((q) => q.topic === topic);
  const result = count ? shuffleArray(qs).slice(0, count) : qs;
  return scrambleOptions(result);
}

export function getQuestionsByCategory(category: ExamCategory, count?: number, difficulty?: Difficulty): Question[] {
  let qs = questions.filter((q) => q.category === category);
  if (difficulty) {
    qs = qs.filter((q) => q.difficulty === difficulty);
  }
  const result = count ? shuffleArray(qs).slice(0, count) : qs;
  return scrambleOptions(result);
}

export function getAllQuestions(count?: number, difficulty?: Difficulty): Question[] {
  let qs = [...questions];
  if (difficulty) {
    qs = qs.filter((q) => q.difficulty === difficulty);
  }
  const result = count ? shuffleArray(qs).slice(0, count) : qs;
  return scrambleOptions(result);
}

export function getDifficultyCount(difficulty?: Difficulty): number {
  if (!difficulty) return questions.length;
  return questions.filter((q) => q.difficulty === difficulty).length;
}

export function getDifficultyBreakdown(category?: ExamCategory): Record<Difficulty, number> {
  let qs = questions;
  if (category) qs = qs.filter((q) => q.category === category);
  return {
    easy: qs.filter((q) => q.difficulty === "easy").length,
    medium: qs.filter((q) => q.difficulty === "medium").length,
    hard: qs.filter((q) => q.difficulty === "hard").length,
  };
}

export function getTopicBreakdown(category: ExamCategory): Record<string, number> {
  const qs = questions.filter((q) => q.category === category);
  const counts: Record<string, number> = {};
  for (const q of qs) {
    const key = q.topic || "Untagged";
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

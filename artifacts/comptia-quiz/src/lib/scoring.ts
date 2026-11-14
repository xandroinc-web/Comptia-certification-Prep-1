/** Shared question types, helpers, and the ONE CompTIA scoring standard.
 *
 * This module is the single home for the primitives that used to live in
 * `src/data/questions.ts` alongside the retired 270-question quick bank.
 * `src/data/questions.ts` re-exports everything from here so existing
 * imports (`@/data/questions`) keep working unchanged, and
 * `src/data/exam-bank.ts` imports from here instead of from
 * `./questions` (which would be a circular import now that the unified
 * bank in `questions.ts` is built from the tier bank).
 */
import type { DomainTopic } from "../data/topics.js";

export type ExamCategory = "A+" | "Network+" | "Security+";
export type Difficulty = "easy" | "medium" | "hard";

export interface Question {
  id: number;
  category: ExamCategory;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  difficulty?: Difficulty;
  topic?: DomainTopic;
}

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  easy: "Easy",
  medium: "Medium",
  hard: "Hard",
};

export const DIFFICULTY_COLORS: Record<Difficulty, string> = {
  easy: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
  medium: "text-amber-400 bg-amber-500/10 border-amber-500/30",
  hard: "text-red-400 bg-red-500/10 border-red-500/30",
};

/** Seconds per question by difficulty. */
export const SECONDS_PER_QUESTION: Record<Difficulty, number> = {
  easy: 75,
  medium: 60,
  hard: 45,
};

/** Difficulty weight multiplier for scoring. */
export const DIFFICULTY_WEIGHT: Record<Difficulty, number> = {
  easy: 1.0,
  medium: 1.2,
  hard: 1.5,
};

/** Shuffle an array using Fisher-Yates (returns a new array). */
export function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Scramble the answer options of each question so the correct answer lands
 *  in a random position every time a quiz starts. */
export function scrambleOptions(questions: Question[]): Question[] {
  return questions.map((q) => {
    const originalCorrect = q.correctIndex;
    const originalCorrectText = q.options[originalCorrect];
    const shuffled = shuffleArray(q.options);
    const newCorrect = shuffled.indexOf(originalCorrectText);
    return { ...q, options: shuffled, correctIndex: newCorrect };
  });
}

// ══════════════════════════════════════════════════════════
//  CompTIA Scoring — the ONE pass standard
// ══════════════════════════════════════════════════════════

/** CompTIA uses a 100–900 scale. Passing score is 750. */
export const COMPTIA_PASS_SCORE = 750;
export const COMPTIA_MIN_SCORE = 100;
export const COMPTIA_MAX_SCORE = 900;

/** Raw percent needed to reach 750: score = 100 + round(pct × 8), so
 *  81% → 748 (FAIL) and 82% → 756 (PASS). Every pass check in the app —
 *  tier unlocks, results, grade labels — must use this number, never a
 *  hardcoded 80 or 70. */
export const COMPTIA_PASS_RAW_PCT = 82;

/** Convert raw percentage (0–100) to CompTIA scaled score (100–900).
 *  Formula: 100 + round(pct × 8). 750 = pass (82% raw). */
export function comptiaScaledScore(rawPct: number): number {
  return Math.max(COMPTIA_MIN_SCORE, Math.min(COMPTIA_MAX_SCORE, Math.round(100 + rawPct * 8)));
}

/** Is a scaled score a pass? */
export function isCompTiaPass(scaled: number): boolean {
  return scaled >= COMPTIA_PASS_SCORE;
}

/** Is a raw percent a pass under the single 82% standard? */
export function isRawPass(rawPct: number): boolean {
  return rawPct >= COMPTIA_PASS_RAW_PCT;
}

/** Compute total allowed seconds for a given question count and difficulty. */
export function getTimeLimitSeconds(questionCount: number, difficulty?: Difficulty): number {
  const perQ = difficulty ? SECONDS_PER_QUESTION[difficulty] : 60;
  return questionCount * perQ;
}

/** Weighted scoring based on difficulty. */
export function weightedScore(questions: Question[], answers: (number | null)[]): number {
  let correctPoints = 0;
  let totalPoints = 0;
  questions.forEach((q, i) => {
    const w = DIFFICULTY_WEIGHT[q.difficulty || "easy"];
    totalPoints += w;
    if (answers[i] === q.correctIndex) correctPoints += w;
  });
  return totalPoints === 0 ? 0 : Math.round((correctPoints / totalPoints) * 100);
}

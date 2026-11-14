/**
 * Server-side question bank loader (P0-4).
 *
 * HOW THE SERVER GETS QUESTIONS WITHOUT DUPLICATING THE BANK
 * -----------------------------------------------------------
 * The question bank lives in exactly one place — the quiz app's data
 * files under `artifacts/comptia-quiz/src/data/` — and this loader reads
 * them from the repo tree at runtime. Nothing is copied into the
 * api-server, and no bank content is checked into a second location.
 *
 * - Tier bank (`exam-bank.json` + `exam-bank-meta.json`): plain JSON,
 *   read with `fs`. 810 tier questions + 10 bonus. The meta file's
 *   explanations carry a per-question exam tag ("(Network+)",
 *   "(A+ Core 2)", ...) for 699 of 810 questions (224/270 tier 1,
 *   238/270 tier 2, 237/270 tier 3); the remaining 111 (ids 811-921,
 *   an appended block that largely duplicates the quick bank's
 *   questions across all three exams) carry no tag. Tagged questions
 *   filter by exam; untagged ones are served only in mixed-exam pools
 *   (`exam=all`, and tier mode) — see `examKnown` on BankQuestion.
 *   Difficulty is the tier itself: tier 1 = easy, tier 2 =
 *   medium, tier 3 = hard.
 * - HellMode bank (`hellmode-bank.ts`, Tier 3): loaded with a dynamic
 *   `import()` relying on Node >= 22.18 type stripping. This works
 *   because the file has no runtime imports (only `import type`).
 *   If the import fails (older Node, or the file is absent from the
 *   deployment), Tier 3 falls back to the tier-3 JSON entries.
 * - Quick bank (`questions.ts`, 270 questions): NOT loadable by plain
 *   Node — it imports `./topics` without a file extension, which Node
 *   ESM refuses, and it cannot be statically imported into the
 *   api-server without breaking `tsc` (rootDir) and the esbuild bundle.
 *   So fast/full/topic/simulation modes are served from the tier bank
 *   instead (the canonical 810-question bank — audit Decision 1(a)).
 *   The long-term fix is extracting the banks into a shared
 *   `lib/question-bank` package with extension-ful imports and
 *   re-pointing the frontend at it; until then the quick bank stays
 *   client-side only and the server is the single serving path.
 *
 * The server NEVER sends answers or explanations to the client.
 * `toPublic()` strips them, and option order is shuffled per question
 * set with a deterministic seed (see `shuffleOptionsForSet`), so the
 * server can grade a submission without storing the served set: the
 * client echoes `questionSetId` and the server re-derives the shuffle.
 *
 * DATA DIR RESOLUTION: `QUESTION_BANK_DIR` env var wins; otherwise the
 * loader walks up from this file (works both from `src/` under tsx and
 * from the esbuild bundle in `dist/`) looking for
 * `artifacts/comptia-quiz/src/data/exam-bank.json`. A deployment MUST
 * ship that directory alongside the server (or set QUESTION_BANK_DIR);
 * if it is missing, question endpoints fail closed with 503.
 */

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export type ExamCategory = "A+" | "Network+" | "Security+";
export type Difficulty = "easy" | "medium" | "hard";
export type BankSource = "tier1" | "tier2" | "tier3" | "hellmode" | "bonus";

/** A bank question as the server holds it (answers stay server-side). */
export interface BankQuestion {
  /** Stable server-side id, e.g. "t1-1", "t2-271", "hm-30000", "bonus-1". */
  id: string;
  exam: ExamCategory;
  /** True when `exam` came from a real tag (meta explanation or the
   *  text heuristic). False for the untagged appended block, which
   *  defaults to "A+" for display but is served only in mixed-exam
   *  pools — never as a per-exam question. */
  examKnown: boolean;
  question: string;
  options: string[];
  /** The exact option text that is correct. */
  correctText: string;
  explanation?: string;
  difficulty: Difficulty;
  source: BankSource;
  /** Scenario framing, when the question carries one (HellMode setup). */
  scenario?: string;
}

/** What the client is allowed to see — never correctText/explanation. */
export interface PublicQuestion {
  id: string;
  question: string;
  options: string[];
  category: ExamCategory;
  difficulty: Difficulty;
  scenario?: string;
}

interface TierBankJson {
  tier1: { id: number | string; q: string; opts: string[]; ans: string }[];
  tier2: { id: number | string; q: string; opts: string[]; ans: string }[];
  tier3: { id: number | string; q: string; opts: string[]; ans: string }[];
  bonus: { id: number | string; q: string; opts: string[]; ans: string }[];
}

interface ExamMetaJson {
  tier1: { id: number | string; explanation: string }[];
  tier2: { id: number | string; explanation: string }[];
  tier3: { id: number | string; explanation: string }[];
  bonus: { id: number | string; explanation: string }[];
}

interface HellModeQuestion {
  id: number;
  category: ExamCategory;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  difficulty?: Difficulty;
}

export const EXAMS: ExamCategory[] = ["A+", "Network+", "Security+"];
export const TIER_DIFFICULTY: Record<1 | 2 | 3, Difficulty> = {
  1: "easy",
  2: "medium",
  3: "hard",
};

/** Scenario framing for simulation questions (P0-5 follow-up).
 *  Verbatim copy of the client-side prompts from
 *  `artifacts/comptia-quiz/src/data/simulation.ts` — the server wraps
 *  5 hard/medium questions per simulation in one of these sentences
 *  ({{ISSUE}} is replaced by the question text). Scenario questions
 *  are honest single-select MCQs with a scenario sentence, not PBQs. */
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

/** The client's own text heuristic (exam-bank.ts `categoryFromQuestion`), kept as a fallback. */
export function categoryFromQuestionText(text: string): ExamCategory | null {
  if (/security\+/i.test(text)) return "Security+";
  if (/network\+/i.test(text)) return "Network+";
  if (/a\+/i.test(text)) return "A+";
  if (/packet analyzer|traffic on port|which port|network traffic/i.test(text)) {
    return "Network+";
  }
  return null;
}

/** Exam tag carried by a meta explanation, e.g. "... (Network+)". */
function examFromMetaExplanation(explanation: string | undefined): ExamCategory | null {
  if (!explanation) return null;
  if (/security\+/i.test(explanation)) return "Security+";
  if (/network\+/i.test(explanation)) return "Network+";
  if (/A\+/.test(explanation)) return "A+";
  return null;
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

function findDataDir(): string | null {
  if (process.env.QUESTION_BANK_DIR && existsSync(path.join(process.env.QUESTION_BANK_DIR, "exam-bank.json"))) {
    return process.env.QUESTION_BANK_DIR;
  }
  const here = path.dirname(fileURLToPath(import.meta.url));
  let dir = here;
  for (let i = 0; i < 8; i++) {
    const candidate = path.join(dir, "artifacts", "comptia-quiz", "src", "data");
    if (existsSync(path.join(candidate, "exam-bank.json"))) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  const cwdCandidate = path.join(process.cwd(), "artifacts", "comptia-quiz", "src", "data");
  if (existsSync(path.join(cwdCandidate, "exam-bank.json"))) return cwdCandidate;
  return null;
}

function tierQuestions(
  entries: TierBankJson[keyof TierBankJson],
  meta: ExamMetaJson[keyof ExamMetaJson],
  prefix: string,
  difficulty: Difficulty,
  source: BankSource,
): BankQuestion[] {
  const metaById = new Map(meta.map((m) => [String(m.id), m.explanation]));
  return entries.map((entry) => {
    const explanation = metaById.get(String(entry.id));
    const tagged = examFromMetaExplanation(explanation) ?? categoryFromQuestionText(entry.q);
    return {
      id: `${prefix}-${entry.id}`,
      exam: tagged ?? "A+", // Display fallback; examKnown=false keeps it out of per-exam pools.
      examKnown: tagged !== null,
      question: entry.q,
      options: [...entry.opts],
      correctText: entry.ans,
      explanation,
      difficulty,
      source,
    };
  });
}

async function loadHellMode(dataDir: string): Promise<BankQuestion[] | null> {
  const hellPath = path.join(dataDir, "hellmode-bank.ts");
  if (!existsSync(hellPath)) return null;
  try {
    const mod = (await import(pathToFileURL(hellPath).href)) as {
      getHellModeQuestionBank: () => HellModeQuestion[];
    };
    const bank = mod.getHellModeQuestionBank();
    if (!Array.isArray(bank) || bank.length === 0) return null;
    return bank.map((q) => ({
      id: `hm-${q.id}`,
      exam: q.category,
      examKnown: true,
      question: q.question,
      options: [...q.options],
      correctText: q.options[q.correctIndex] ?? "",
      explanation: q.explanation,
      difficulty: "hard" as Difficulty,
      source: "hellmode" as BankSource,
    }));
  } catch {
    // Older Node without type stripping, or a broken import — caller falls back to tier-3 JSON.
    return null;
  }
}

export interface LoadedBank {
  /** All questions, keyed by server-side id. */
  byId: Map<string, BankQuestion>;
  tier1: BankQuestion[];
  tier2: BankQuestion[];
  tier3Json: BankQuestion[];
  hellmode: BankQuestion[] | null;
  bonus: BankQuestion[];
  /** True when Tier 3 serves the real HellMode bank (else tier-3 JSON). */
  tier3IsHellMode: boolean;
}

let bankPromise: Promise<LoadedBank> | null = null;

export function getBank(): Promise<LoadedBank> {
  if (!bankPromise) bankPromise = loadBank();
  return bankPromise;
}

async function loadBank(): Promise<LoadedBank> {
  const dataDir = findDataDir();
  if (!dataDir) {
    throw new Error(
      "Question bank not found: expected artifacts/comptia-quiz/src/data/exam-bank.json " +
        "somewhere above the server, or set QUESTION_BANK_DIR.",
    );
  }
  const raw: TierBankJson = JSON.parse(readFileSync(path.join(dataDir, "exam-bank.json"), "utf8"));
  const meta: ExamMetaJson = JSON.parse(readFileSync(path.join(dataDir, "exam-bank-meta.json"), "utf8"));
  const tier1 = tierQuestions(raw.tier1, meta.tier1, "t1", "easy", "tier1");
  const tier2 = tierQuestions(raw.tier2, meta.tier2, "t2", "medium", "tier2");
  const tier3Json = tierQuestions(raw.tier3, meta.tier3, "t3", "hard", "tier3");
  const bonus = tierQuestions(raw.bonus, meta.bonus, "bonus", "hard", "bonus");
  const hellmode = await loadHellMode(dataDir);
  const byId = new Map<string, BankQuestion>();
  for (const q of [...tier1, ...tier2, ...tier3Json, ...bonus, ...(hellmode ?? [])]) {
    byId.set(q.id, q);
  }
  return { byId, tier1, tier2, tier3Json, hellmode, bonus, tier3IsHellMode: hellmode !== null };
}

/** The Tier 3 pool: real HellMode questions when available, else tier-3 JSON. */
export function tier3Pool(bank: LoadedBank): BankQuestion[] {
  return bank.hellmode ?? bank.tier3Json;
}

/** Pool for a difficulty in fast/full/topic modes (hard = HellMode). */
export function difficultyPool(bank: LoadedBank, difficulty: Difficulty): BankQuestion[] {
  if (difficulty === "easy") return bank.tier1;
  if (difficulty === "medium") return bank.tier2;
  return tier3Pool(bank);
}

// ---------------------------------------------------------------------------
// Deterministic per-set option shuffling + grading
// ---------------------------------------------------------------------------

function hashSeed(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Options for one question, shuffled deterministically for a question set. */
export function shuffledOptions(question: BankQuestion, questionSetId: string): string[] {
  const rand = mulberry32(hashSeed(`${questionSetId}:${question.id}`));
  const options = [...question.options];
  for (let i = options.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [options[i], options[j]] = [options[j], options[i]];
  }
  return options;
}

export function toPublic(question: BankQuestion, questionSetId: string): PublicQuestion {
  const pub: PublicQuestion = {
    id: question.id,
    question: question.question,
    options: shuffledOptions(question, questionSetId),
    category: question.exam,
    difficulty: question.difficulty,
  };
  if (question.scenario) pub.scenario = question.scenario;
  return pub;
}

export function shufflePool<T>(pool: T[], seed: string): T[] {
  const rand = mulberry32(hashSeed(seed));
  const arr = [...pool];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export interface GradedAnswer {
  questionId: string;
  /** True when the selected option text matches the stored answer. */
  correct: boolean;
  /** Index of the correct option in the *served* (shuffled) order. */
  correctIndex: number;
  /** Explanation text (post-submit review only — never served pre-answer). */
  explanation?: string;
  /** Exam the question belongs to (review + weak-area analysis). */
  category: ExamCategory;
}

/** How many scenario-framed questions a simulation carries. */
export const SIMULATION_SCENARIO_COUNT = 5;

/**
 * Attach scenario framing to up to 5 questions of a served simulation
 * set (prefer hard, then medium, then easy — free sims have no hard
 * questions). Returns clones; the cached bank is never mutated.
 * Selection is seeded by questionSetId so a resume reproduces the
 * same scenario assignment.
 */
export function attachScenarios(
  selected: BankQuestion[],
  questionSetId: string,
  exam: ExamCategory | "all",
): BankQuestion[] {
  const prompts = SCENARIO_PROMPTS[exam === "all" ? "A+" : exam] ?? SCENARIO_PROMPTS["A+"];
  const ordered = shufflePool(selected, `${questionSetId}:scenario`);
  const byDifficulty = (d: Difficulty) => ordered.filter((q) => q.difficulty === d);
  const picks: BankQuestion[] = [];
  for (const d of ["hard", "medium", "easy"] as Difficulty[]) {
    for (const q of byDifficulty(d)) {
      if (picks.length >= SIMULATION_SCENARIO_COUNT) break;
      picks.push(q);
    }
    if (picks.length >= SIMULATION_SCENARIO_COUNT) break;
  }
  const pickedIds = new Set(picks.map((q) => q.id));
  return selected.map((q) => {
    if (!pickedIds.has(q.id)) return q;
    const prompt = prompts[picks.findIndex((p) => p.id === q.id) % prompts.length];
    return { ...q, scenario: prompt.replace("{{ISSUE}}", q.question) };
  });
}

export interface GradeResult {
  correct: number;
  total: number;
  rawPct: number;
  scaledScore: number;
  passed: boolean;
  perQuestion: GradedAnswer[];
}

/** CompTIA-style scale: 100 + whole-percent * 8; pass is scaled >= 750 (raw >= 82%). */
export function comptiaScaledScore(rawPct: number): number {
  return Math.max(100, Math.min(900, Math.round(100 + rawPct * 8)));
}

export function gradeAnswers(
  bank: LoadedBank,
  questionSetId: string,
  answers: { questionId: string; selectedIndex: number | null }[],
): GradeResult {
  const perQuestion: GradedAnswer[] = [];
  let correct = 0;
  for (const answer of answers) {
    const question = bank.byId.get(answer.questionId);
    if (!question) continue; // Unknown ids are dropped (caller validates them first).
    const served = shuffledOptions(question, questionSetId);
    const correctIndex = served.indexOf(question.correctText);
    // Unanswered (null) counts as incorrect and IS included in the
    // total — otherwise skipped questions inflate the score (a timer
    // expiry at 10/15 correct must grade 67% → 636, not 100% → 900).
    const isCorrect =
      answer.selectedIndex !== null &&
      answer.selectedIndex !== undefined &&
      served[answer.selectedIndex] === question.correctText;
    if (isCorrect) correct++;
    perQuestion.push({
      questionId: answer.questionId,
      correct: isCorrect,
      correctIndex,
      explanation: question.explanation,
      category: question.exam,
    });
  }
  const total = perQuestion.length;
  const rawPct = total === 0 ? 0 : Math.round((correct / total) * 100);
  const scaledScore = comptiaScaledScore(rawPct);
  return { correct, total, rawPct, scaledScore, passed: scaledScore >= 750, perQuestion };
}

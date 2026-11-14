import rawBank from "./exam-bank.json" with { type: "json" };
import rawMeta from "./exam-bank-meta.json" with { type: "json" };
import type { Question, ExamCategory } from "../lib/scoring.js";
import { shuffleArray, scrambleOptions } from "../lib/scoring.js";
import { getHellModeQuestionBank } from "./hellmode-bank.js";

function categoryFromQuestion(text: string): "A+" | "Network+" | "Security+" | null {
  if (/security\+/i.test(text)) return "Security+";
  if (/network\+/i.test(text)) return "Network+";
  if (/a\+/i.test(text)) return "A+";
  // Some generated networking scenarios omit the exam name.
  if (/packet analyzer|traffic on port|which port|network traffic/i.test(text)) {
    return "Network+";
  }
  return null;
}

export type ExamTier = 1 | 2 | 3;

export interface ExamQuestion {
  id: number | string;
  q: string;
  opts: string[];
  ans: string;
  /** Exam the question belongs to. Written into exam-bank.json by the
   *  P0-1 merge (derived from the meta explanation / question text). */
  exam?: ExamCategory;
  explanation?: string;
}

export interface ExamBank {
  tier1: ExamQuestion[];
  tier2: ExamQuestion[];
  tier3: ExamQuestion[];
  bonus: ExamQuestion[];
}

export interface ExamMeta {
  tier1: { id: number | string; explanation: string }[];
  tier2: { id: number | string; explanation: string }[];
  tier3: { id: number | string; explanation: string }[];
  bonus: { id: number | string; explanation: string }[];
}

const bank: ExamBank = rawBank as ExamBank;
const meta: ExamMeta = rawMeta as ExamMeta;
const curatedHellModeQuestions = getHellModeQuestionBank();
const curatedHellModeExamQuestions: ExamQuestion[] = curatedHellModeQuestions.map((question) => ({
  id: question.id,
  q: question.question,
  opts: question.options,
  ans: question.options[question.correctIndex],
  exam: question.category,
  explanation: question.explanation,
}));

const tierMap: Record<ExamTier, ExamQuestion[]> = {
  1: bank.tier1,
  2: bank.tier2,
  3: bank.tier3,
};

const metaMap: Record<ExamTier, { id: number | string; explanation: string }[]> = {
  1: meta.tier1,
  2: meta.tier2,
  3: meta.tier3,
};

// Exam per question id, derived from the meta explanations (e.g.
// `"SAN" stands for "Storage Area Network" (Network+)`). Fallback for
// any bank entry that does not carry its own `exam` field.
const EXAM_TAG_RE = /A\+ Core [12]|Network\+|Security\+|N10-\d+|SY0-\d+|220-1\d{3}|A\+/;
function examFromTag(tag: string): ExamCategory {
  if (tag.startsWith("A+") || tag.startsWith("220")) return "A+";
  if (tag.startsWith("N10")) return "Network+";
  if (tag.startsWith("SY0")) return "Security+";
  return tag as ExamCategory;
}

const examById = new Map<number | string, ExamCategory>();
for (const tier of ["tier1", "tier2", "tier3", "bonus"] as const) {
  for (const entry of meta[tier] ?? []) {
    const match = EXAM_TAG_RE.exec(entry.explanation);
    if (match) examById.set(entry.id, examFromTag(match[0]));
  }
}

/** The exam a bank entry belongs to: its own `exam` field first, then the
 *  meta-explanation tag, then an explicit mention in the question text,
 *  then a keyword heuristic. Never a hardcoded default. */
export function examForBankEntry(eq: ExamQuestion): ExamCategory {
  if (eq.exam) return eq.exam;
  const fromMeta = examById.get(eq.id);
  if (fromMeta) return fromMeta;
  const fromText = categoryFromQuestion(eq.q);
  if (fromText) return fromText;
  // Last resort only — every entry in the merged bank carries an exam, so
  // this should be unreachable for bank data.
  return "A+";
}

// Per-exam option pools (a question's own options live here too). Used
// ONLY to fill genuinely missing options and to replace duplicated
// options — never to rewrite a question's own distractors.
const optionPools: Record<"A+" | "Network+" | "Security+", string[]> = {
  "A+": [],
  "Network+": [],
  "Security+": [],
};

for (const eq of [...bank.tier1, ...bank.tier2, ...bank.tier3, ...bank.bonus]) {
  const category = examForBankEntry(eq);
  optionPools[category].push(...eq.opts);
}

function replaceDuplicateOptions(
  q: Question,
  categoryOverride?: "A+" | "Network+" | "Security+" | null,
): Question {
  const category = categoryOverride === undefined ? categoryFromQuestion(q.question) : categoryOverride;
  const seen = new Map<string, number>();
  const duplicateIndexes: number[] = [];
  q.options.forEach((option, index) => {
    const previousIndex = seen.get(option);
    if (previousIndex !== undefined) {
      // Preserve the actual correct slot if the source bank duplicated it.
      duplicateIndexes.push(index === q.correctIndex ? previousIndex : index);
    } else {
      seen.set(option, index);
    }
  });
  if (duplicateIndexes.length === 0 || !category) return q;

  const replacements = shuffleArray(
    Array.from(new Set(optionPools[category])).filter((option) => !seen.has(option)),
  );
  const options = [...q.options];
  duplicateIndexes.forEach((index, replacementIndex) => {
    if (replacements[replacementIndex]) options[index] = replacements[replacementIndex];
  });
  return { ...q, options };
}

function optionShape(value: string): string {
  const normalized = value.trim().toLowerCase();
  const words = normalized.split(/\s+/).filter(Boolean);
  const kind = /[/:()[\]{}]/.test(normalized)
    ? "syntax"
    : /^[a-z0-9+.#_-]+$/i.test(normalized)
      ? "term"
      : "phrase";
  return `${kind}:${Math.min(6, words.length)}:${Math.min(4, Math.round(normalized.length / 12))}`;
}

/** Fill genuinely missing options only (fewer than 4, or blank entries).
 *  Replacements come from same-format options in the same exam's pool, so
 *  a port-number question can only gain number-shaped options — never
 *  protocol names. Returns the question unchanged when it already has
 *  four valid options. */
function fillMissingOptions(q: Question): Question {
  const valid = q.options.filter((o) => o && o.trim().length > 0);
  if (valid.length >= 4 && q.options.length === 4) return q;
  const category = q.category;
  const correct = q.options[q.correctIndex];
  const targetShape = correct ? optionShape(correct) : "";
  const pool = optionPools[category] ?? [];
  const sameShape = shuffleArray(
    pool.filter(
      (candidate) =>
        candidate !== correct &&
        !q.options.includes(candidate) &&
        (!targetShape || optionShape(candidate) === targetShape),
    ),
  );
  const anyShape = shuffleArray(
    pool.filter((candidate) => candidate !== correct && !q.options.includes(candidate)),
  );
  const fillers = Array.from(new Set([...sameShape, ...anyShape]));
  const options = [...q.options];
  let fillerIndex = 0;
  for (let i = 0; i < options.length && valid.length + fillerIndex < 4; i++) {
    if (!options[i] || options[i].trim().length === 0) {
      if (fillers[fillerIndex]) options[i] = fillers[fillerIndex++];
    }
  }
  while (options.length < 4 && fillers[fillerIndex]) {
    options.push(fillers[fillerIndex++]);
  }
  if (options.length < 4) return q;
  return { ...q, options };
}

/** Keep each question's own options. Distractors are only generated when
 *  a question genuinely has missing options (see fillMissingOptions), and
 *  duplicated options are replaced from the same exam's pool. Definition
 *  questions keep their authored distractors — the old behaviour of
 *  replacing all three distractors with random correct answers from a
 *  global pool is what put protocol names on port-number questions. */
function enhanceDistractors(q: Question): Question {
  return replaceDuplicateOptions(fillMissingOptions(q));
}

export function getExamBank(): ExamBank {
  return { ...bank, tier3: curatedHellModeExamQuestions };
}

export function getTierQuestions(tier: ExamTier): ExamQuestion[] {
  return tier === 3 ? curatedHellModeExamQuestions : tierMap[tier] || [];
}

export function getBonusQuestions(): ExamQuestion[] {
  return bank.bonus;
}

export function toQuestion(eq: ExamQuestion, difficulty: "easy" | "medium" | "hard" = "medium"): Question {
  const correctIndex = eq.opts.indexOf(eq.ans);
  // Fallback: if ans not in opts, use index 0 (should never happen with valid data)
  const safeIndex = correctIndex >= 0 ? correctIndex : 0;
  return {
    id: typeof eq.id === "string" ? parseInt(eq.id.replace(/\D/g, "") || "0", 10) : eq.id,
    category: examForBankEntry(eq),
    question: eq.q,
    options: eq.opts,
    correctIndex: safeIndex,
    explanation: eq.explanation || `The correct answer is: ${eq.ans}`,
    difficulty,
  };
}

export function toQuestions(eqs: ExamQuestion[]): Question[] {
  return eqs.map((eq) => toQuestion(eq));
}

/** The full unified bank as served questions, in stable (unshuffled)
 *  order: Tier 1 (easy) + Tier 2 (medium) + HellMode Tier 3 (hard).
 *  This is the single source quick modes (Fast/Full/Topic/Simulation/
 *  Weak-area) draw from — 810 questions, 270 per tier. No shuffling,
 *  scrambling, or distractor rewriting here; callers shuffle as needed. */
export function getAllTierQuestions(): Question[] {
  return [
    ...getTierQuestions(1).map((eq) => toQuestion(eq, "easy")),
    ...getTierQuestions(2).map((eq) => toQuestion(eq, "medium")),
    ...curatedHellModeQuestions.map((question) => ({ ...question })),
  ];
}

export function getTierAsQuestions(tier: ExamTier): Question[] {
  if (tier === 3) {
    return shuffleArray(scrambleOptions(curatedHellModeQuestions.map((question) => ({ ...question }))));
  }
  const questions = toQuestions(getTierQuestions(tier));
  if (tier === 2) {
    // Tier 2 questions show as written — no canned scenario boilerplate.
    return shuffleArray(scrambleOptions(questions.map((question) => enhanceDistractors(question))));
  }
  return shuffleArray(scrambleOptions(questions.map((question) => ({ ...enhanceDistractors(question), difficulty: "easy" as const }))));
}

export function getBonusAsQuestions(): Question[] {
  return shuffleArray(scrambleOptions(toQuestions(getBonusQuestions()).map(enhanceDistractors)));
}

export function getExplanationForQuestion(tier: ExamTier, id: number | string): string {
  if (tier === 3) {
    return curatedHellModeExamQuestions.find((question) => question.id === id)?.explanation
      || "Use the decisive log, command result, or protocol behavior in the scenario to identify the root cause.";
  }
  const entry = metaMap[tier]?.find((m) => m.id === id);
  return entry?.explanation || "The correct answer is documented in the CompTIA objectives.";
}

export function getBonusExplanation(id: number | string): string {
  const entry = meta.bonus.find((m) => m.id === id);
  return entry?.explanation || "The correct answer is documented in the CompTIA objectives.";
}

export function getTierTimeLimitSeconds(tier: ExamTier): number {
  const count = getTierQuestions(tier).length;
  const secondsPerQuestion = tier === 1 ? 75 : tier === 2 ? 60 : 45;
  return count * secondsPerQuestion;
}

/** Total served tier questions: Tier 1 + Tier 2 + served Tier 3
 *  (HellMode). The dead tier3 JSON is NOT counted — getTierQuestions(3)
 *  serves the HellMode bank instead. Must equal EXAM_COUNTS.all (810). */
export function allTiersQuestionCount(): number {
  return (
    getTierQuestions(1).length + getTierQuestions(2).length + getTierQuestions(3).length
  );
}

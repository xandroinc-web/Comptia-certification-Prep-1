import rawBank from "./exam-bank.json";
import rawMeta from "./exam-bank-meta.json";
import { scrambleOptions } from "./questions";
import type { Question } from "./questions";

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

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

function extractQuotedTerm(text: string): string | null {
  const match = text.match(/["“]([^"”]+)["”]/);
  const term = match?.[1]?.trim();
  // Only treat compact technical abbreviations as reversible acronym prompts.
  if (!term || term.length > 24 || !/^[A-Z0-9][A-Z0-9+.#/_-]{1,23}$/.test(term)) {
    return null;
  }
  return term;
}

export type ExamTier = 1 | 2 | 3;

export interface ExamQuestion {
  id: number | string;
  q: string;
  opts: string[];
  ans: string;
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

// Global distractor pool drawn from all correct answers in the exam bank.
const allCorrectAnswers = Array.from(
  new Set([...bank.tier1, ...bank.tier2, ...bank.tier3, ...bank.bonus].map((eq) => eq.ans)),
).filter(Boolean);

const acronymPools: Record<"A+" | "Network+" | "Security+", string[]> = {
  "A+": [],
  "Network+": [],
  "Security+": [],
};

const optionPools: Record<"A+" | "Network+" | "Security+", string[]> = {
  "A+": [],
  "Network+": [],
  "Security+": [],
};

for (const eq of [...bank.tier1, ...bank.tier2, ...bank.tier3, ...bank.bonus]) {
  const category = categoryFromQuestion(eq.q);
  if (!category) continue;
  const acronym = extractQuotedTerm(eq.q);
  if (acronym && !acronymPools[category].includes(acronym)) {
    acronymPools[category].push(acronym);
  }
  optionPools[category].push(...eq.opts);
}

function isDefinitionQuestion(q: Question): boolean {
  const questionText = q.question.toLowerCase();
  const correctText = q.options[q.correctIndex].toLowerCase();
  if (questionText.includes(correctText)) return true;
  const words = correctText.split(/\s+/).filter((w) => w.length > 3);
  if (words.length > 0) {
    const matches = words.filter((w) => questionText.includes(w)).length;
    if (matches / words.length >= 0.6) return true;
  }
  if (
    /what does .* stand for|what is the meaning of|what does .* mean|what does .* refer to|what is .* an acronym for|full meaning|full form|abbreviation|acronym/i.test(
      q.question,
    )
  ) {
    return true;
  }
  return false;
}

function replaceDuplicateOptions(q: Question): Question {
  const category = categoryFromQuestion(q.question);
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

function choosePlausibleDistractors(q: Question, pool: string[]): string[] {
  const correct = q.options[q.correctIndex];
  const targetShape = optionShape(correct);
  const sameShape = shuffleArray(
    pool.filter((candidate) => candidate !== correct && optionShape(candidate) === targetShape),
  );
  const nearby = shuffleArray(
    pool.filter((candidate) => candidate !== correct && Math.abs(candidate.length - correct.length) < 18),
  );
  return Array.from(new Set([...sameShape, ...nearby])).slice(0, 3);
}

function enhanceDistractors(q: Question): Question {
  const category = categoryFromQuestion(q.question);
  const sourcePool = category ? optionPools[category] : allCorrectAnswers;
  const plausible = choosePlausibleDistractors(q, sourcePool);
  if (!isDefinitionQuestion(q)) {
    return replaceDuplicateOptions(q);
  }
  const correct = q.options[q.correctIndex];
  const distractors = plausible.length >= 3
    ? plausible
    : shuffleArray(sourcePool.filter((a) => a !== correct)).slice(0, 3);
  if (distractors.length < 3) return replaceDuplicateOptions(q);
  const newOptions = shuffleArray([correct, ...distractors]);
  const newCorrectIndex = newOptions.indexOf(correct);
  return replaceDuplicateOptions({
    ...q,
    options: newOptions,
    correctIndex: newCorrectIndex,
  });
}

function applyMediumScenario(q: Question): Question {
  if (q.question.startsWith("Applied constraint:") || q.question.length > 210) {
    return { ...q, difficulty: "medium" };
  }
  return {
    ...q,
    difficulty: "medium",
    question:
      `Applied constraint: a technician must preserve the stated requirement while changing only the affected layer. ` +
      `Evidence has been gathered before remediation. Which answer best fits both the observation and the required outcome? ${q.question}`,
  };
}

function hardenHellModeQuestion(q: Question): Question {
  const acronym = extractQuotedTerm(q.question);
  const category = categoryFromQuestion(q.question);
  const correctExpansion = q.options[q.correctIndex];

  // Reverse direct acronym-definition prompts into applied recognition prompts.
  if (acronym && category && acronymPools[category].length >= 4) {
    const context =
      category === "Security+"
        ? "a security control review"
        : category === "Network+"
          ? "a network change review"
          : "a production support escalation";
    const acronymOptions = shuffleArray(
      acronymPools[category].filter((term) => term !== acronym),
    ).slice(0, 3);
    const options = shuffleArray([acronym, ...acronymOptions]);
    return {
      ...q,
      question: `During ${context}, the team must implement or identify "${correctExpansion}". A reviewer says two controls appear plausible, but only one matches the evidence and the stated requirement. Which acronym should be documented for this requirement?`,
      options,
      correctIndex: options.indexOf(acronym),
      difficulty: "hard",
    };
  }

  const base = replaceDuplicateOptions(q);
  const sourcePool = category ? optionPools[category] : allCorrectAnswers;
  const plausibleDistractors = choosePlausibleDistractors(base, sourcePool);
  const options = plausibleDistractors.length >= 3
    ? shuffleArray([base.options[base.correctIndex], ...plausibleDistractors])
    : base.options;
  const hardened: Question = {
    ...base,
    options,
    correctIndex: options.indexOf(base.options[base.correctIndex]),
    difficulty: "hard",
  };
  if (hardened.question.startsWith("Forensic case:")) return hardened;
  return {
    ...hardened,
    question:
      `HellMode case: two symptoms appeared after a controlled change, but only one is causal. ` +
      `Account for dependencies, evidence order, competing plausible answers, and the least-disruptive corrective action before answering. ` +
      `${hardened.question} Select the single answer that best satisfies the requirement without introducing a new risk.`,
  };
}

export function getExamBank(): ExamBank {
  return bank;
}

export function getTierQuestions(tier: ExamTier): ExamQuestion[] {
  return tierMap[tier] || [];
}

export function getBonusQuestions(): ExamQuestion[] {
  return bank.bonus;
}

export function toQuestion(eq: ExamQuestion): Question {
  const correctIndex = eq.opts.indexOf(eq.ans);
  // Fallback: if ans not in opts, use index 0 (should never happen with valid data)
  const safeIndex = correctIndex >= 0 ? correctIndex : 0;
  return {
    id: typeof eq.id === "string" ? parseInt(eq.id.replace(/\D/g, "") || "0", 10) : eq.id,
    category: "A+",
    question: eq.q,
    options: eq.opts,
    correctIndex: safeIndex,
    explanation: eq.explanation || `The correct answer is: ${eq.ans}`,
    difficulty: "medium",
  };
}

export function toQuestions(eqs: ExamQuestion[]): Question[] {
  return eqs.map(toQuestion);
}

export function getTierAsQuestions(tier: ExamTier): Question[] {
  const questions = toQuestions(getTierQuestions(tier));
  if (tier === 3) {
    return scrambleOptions(questions.map(hardenHellModeQuestion));
  }
  if (tier === 2) {
    return scrambleOptions(questions.map((question) => applyMediumScenario(enhanceDistractors(question))));
  }
  return scrambleOptions(questions.map((question) => ({ ...enhanceDistractors(question), difficulty: "easy" })));
}

export function getBonusAsQuestions(): Question[] {
  return scrambleOptions(toQuestions(getBonusQuestions()).map(enhanceDistractors));
}

export function getExplanationForQuestion(tier: ExamTier, id: number | string): string {
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

export function allTiersQuestionCount(): number {
  return bank.tier1.length + bank.tier2.length + bank.tier3.length;
}

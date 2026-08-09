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
// Used to replace weak definition-question distractors with plausible peer terms.
const allCorrectAnswers = Array.from(
  new Set([...bank.tier1, ...bank.tier2, ...bank.tier3, ...bank.bonus].map((eq) => eq.ans)),
).filter(Boolean);

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
    /what does .* stand for|what is the meaning of|what does .* mean|what does .* refer to|what is .* an acronym for/i.test(
      q.question,
    )
  ) {
    return true;
  }
  return false;
}

function enhanceDistractors(q: Question): Question {
  if (!isDefinitionQuestion(q)) return q;
  const correct = q.options[q.correctIndex];
  const pool = shuffleArray(allCorrectAnswers.filter((a) => a !== correct));
  if (pool.length < 3) return q;
  const distractors = pool.slice(0, 3);
  const newOptions = shuffleArray([correct, ...distractors]);
  const newCorrectIndex = newOptions.indexOf(correct);
  return { ...q, options: newOptions, correctIndex: newCorrectIndex };
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
  return scrambleOptions(toQuestions(getTierQuestions(tier))).map(enhanceDistractors);
}

export function getBonusAsQuestions(): Question[] {
  return scrambleOptions(toQuestions(getBonusQuestions())).map(enhanceDistractors);
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
  // Real CompTIA exams are ~90 minutes for 90 questions => 1 min/q
  return count * 60;
}

export function allTiersQuestionCount(): number {
  return bank.tier1.length + bank.tier2.length + bank.tier3.length;
}

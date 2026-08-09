import { questions, Question, Difficulty, shuffleArray, scrambleOptions } from "./questions";
import rawBank from "./exam-bank.json";
import rawMeta from "./exam-bank-meta.json";
import { DomainTopic, ALL_DOMAINS, DOMAIN_METADATA } from "./topics";

interface RawBank {
  tier1: Array<{ id: number | string; q: string; opts: string[]; ans: string }>;
  tier2: Array<{ id: number | string; q: string; opts: string[]; ans: string }>;
  tier3: Array<{ id: number | string; q: string; opts: string[]; ans: string }>;
  bonus: Array<{ id: number | string; q: string; opts: string[]; ans: string }>;
}

interface RawMeta {
  tier1: Array<{ id: number | string; explanation: string }>;
  tier2: Array<{ id: number | string; explanation: string }>;
  tier3: Array<{ id: number | string; explanation: string }>;
  bonus: Array<{ id: number | string; explanation: string }>;
}

const bank = rawBank as RawBank;
const meta = rawMeta as RawMeta;

const metaById: Record<string, string> = {};
for (const [tier, entries] of Object.entries(meta)) {
  for (const entry of entries) {
    metaById[`${tier}-${entry.id}`] = entry.explanation;
  }
}

const EXAM_BANK_ID_OFFSET = 10000;

function convertExamQuestion(
  eq: RawBank["tier1"][number],
  tier: string
): Question {
  const correctIndex = eq.opts.indexOf(eq.ans);
  const safeIndex = correctIndex >= 0 ? correctIndex : 0;
  const difficulty: Difficulty =
    tier === "tier1" ? "easy" : tier === "tier2" ? "medium" : "hard";
  const key = `${tier}-${eq.id}`;
  const explanation = metaById[key] || `The correct answer is: ${eq.ans}`;
  const numericId =
    typeof eq.id === "string"
      ? parseInt(eq.id.replace(/\D/g, "") || "0", 10)
      : eq.id;
  return {
    id: EXAM_BANK_ID_OFFSET + numericId,
    category: "A+",
    question: eq.q,
    options: eq.opts,
    correctIndex: safeIndex,
    explanation,
    difficulty,
  };
}

function scoreTextForTopic(text: string, topic: DomainTopic): number {
  const keywords = DOMAIN_METADATA[topic].keywords;
  return keywords.reduce((sum, kw) => {
    const regex = new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    return sum + (text.match(regex) || []).length;
  }, 0);
}

/** Detect "definition" questions where the correct answer is literally spelled
 *  out in the question text (e.g. "What does SAN stand for?"). These are too easy.
 */
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
      q.question
    )
  ) {
    return true;
  }

  return false;
}

function buildAllQuestions(): Question[] {
  const all: Question[] = [...questions];
  for (const tier of ["tier1", "tier2", "tier3", "bonus"] as const) {
    for (const eq of bank[tier]) {
      all.push(convertExamQuestion(eq, tier));
    }
  }
  return all;
}

const allQuestions = buildAllQuestions();

// Per-topic distractor pools drawn from real correct answers in the same domain.
// Replacing obviously-wrong exam-bank distractors with plausible topic peers makes
// definition-style questions harder without changing the correct answer.
const distractorPools: Record<DomainTopic, string[]> = {} as Record<DomainTopic, string[]>;
for (const topic of ALL_DOMAINS) {
  const correctAnswers = new Set<string>();
  for (const q of allQuestions) {
    if (scoreTextForTopic(q.question + " " + q.explanation, topic) > 0) {
      correctAnswers.add(q.options[q.correctIndex]);
    }
  }
  distractorPools[topic] = Array.from(correctAnswers).filter(Boolean);
}

// Build a scored pool for every topic. Regular scenario questions get a bonus,
// definition questions where the answer is in the question are heavily penalized.
const scoredPool: Record<
  DomainTopic,
  Array<{ q: Question; score: number; isDefinition: boolean }>
> = {} as Record<DomainTopic, Array<{ q: Question; score: number; isDefinition: boolean }>>;

for (const topic of ALL_DOMAINS) {
  scoredPool[topic] = allQuestions
    .map((q) => {
      const keywordScore = scoreTextForTopic(
        q.question + " " + q.explanation,
        topic
      );
      const isDefinition = isDefinitionQuestion(q);
      let qualityScore = keywordScore;
      // Regular (non-exam-bank) questions are scenario-based; give them a bonus.
      if (q.id < EXAM_BANK_ID_OFFSET) qualityScore += 3;
      // Heavily penalize giveaway definition questions so scenario questions win.
      if (isDefinition) qualityScore -= 20;
      return { q, score: qualityScore, isDefinition };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);
}

/** Replace weak distractors with real peer terms from the same topic.
 *  Only applied to definition-style questions; scenario questions keep their original distractors.
 */
function enhanceDistractors(q: Question, topic: DomainTopic): Question {
  const correct = q.options[q.correctIndex];
  const pool = distractorPools[topic].filter((a) => a !== correct);
  if (pool.length < 3) return q;

  const distractors = shuffleArray(pool).slice(0, 3);
  const newOptions = shuffleArray([correct, ...distractors]);
  const newCorrectIndex = newOptions.indexOf(correct);
  return { ...q, options: newOptions, correctIndex: newCorrectIndex };
}

export function getTopicPoolCount(topic: DomainTopic): number {
  return scoredPool[topic]?.filter((item) => item.score > 0).length || 0;
}

export function getTopicPoolCounts(): Record<DomainTopic, number> {
  return Object.fromEntries(
    ALL_DOMAINS.map((t) => [t, getTopicPoolCount(t)])
  ) as Record<DomainTopic, number>;
}

/** Build a mixed-difficulty topic quiz. Defaults to 30 questions (10 easy, 10 medium, 10 hard)
 *  sourced from the full Trifecta bank. Scenario questions are selected first; only remaining
 *  slots fall back to definition questions, whose distractors are swapped for plausible topic peers.
 */
export function getMixedTopicQuestions(
  topic: DomainTopic,
  count: number = 30
): Question[] {
  const pool = scoredPool[topic] || [];
  if (pool.length === 0) return [];

  const perDiff = Math.floor(count / 3);
  const selected: Question[] = [];
  const selectedIds = new Set<number>();

  function pickMatches(difficulty: Difficulty, preferScenario: boolean) {
    return pool.filter((item) => {
      if (item.q.difficulty !== difficulty) return false;
      if (selectedIds.has(item.q.id)) return false;
      if (preferScenario && item.isDefinition) return false;
      return true;
    });
  }

  // First pass: select scenario questions for each difficulty.
  for (const d of ["easy", "medium", "hard"] as Difficulty[]) {
    const matches = pickMatches(d, true);
    const shuffled = shuffleArray(matches);
    const take = Math.min(perDiff, shuffled.length);
    for (let i = 0; i < take; i++) {
      selected.push(shuffled[i].q);
      selectedIds.add(shuffled[i].q.id);
    }
  }

  // Second pass: fill any remaining slots with the next best available questions.
  const remaining = count - selected.length;
  if (remaining > 0) {
    const rest = shuffleArray(pool.filter((item) => !selectedIds.has(item.q.id)));
    for (let i = 0; i < Math.min(remaining, rest.length); i++) {
      selected.push(rest[i].q);
      selectedIds.add(rest[i].q.id);
    }
  }

  // Toughen up any definition questions that made it through.
  const enhanced = selected.map((q) => {
    const meta = pool.find((item) => item.q.id === q.id);
    return meta?.isDefinition ? enhanceDistractors(q, topic) : q;
  });
  return scrambleOptions(shuffleArray(enhanced));
}

/** Return 9 topics in random order for the "random mode" topic study selector. */
export function getTopicsInRandomOrder(): DomainTopic[] {
  return shuffleArray([...ALL_DOMAINS]);
}

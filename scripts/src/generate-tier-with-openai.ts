import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import OpenAI from "openai";
type ExamTier = 1 | 2 | 3;

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PDF_TEXT = {
  core1: path.resolve(__dirname, "../../tmp/pdf-text/core1.txt"),
  core2: path.resolve(__dirname, "../../tmp/pdf-text/core2.txt"),
  network: path.resolve(__dirname, "../../tmp/pdf-text/network.txt"),
  security: path.resolve(__dirname, "../../tmp/pdf-text/security.txt"),
};

const SOURCE_LABEL: Record<string, string> = {
  core1: "A+ Core 1",
  core2: "A+ Core 2",
  network: "Network+",
  security: "Security+",
};

interface Question {
  id: number | string;
  q: string;
  opts: string[];
  ans: string;
  explanation: string;
  source: string;
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const MODEL = "gpt-4o-mini";

function loadTexts(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, file] of Object.entries(PDF_TEXT)) {
    out[key] = fs.readFileSync(file, "utf8");
  }
  return out;
}

function splitText(text: string, maxChars: number): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + maxChars, text.length);
    // Try to break at a newline
    let breakPoint = end;
    if (end < text.length) {
      const newlinePos = text.lastIndexOf("\n", end);
      if (newlinePos > start) {
        breakPoint = newlinePos;
      }
    }
    chunks.push(text.slice(start, breakPoint).trim());
    start = breakPoint;
  }
  return chunks;
}

async function generateQuestionsForChunk(
  source: string,
  chunk: string,
  tier: ExamTier,
  count: number,
  startId: number
): Promise<Question[]> {
  const tierName = tier === 1 ? "Mild" : tier === 2 ? "Medium" : "HellMode";
  const difficultyDesc =
    tier === 1
      ? "straightforward recall/definition questions (acronyms, ports, basic concepts)"
      : tier === 2
      ? "application/scenario questions where the test taker must pick the right tool, protocol, or action for a situation"
      : "complex troubleshooting/analysis questions that require multiple steps of reasoning";

  const prompt = `
You are a CompTIA exam writer. Use ONLY the following official CompTIA exam objectives text to create ${count} multiple-choice questions for the ${tierName} tier (${difficultyDesc}).

Source: ${source}

Text:
---
${chunk}
---

For each question:
- Provide 4 answer choices (one correct, three plausible distractors).
- The correct answer must be explicitly derivable from the text above.
- Include a brief correction/explanation that reinforces the right answer or explains why the wrong choices are wrong.

Output ONLY a JSON array with no markdown code fences, in this exact shape:
[
  {
    "q": "Question text",
    "opts": ["A", "B", "C", "D"],
    "ans": "B",
    "explanation": "Why B is correct."
  }
]
`;

  const response = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: "You generate CompTIA exam questions in JSON only." },
      { role: "user", content: prompt },
    ],
    response_format: { type: "json_object" },
    max_tokens: 4000,
    temperature: 0.7,
  });

  const raw = response.choices[0].message.content || "[]";
  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    console.error("JSON parse error for chunk", source, e);
    console.error("Raw:", raw.slice(0, 500));
    return [];
  }

  const questions: Question[] = [];
  const arr = Array.isArray(parsed) ? parsed : parsed.questions || parsed.data || [];
  for (let i = 0; i < arr.length; i++) {
    const item = arr[i];
    if (!item.q || !Array.isArray(item.opts) || item.opts.length !== 4 || !item.ans || !item.explanation) {
      continue;
    }
    // Ensure the correct answer is in the options
    if (!item.opts.includes(item.ans)) {
      // Try to find a close match
      const normalized = item.ans.toLowerCase().trim();
      const match = item.opts.find((o: string) => o.toLowerCase().trim() === normalized);
      if (match) item.ans = match;
      else continue;
    }
    questions.push({
      id: startId + i,
      q: item.q,
      opts: item.opts,
      ans: item.ans,
      explanation: item.explanation,
      source: SOURCE_LABEL[source] || source,
    });
  }
  return questions;
}

export async function generateTier(tier: ExamTier, targetCount: number): Promise<Question[]> {
  const texts = loadTexts();
  const allQuestions: Question[] = [];
  let id = tier === 1 ? 1 : tier === 2 ? 271 : 541;

  // For each source, split into chunks and generate questions proportional to text length
  const totalLen = Object.values(texts).reduce((a, b) => a + b.length, 0);

  for (const [key, text] of Object.entries(texts)) {
    const sourceCount = Math.round((text.length / totalLen) * targetCount);
    const chunkCount = Math.ceil(sourceCount / 20); // 20 questions per chunk per source
    const charsPerChunk = Math.ceil(text.length / chunkCount);
    const chunks = splitText(text, charsPerChunk);

    for (const chunk of chunks) {
      if (allQuestions.length >= targetCount) break;
      const remaining = targetCount - allQuestions.length;
      const count = Math.min(20, Math.max(5, remaining));
      const qs = await generateQuestionsForChunk(key, chunk, tier, count, id);
      for (const q of qs) {
        q.id = id++;
        allQuestions.push(q);
      }
      console.log(`Generated ${allQuestions.length}/${targetCount} for tier ${tier}`);
      if (allQuestions.length >= targetCount) break;
    }
    if (allQuestions.length >= targetCount) break;
  }

  // Trim to exact count
  return allQuestions.slice(0, targetCount).map((q, i) => ({ ...q, id: tier === 1 ? i + 1 : tier === 2 ? i + 271 : i + 541 }));
}

export async function generateBonus(count: number): Promise<Question[]> {
  const texts = loadTexts();
  // Combine all texts
  const allText = Object.entries(texts).map(([k, v]) => `SOURCE: ${SOURCE_LABEL[k]}\n${v}`).join("\n\n---\n\n");
  const prompt = `
You are a CompTIA exam writer. Use ONLY the following official CompTIA exam objectives text to create ${count} challenging multiple-choice questions as a bonus round for users who scored 95%+.

${allText}

For each question:
- Provide 4 answer choices (one correct, three plausible distractors).
- The correct answer must be explicitly derivable from the text above.
- Include a brief correction/explanation.

Output ONLY a JSON array in this shape:
[
  {
    "q": "Question text",
    "opts": ["A", "B", "C", "D"],
    "ans": "B",
    "explanation": "Why B is correct."
  }
]
`;

  const response = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: "You generate CompTIA exam questions in JSON only." },
      { role: "user", content: prompt },
    ],
    response_format: { type: "json_object" },
    max_tokens: 4000,
    temperature: 0.7,
  });

  const raw = response.choices[0].message.content || "[]";
  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    console.error("JSON parse error for bonus", e);
    return [];
  }

  const arr = Array.isArray(parsed) ? parsed : parsed.questions || parsed.data || [];
  return arr.slice(0, count).map((item: any, i: number) => ({
    id: `B${i + 1}`,
    q: item.q,
    opts: item.opts,
    ans: item.ans,
    explanation: item.explanation,
    source: "Bonus",
  }));
}

async function main() {
  const tier = Number(process.argv[2]) as ExamTier;
  if (![1, 2, 3].includes(tier)) {
    console.error("Usage: tsx generate-tier-with-openai.ts <tier>");
    process.exit(1);
  }

  const targetCount = 270;
  console.log(`Generating Tier ${tier} (${targetCount} questions)...`);
  const questions = await generateTier(tier, targetCount);
  const outPath = path.resolve(__dirname, `../../artifacts/comptia-quiz/src/data/exam-bank-tier${tier}.json`);
  fs.writeFileSync(outPath, JSON.stringify({ [`tier${tier}`]: questions }, null, 2));
  console.log(`Wrote ${outPath} with ${questions.length} questions`);

  // Show sample
  console.log("Sample:");
  console.log(JSON.stringify(questions.slice(0, 3), null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

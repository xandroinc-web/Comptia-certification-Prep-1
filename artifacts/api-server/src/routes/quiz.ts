/**
 * Quiz + entitlements routes (P0-3, P0-4).
 *
 * Mounted under /api (see routes/index.ts):
 *   POST /api/quiz/sessions        (auth) create/update an in-progress session
 *   GET  /api/quiz/sessions/:id    (auth, owner only) resume a session
 *   GET  /api/quiz/questions       (auth optional) serve a stripped question set
 *   POST /api/quiz/submit          (auth optional for free, required for Pro-gated)
 *   GET  /api/entitlements         (auth optional — see note below)
 *   POST /api/entitlements/usage   (auth optional) record free usage
 *
 * PAYWALL MODEL (all enforced here, never in the browser) — new model
 * Nov 13 2026, "Taste. Train. Prove." Practice and the test are two
 * different products; neither includes the other:
 *   Free taste — ONE-TIME ONLY per user, ever. The user spends it
 *   ONE of two ways: (a) up to 30 free questions total (Easy
 *   difficulty, Tier 1 only), or (b) ONE free half-simulation
 *   (45 questions / 45 minutes, easy+medium questions only).
 *   Either/or: once any free question has been answered, free sims
 *   are locked; once a free sim has been taken, free questions are
 *   locked. When the taste is spent, further questions need a
 *   Practice Membership and further sims need a test attempt.
 *   Simulation questions do NOT consume the question allowance.
 *   Practice Membership ($20/mo) — unlimited practice: fast/full/
 *   tier quizzes, drills, all exams, Medium/Hard difficulty, Tier
 *   2/3. It grants NO full-test attempts.
 *   Full Test ($9.99/exam, one-time) — ONE attempt at the full
 *   90-question / 90-minute simulation for one exam (5 scenario
 *   questions, 750 pass), valid 90 days. Trifecta Tests ($24.99)
 *   grants ONE attempt per exam. An attempt is consumed atomically
 *   on sim start; admin bypasses. A test purchase grants NO practice.
 *   A free simulation is a HALF-simulation — 45 questions / 45
 *   minutes; a paid sim (or admin) is the full 90 questions /
 *   90 minutes.
 *   Medium/Hard difficulty and Tier 2/3 need Practice Membership
 *   (entitlements row or active Stripe subscription with a
 *   plan=membership price, or ADMIN_USER_IDS).
 *   Tier 2/3 additionally need a server-verified pass (>= 750 scaled,
 *   i.e. >= 82% raw) of the previous tier in `quiz_results`, signed in.
 *
 *   Caps are enforced at SERVE time. Submit re-checks only the durable
 *   gates (auth + membership + tier unlock) — not the consumable caps — so a
 *   set that was legitimately served is never blocked at grading time
 *   by the cap its own serve consumed. Re-serving an existing
 *   session's questionSetId (resume) is exempt from cap counting —
 *   the set was counted at quiz start and re-serving it returns the
 *   same questions. For a resumed simulation the pool is inferred from
 *   the stored question ids (any hard question means the original
 *   serve used the full bank) and the served count is the stored
 *   question count, so a resume returns exactly the original set.
 *   For membership-gated submits the client
 *   must also pass the `sessionId` of a session it created for this
 *   quiz (owner-checked); otherwise the grading endpoint would be a
 *   free correctness oracle for paid questions.
 *
 * NOTE on GET /api/entitlements: the spec said "auth required", but the
 * anonymous free tier cannot work that way — the client needs to read
 * its remaining free allowance before sign-in, and the server is still
 * the authority (caps are enforced at serve time regardless of what
 * the client displays). So this endpoint is auth-OPTIONAL: signed-in
 * callers get their user usage + Pro status; anonymous callers pass
 * ?anonId= and get anon usage; anonymous callers without anonId get
 * usage counts of 0.
 */
import { Router, type IRouter, type Request, type Response } from "express";
import { randomUUID } from "node:crypto";
import { db } from "@workspace/db";
import {
  quizSessionsTable,
  quizResultsTable,
  insertQuizSessionSchema,
  updateQuizSessionSchema,
  type ExamScope,
  type FreeUsageKind,
} from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import {
  getBank,
  tier3Pool,
  difficultyPool,
  shufflePool,
  shuffledOptions,
  toPublic,
  gradeAnswers,
  attachScenarios,
  EXAMS,
  TIER_DIFFICULTY,
  type BankQuestion,
  type Difficulty,
  type ExamCategory,
  type LoadedBank,
} from "../lib/questionBank.js";
import {
  FREE_QUESTIONS_TOTAL,
  FREE_SIMS_TOTAL,
  TIER_PASS_SCALED_SCORE,
  getOptionalUserId,
  getUserId,
  requireAuth,
  hasPassedTier,
  getFreeTrialState,
  recordFreeUsage,
  normalizeAnonId,
} from "../lib/entitlements.js";
import { resolveAccess, consumeTestAttempt } from "../lib/access.js";

const router: IRouter = Router();

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

type QuizMode = "fast" | "full" | "tier" | "simulation" | "topic";

const MODES: QuizMode[] = ["fast", "full", "tier", "simulation", "topic"];
const MODE_DEFAULT_COUNT: Record<QuizMode, number> = {
  fast: 15,
  full: 30,
  tier: 270,
  simulation: 90,
  topic: 15,
};

/** Free simulations are a half-simulation: 45 questions / 45 minutes.
 *  Pro keeps the full 90-question / 90-minute simulation. */
const FREE_SIM_QUESTIONS = 45;

function isExam(value: unknown): value is ExamCategory {
  return typeof value === "string" && (EXAMS as string[]).includes(value);
}

function parseExam(value: unknown): ExamCategory | "all" {
  if (isExam(value)) return value;
  return "all";
}

function parseMode(value: unknown): QuizMode | null {
  return typeof value === "string" && (MODES as string[]).includes(value) ? (value as QuizMode) : null;
}

function parseTier(value: unknown): 1 | 2 | 3 | null {
  const n = typeof value === "string" ? Number(value) : typeof value === "number" ? value : NaN;
  return n === 1 || n === 2 || n === 3 ? n : null;
}

function parseDifficulty(value: unknown): Difficulty | null {
  return value === "easy" || value === "medium" || value === "hard" ? value : null;
}

function parseCount(value: unknown, fallback: number): number {
  const n = typeof value === "string" ? Number(value) : typeof value === "number" ? value : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(270, Math.floor(n)));
}

function filterByExam(pool: BankQuestion[], exam: ExamCategory | "all"): BankQuestion[] {
  // Per-exam pools contain only questions actually tagged for that exam.
  // Untagged questions (examKnown=false) serve only in mixed pools.
  return exam === "all" ? pool : pool.filter((q) => q.examKnown && q.exam === exam);
}

function error(res: Response, status: number, message: string, code?: string): void {
  res.status(status).json(code ? { error: message, code } : { error: message });
}

/**
 * Durable gates for a requested quiz (auth + membership + tier unlock).
 * Returns an error response descriptor, or null when allowed.
 * Consumable caps (question cap, sim attempts) are NOT checked here —
 * they are enforced at serve time only (see the questions handler).
 */
async function checkDurableGates(
  userId: string | null,
  isMember: boolean,
  mode: QuizMode,
  tier: 1 | 2 | 3 | null,
  difficulty: Difficulty | null,
): Promise<{ status: number; message: string; code: string } | null> {
  if (mode === "tier" && tier !== null && tier >= 2) {
    if (!userId) return { status: 401, message: "Sign in to play Tier 2 and Tier 3 exams.", code: "AUTH_REQUIRED" };
    if (!isMember) return { status: 403, message: "Tier 2 and Tier 3 require a Practice Membership.", code: "PRO_REQUIRED" };
    const passed = await hasPassedTier(userId, tier - 1);
    if (!passed) {
      return {
        status: 403,
        message: `Pass Tier ${tier - 1} (750+ scaled score) to unlock Tier ${tier}.`,
        code: "TIER_LOCKED",
      };
    }
    return null;
  }
  // In tier mode the tier itself sets the difficulty, so a stray
  // difficulty parameter must not gate a Tier 1 exam.
  if (mode !== "tier" && (difficulty === "medium" || difficulty === "hard")) {
    if (!userId) return { status: 401, message: "Sign in to play Medium and Hard questions.", code: "AUTH_REQUIRED" };
    if (!isMember) return { status: 403, message: "Medium and Hard difficulty require a Practice Membership.", code: "PRO_REQUIRED" };
  }
  return null;
}

/**
 * Order a pool unseen-first for a signed-in user: questions the user
 * has never answered correctly come first (unseen, then previously
 * answered incorrectly), and correctly-answered ones only once those
 * pools are exhausted — so the quiz keeps prepping the user for the
 * real exam instead of repeating memorized questions.
 *
 * Determined from the user's saved quiz sessions (the server already
 * stores per-question answers there, with the questionSetId that
 * reproduces the served option order, so correctness is recomputed
 * exactly). No new tracking store. Guests keep the plain shuffled
 * order (no persistent identity to track). Counts and pools are
 * unchanged — only the selection priority changes.
 */
async function orderUnseenFirst(
  bank: LoadedBank,
  shuffled: BankQuestion[],
  userId: string,
): Promise<BankQuestion[]> {
  const poolIds = new Set(shuffled.map((q) => q.id));
  const sessions = await db
    .select({
      questionSetId: quizSessionsTable.questionSetId,
      answers: quizSessionsTable.answers,
    })
    .from(quizSessionsTable)
    .where(eq(quizSessionsTable.userId, userId));
  const correct = new Set<string>();
  const incorrect = new Set<string>();
  for (const session of sessions) {
    const qsid = session.questionSetId;
    if (!qsid) continue;
    const answers = session.answers ?? [];
    for (const a of answers) {
      if (a.selectedIndex === null || a.selectedIndex === undefined) continue;
      if (!poolIds.has(a.questionId)) continue;
      if (correct.has(a.questionId)) continue;
      const q = bank.byId.get(a.questionId);
      if (!q) continue;
      const served = shuffledOptions(q, qsid);
      if (served[a.selectedIndex] === q.correctText) correct.add(a.questionId);
      else incorrect.add(a.questionId);
    }
  }
  // Answered correctly ever counts as mastered even if missed once.
  for (const id of correct) incorrect.delete(id);
  const unseen: BankQuestion[] = [];
  const missed: BankQuestion[] = [];
  const mastered: BankQuestion[] = [];
  for (const q of shuffled) {
    if (correct.has(q.id)) mastered.push(q);
    else if (incorrect.has(q.id)) missed.push(q);
    else unseen.push(q);
  }
  return [...unseen, ...missed, ...mastered];
}

// ---------------------------------------------------------------------------
// Sessions (P0-3)
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isInt(value: unknown, min?: number, max?: number): value is number {
  if (typeof value !== "number" || !Number.isInteger(value)) return false;
  if (min !== undefined && value < min) return false;
  if (max !== undefined && value > max) return false;
  return true;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
  );
}

interface AnswerInput {
  questionId: string;
  /** Null = unanswered. Unanswered counts as incorrect and IS included
   *  in the graded total — otherwise skipped questions inflate scores. */
  selectedIndex: number | null;
}

function parseAnswers(value: unknown): AnswerInput[] | null {
  if (!Array.isArray(value)) return null;
  const out: AnswerInput[] = [];
  for (const item of value) {
    if (!isRecord(item) || !isNonEmptyString(item.questionId)) return null;
    if (item.selectedIndex !== null && !isInt(item.selectedIndex, 0)) return null;
    out.push({ questionId: item.questionId, selectedIndex: item.selectedIndex ?? null });
  }
  return out;
}

interface SessionResultInput {
  correct: number;
  total: number;
  scaledScore: number;
}

/** Absent → null (valid). Present but malformed → undefined (invalid). */
function parseSessionResult(value: unknown): SessionResultInput | null | undefined {
  if (value === undefined) return null;
  if (!isRecord(value)) return undefined;
  if (!isInt(value.correct, 0) || !isInt(value.total, 0) || !isInt(value.scaledScore)) return undefined;
  return { correct: value.correct, total: value.total, scaledScore: value.scaledScore };
}

interface SessionBodyInput {
  id?: string;
  exam: string;
  mode: string;
  tier: number | null;
  difficulty: string | null;
  questionIds: string[];
  answers: AnswerInput[];
  questionSetId: string | null;
  completed: boolean;
  result: SessionResultInput | null;
}

/** Returns null when the body is malformed. */
function parseSessionBody(body: unknown): SessionBodyInput | null {
  if (!isRecord(body)) return null;
  if (!isNonEmptyString(body.exam) || !isNonEmptyString(body.mode)) return null;
  if (!Array.isArray(body.questionIds) || body.questionIds.length === 0) return null;
  if (!body.questionIds.every((id) => typeof id === "string" && id.length > 0)) return null;
  if (body.id !== undefined && !isUuid(body.id)) return null;
  if (body.tier !== undefined && body.tier !== null && !isInt(body.tier, 1, 3)) return null;
  if (body.difficulty !== undefined && body.difficulty !== null && typeof body.difficulty !== "string") return null;
  if (
    body.questionSetId !== undefined &&
    body.questionSetId !== null &&
    (typeof body.questionSetId !== "string" || body.questionSetId.length > 128)
  ) {
    return null;
  }
  if (body.completed !== undefined && typeof body.completed !== "boolean") return null;
  let answers: AnswerInput[] = [];
  if (body.answers !== undefined) {
    const parsed = parseAnswers(body.answers);
    if (parsed === null) return null;
    answers = parsed;
  }
  const result = parseSessionResult(body.result);
  if (result === undefined) return null;
  return {
    id: typeof body.id === "string" ? body.id : undefined,
    exam: body.exam,
    mode: body.mode,
    tier: typeof body.tier === "number" ? body.tier : null,
    difficulty: typeof body.difficulty === "string" ? body.difficulty : null,
    questionIds: body.questionIds as string[],
    answers,
    questionSetId: typeof body.questionSetId === "string" ? body.questionSetId : null,
    completed: body.completed === true,
    result,
  };
}

async function persistQuizResult(
  userId: string,
  exam: string,
  mode: string,
  tier: number | null,
  result: { correct: number; total: number; scaledScore: number },
): Promise<void> {
  await db.insert(quizResultsTable).values({
    userId,
    category: exam,
    mode,
    tier: tier ?? null,
    score: result.scaledScore,
    totalQuestions: result.total,
    correctCount: result.correct,
    scaledScore: result.scaledScore,
    weakAreaIds: [],
  });
}

router.post("/quiz/sessions", requireAuth, async (req, res) => {
  try {
    const userId = getUserId(req);
    const body = parseSessionBody(req.body);
    if (!body) {
      error(res, 400, "Invalid session data");
      return;
    }

    if (body.id) {
      const [existing] = await db
        .select()
        .from(quizSessionsTable)
        .where(and(eq(quizSessionsTable.id, body.id), eq(quizSessionsTable.userId, userId)))
        .limit(1);
      if (!existing) {
        error(res, 404, "Session not found");
        return;
      }
      const updatesParsed = updateQuizSessionSchema.safeParse({
        exam: body.exam,
        mode: body.mode,
        tier: body.tier ?? null,
        difficulty: body.difficulty ?? null,
        questionIds: body.questionIds,
        answers: body.answers,
        questionSetId: body.questionSetId ?? null,
        completed: body.completed,
      });
      if (!updatesParsed.success) {
        error(res, 400, "Invalid session data");
        return;
      }
      const updates = updatesParsed.data;
      const wasCompleted = existing.completed;
      const [updated] = await db
        .update(quizSessionsTable)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(quizSessionsTable.id, body.id))
        .returning();
      if (body.completed && !wasCompleted && body.result) {
        await persistQuizResult(userId, updated.exam, updated.mode, updated.tier, body.result);
      }
      res.json(updated);
      return;
    }

    const valuesParsed = insertQuizSessionSchema.safeParse({
      userId,
      exam: body.exam,
      mode: body.mode,
      tier: body.tier ?? null,
      difficulty: body.difficulty ?? null,
      questionIds: body.questionIds,
      answers: body.answers ?? [],
      questionSetId: body.questionSetId ?? null,
      completed: body.completed ?? false,
    });
    if (!valuesParsed.success) {
      error(res, 400, "Invalid session data");
      return;
    }
    const values = valuesParsed.data;
    const [created] = await db.insert(quizSessionsTable).values(values).returning();
    if (body.completed && body.result) {
      await persistQuizResult(userId, created.exam, created.mode, created.tier, body.result);
    }
    res.status(201).json(created);
  } catch (err) {
    (req as unknown as { log?: { error: (e: unknown) => void } }).log?.error(err);
    error(res, 500, "Failed to save session");
  }
});

router.get("/quiz/sessions/:id", requireAuth, async (req, res) => {
  try {
    const userId = getUserId(req);
    const sessionId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const [session] = await db
      .select()
      .from(quizSessionsTable)
      .where(and(eq(quizSessionsTable.id, sessionId), eq(quizSessionsTable.userId, userId)))
      .limit(1);
    if (!session) {
      error(res, 404, "Session not found");
      return;
    }
    res.json(session);
  } catch (err) {
    (req as unknown as { log?: { error: (e: unknown) => void } }).log?.error(err);
    error(res, 500, "Failed to fetch session");
  }
});

// ---------------------------------------------------------------------------
// Questions (P0-4) — serve a stripped set, enforce the paywall
// ---------------------------------------------------------------------------

router.get("/quiz/questions", async (req, res) => {
  try {
    const userId = getOptionalUserId(req);
    const anonId = normalizeAnonId(req.query.anonId);
    const mode = parseMode(req.query.mode ?? "fast");
    if (!mode) {
      error(res, 400, "Invalid mode. Expected fast, full, tier, simulation, or topic.");
      return;
    }
    const exam = parseExam(req.query.exam ?? "all");
    const tier = mode === "tier" ? (parseTier(req.query.tier ?? 1) ?? 1) : parseTier(req.query.tier);
    const difficulty = parseDifficulty(req.query.difficulty);
    const requested = parseCount(req.query.count, MODE_DEFAULT_COUNT[mode]);
    const questionSetId =
      typeof req.query.questionSetId === "string" && req.query.questionSetId.length > 0 && req.query.questionSetId.length <= 128
        ? req.query.questionSetId
        : randomUUID();

    const access = await resolveAccess(userId);
    const isMember = access.isMember;

    // Durable gates first.
    const gate = await checkDurableGates(userId, isMember, mode, tier, difficulty);
    if (gate) {
      error(res, gate.status, gate.message, gate.code);
      return;
    }

    // Resume lookup first: re-serving an existing session's
    // questionSetId returns the same questions and is exempt from cap
    // counting. For simulations the stored question ids also tell us
    // the original pool (any hard question = full bank) and count.
    let resumeReserve = false;
    let resumeQuestionIds: string[] | null = null;
    if (userId) {
      const [existing] = await db
        .select({ id: quizSessionsTable.id, questionIds: quizSessionsTable.questionIds })
        .from(quizSessionsTable)
        .where(
          and(
            eq(quizSessionsTable.questionSetId, questionSetId),
            eq(quizSessionsTable.userId, userId),
          ),
        )
        .limit(1);
      resumeReserve = !!existing;
      resumeQuestionIds = existing ? existing.questionIds : null;
    }

    let bank: LoadedBank;
    try {
      bank = await getBank();
    } catch (err) {
      error(res, 503, `Question bank unavailable: ${(err as Error).message}`, "BANK_UNAVAILABLE");
      return;
    }

    // Full-test access for simulations: admin (unlimited) > a paid
    // test attempt for this exam > the one-time free half-sim.
    // Practice Membership alone grants NO sims. A resumed sim skips
    // the access check — its attempt was consumed at the original serve.
    type SimAccess = "admin" | "attempt" | "free" | "resume" | "none";
    let simAccess: SimAccess = "none";
    if (mode === "simulation") {
      if (resumeReserve) {
        simAccess = "resume";
      } else if (access.isAdmin) {
        simAccess = "admin";
      } else if (exam !== "all" && (access.testAttempts[exam]?.remaining ?? 0) > 0) {
        simAccess = "attempt";
      } else {
        const trial = await getFreeTrialState(userId, anonId);
        simAccess = trial.simAvailable ? "free" : "none";
      }
      if (simAccess === "none") {
        error(res, 403, "No full-test attempt left for this exam. Get a Full Test to take it again.", "TEST_ATTEMPT_REQUIRED");
        return;
      }
    }

    // Build the pool.
    let pool: BankQuestion[];
    let examFiltered = false;
    if (mode === "tier") {
      // Tier exams are mixed-exam by design (as in the client today);
      // the exam parameter does not filter them.
      pool = tier === 1 ? bank.tier1 : tier === 2 ? bank.tier2 : tier3Pool(bank);
    } else if (mode === "simulation") {
      // Full bank for paid attempts / admin / resumed full sims;
      // easy+medium only for the free half-sim (and resumed free sims).
      const fullBank =
        simAccess === "admin" ||
        simAccess === "attempt" ||
        (simAccess === "resume" &&
          (resumeQuestionIds ?? []).some((id) => bank.byId.get(id)?.difficulty === "hard"));
      const base = fullBank
        ? [...bank.tier1, ...bank.tier2, ...tier3Pool(bank)]
        : [...bank.tier1, ...bank.tier2];
      pool = filterByExam(base, exam);
      examFiltered = exam !== "all";
    } else {
      const diff: Difficulty = difficulty ?? "easy";
      pool = filterByExam(difficultyPool(bank, diff), exam);
      examFiltered = exam !== "all";
    }
    const poolSize = pool.length;

    // Consumable caps. A re-serve of an existing session's
    // questionSetId (resume) is exempt: the set was counted at quiz
    // start and re-serving returns the same questions.
    let served = Math.min(requested, poolSize);
    // Free simulations are a half-simulation (45 Q / 45 min); paid
    // sims keep the full 90. Capped here — before selection and before
    // the allowance check — so it also holds on resume re-serves: the
    // deterministic shuffle makes the 45 a prefix of any pre-change
    // 90-question set. The client timer derives from the delivered
    // count (questions.length * 60s), so a 45-question serve is a
    // 45-minute timer with no client change. A resumed sim serves its
    // stored question count exactly.
    if (mode === "simulation" && simAccess === "free") {
      served = Math.min(served, FREE_SIM_QUESTIONS);
    }
    if (mode === "simulation" && resumeQuestionIds) {
      served = Math.min(resumeQuestionIds.length, poolSize);
    }
    let freeRemaining: number | null = null;
    if (mode !== "simulation" && !isMember && !resumeReserve) {
      // One-time free trial (lifetime, either/or): free questions are
      // allowed only while the lifetime 30 is not spent and no
      // free sim has ever been taken.
      const trial = await getFreeTrialState(userId, anonId);
      if (!trial.questionsAvailable) {
        error(res, 403, "Your one-time free trial is used up — 30 free questions, once only. Upgrade to keep practicing.", "FREE_LIMIT_REACHED");
        return;
      }
      freeRemaining = trial.questionsRemaining;
      served = Math.min(served, freeRemaining);
    }

    // Selection. A resume re-serve reproduces the exact original set
    // from the stored question ids (stored order) — the unseen-first
    // ordering below would otherwise return a different set than the
    // one the user started, because their history changed as they
    // answered. Fresh serves shuffle deterministically from the
    // questionSetId, then (signed-in only) reorder unseen-first.
    const shuffled = shufflePool(pool, `${questionSetId}:${mode}:${exam}:${tier ?? ""}:${difficulty ?? ""}`);
    let selected: BankQuestion[];
    if (resumeReserve && resumeQuestionIds) {
      selected = resumeQuestionIds
        .map((id) => bank.byId.get(id))
        .filter((q): q is BankQuestion => q !== undefined)
        .slice(0, served);
    } else {
      const ordered = userId ? await orderUnseenFirst(bank, shuffled, userId) : shuffled;
      selected = ordered.slice(0, served);
    }
    // Simulations carry 5 scenario-framed questions (single-select
    // MCQs with a scenario sentence — honest labelling, not PBQs).
    const framed = mode === "simulation" ? attachScenarios(selected, questionSetId, exam) : selected;
    const questions = framed.map((q) => toPublic(q, questionSetId));

    // Record consumption (not on resume re-serves). A paid sim attempt
    // is consumed atomically; if it vanished between the check and the
    // serve (e.g. two tabs), fail rather than serving a free sim.
    if (!resumeReserve) {
      if (mode === "simulation") {
        if (simAccess === "attempt") {
          if (!userId || exam === "all") {
            error(res, 403, "No full-test attempt left for this exam. Get a Full Test to take it again.", "TEST_ATTEMPT_REQUIRED");
            return;
          }
          const consumed = await consumeTestAttempt(userId, exam as ExamScope);
          if (!consumed) {
            error(res, 403, "No full-test attempt left for this exam. Get a Full Test to take it again.", "TEST_ATTEMPT_REQUIRED");
            return;
          }
        } else if (simAccess === "free") {
          await recordFreeUsage(userId, anonId, "simulation", exam === "all" ? null : exam, 1);
        }
        // admin: nothing to record.
      } else if (!isMember && served > 0) {
        await recordFreeUsage(userId, anonId, "question", null, served);
        const trial = await getFreeTrialState(userId, anonId);
        freeRemaining = trial.questionsRemaining;
      }
    }

    res.json({
      questionSetId,
      exam,
      mode,
      tier: mode === "tier" ? tier : tier ?? null,
      difficulty: difficulty ?? (mode === "tier" ? TIER_DIFFICULTY[tier ?? 1] : null),
      questions,
      served: questions.length,
      requested,
      poolSize,
      examFiltered,
      tier3IsHellMode: bank.tier3IsHellMode,
      freeRemaining,
      isPro: isMember,
      isMember,
      testAttempts: access.testAttempts,
    });
  } catch (err) {
    (req as unknown as { log?: { error: (e: unknown) => void } }).log?.error(err);
    error(res, 500, "Failed to serve questions");
  }
});

// ---------------------------------------------------------------------------
// Check answer (immediate feedback) — one question at a time
// ---------------------------------------------------------------------------

interface CheckAnswerBodyInput {
  questionSetId: string;
  questionId: string;
  selectedIndex: number;
  anonId?: string;
}

/** Returns null when the body is malformed. */
function parseCheckAnswerBody(body: unknown): CheckAnswerBodyInput | null {
  if (!isRecord(body)) return null;
  if (!isNonEmptyString(body.questionSetId) || body.questionSetId.length > 128) return null;
  if (!isNonEmptyString(body.questionId) || body.questionId.length > 128) return null;
  if (!isInt(body.selectedIndex, 0)) return null;
  if (body.anonId !== undefined && (typeof body.anonId !== "string" || body.anonId.length > 128)) return null;
  return {
    questionSetId: body.questionSetId,
    questionId: body.questionId,
    selectedIndex: body.selectedIndex,
    anonId: typeof body.anonId === "string" ? body.anonId : undefined,
  };
}

/**
 * POST /api/quiz/check-answer — immediate per-question feedback for
 * practice/learning modes. Returns the verdict for THAT question only
 * ({ correct, correctIndex, correctAnswerText, explanation }); the
 * answer key for unanswered questions is never returned.
 *
 * Auth follows the other quiz endpoints: signed-in callers send a
 * Bearer token, guests send anonId. Membership-gated content
 * (Medium/Hard questions) must come from a set the caller was
 * actually served — the caller must own a session for this
 * questionSetId containing this question. This mirrors the submit
 * endpoint's SESSION_REQUIRED guard so check-answer cannot be used
 * as a free oracle for paid questions. Easy / Tier 1 questions need
 * no session (submit grades those without one).
 */
router.post("/quiz/check-answer", async (req, res) => {
  try {
    const userId = getOptionalUserId(req);
    const body = parseCheckAnswerBody(req.body);
    if (!body) {
      error(res, 400, "Invalid check-answer request");
      return;
    }

    let bank: LoadedBank;
    try {
      bank = await getBank();
    } catch (err) {
      error(res, 503, `Question bank unavailable: ${(err as Error).message}`, "BANK_UNAVAILABLE");
      return;
    }

    const question = bank.byId.get(body.questionId);
    if (!question) {
      error(res, 400, `Unknown question id: ${body.questionId}`);
      return;
    }
    if (body.selectedIndex >= question.options.length) {
      error(res, 400, "selectedIndex is out of range for this question");
      return;
    }

    if (question.difficulty !== "easy") {
      if (!userId) {
        error(res, 403, "Sign in to check Medium and Hard questions.", "SESSION_REQUIRED");
        return;
      }
      const [session] = await db
        .select({ questionIds: quizSessionsTable.questionIds })
        .from(quizSessionsTable)
        .where(
          and(
            eq(quizSessionsTable.questionSetId, body.questionSetId),
            eq(quizSessionsTable.userId, userId),
          ),
        )
        .limit(1);
      if (!session || !session.questionIds.includes(body.questionId)) {
        error(res, 403, "This question was not served in your current quiz.", "SESSION_REQUIRED");
        return;
      }
    }

    // Same deterministic served order as gradeAnswers, so the
    // correctIndex matches what the client displayed.
    const served = shuffledOptions(question, body.questionSetId);
    const correctIndex = served.indexOf(question.correctText);
    const correct = served[body.selectedIndex] === question.correctText;
    res.json({
      correct,
      correctIndex,
      correctAnswerText: question.correctText,
      explanation: question.explanation ?? "",
    });
  } catch (err) {
    (req as unknown as { log?: { error: (e: unknown) => void } }).log?.error(err);
    error(res, 500, "Failed to check answer");
  }
});

// ---------------------------------------------------------------------------
// Submit (P0-4) — grade server-side, persist when signed in
// ---------------------------------------------------------------------------

interface SubmitBodyInput {
  questionSetId: string;
  exam: string;
  mode: string;
  tier: number | null;
  difficulty: string | null;
  sessionId?: string;
  answers: AnswerInput[];
}

/** Returns null when the body is malformed. */
function parseSubmitBody(body: unknown): SubmitBodyInput | null {
  if (!isRecord(body)) return null;
  if (!isNonEmptyString(body.questionSetId) || body.questionSetId.length > 128) return null;
  if (!isNonEmptyString(body.exam) || !isNonEmptyString(body.mode)) return null;
  if (body.tier !== undefined && body.tier !== null && !isInt(body.tier, 1, 3)) return null;
  if (body.difficulty !== undefined && body.difficulty !== null && typeof body.difficulty !== "string") return null;
  if (body.sessionId !== undefined && !isUuid(body.sessionId)) return null;
  const answers = parseAnswers(body.answers);
  if (answers === null || answers.length === 0) return null;
  return {
    questionSetId: body.questionSetId,
    exam: body.exam,
    mode: body.mode,
    tier: typeof body.tier === "number" ? body.tier : null,
    difficulty: typeof body.difficulty === "string" ? body.difficulty : null,
    sessionId: typeof body.sessionId === "string" ? body.sessionId : undefined,
    answers,
  };
}

router.post("/quiz/submit", async (req, res) => {
  try {
    const userId = getOptionalUserId(req);
    const body = parseSubmitBody(req.body);
    if (!body) {
      error(res, 400, "Invalid submission");
      return;
    }
    const mode = parseMode(body.mode);
    if (!mode) {
      error(res, 400, "Invalid mode. Expected fast, full, tier, simulation, or topic.");
      return;
    }
    const tier = mode === "tier" ? (parseTier(body.tier ?? 1) ?? 1) : parseTier(body.tier);
    const difficulty = parseDifficulty(body.difficulty);
    const exam = parseExam(body.exam);

    const access = await resolveAccess(userId);
    const gate = await checkDurableGates(userId, access.isMember, mode, tier, difficulty);
    if (gate) {
      error(res, gate.status, gate.message, gate.code);
      return;
    }

    let bank: LoadedBank;
    try {
      bank = await getBank();
    } catch (err) {
      error(res, 503, `Question bank unavailable: ${(err as Error).message}`, "BANK_UNAVAILABLE");
      return;
    }

    const unknownIds = body.answers.filter((a) => !bank.byId.has(a.questionId)).map((a) => a.questionId);
    if (unknownIds.length > 0) {
      error(res, 400, `Unknown question ids: ${unknownIds.slice(0, 5).join(", ")}${unknownIds.length > 5 ? "…" : ""}`);
      return;
    }

    // Membership-gated content must be submitted against a session the user
    // created for this quiz (prevents grading as a free oracle).
    const isGated =
      (mode === "tier" && tier !== null && tier >= 2) ||
      (mode !== "tier" && (difficulty === "medium" || difficulty === "hard"));
    let session: { id: string; completed: boolean } | null = null;
    if (isGated) {
      if (!userId || !body.sessionId) {
        error(res, 403, "Membership-gated quizzes must be submitted with the session created when the quiz started.", "SESSION_REQUIRED");
        return;
      }
      const [found] = await db
        .select()
        .from(quizSessionsTable)
        .where(and(eq(quizSessionsTable.id, body.sessionId), eq(quizSessionsTable.userId, userId)))
        .limit(1);
      if (!found) {
        error(res, 403, "Session not found for this user.", "SESSION_REQUIRED");
        return;
      }
      session = found;
    } else if (userId && body.sessionId) {
      const [found] = await db
        .select()
        .from(quizSessionsTable)
        .where(and(eq(quizSessionsTable.id, body.sessionId), eq(quizSessionsTable.userId, userId)))
        .limit(1);
      if (found) session = found;
    }

    const grade = gradeAnswers(bank, body.questionSetId, body.answers);

    if (userId) {
      await persistQuizResult(userId, exam === "all" ? "all" : exam, mode, tier ?? null, {
        correct: grade.correct,
        total: grade.total,
        scaledScore: grade.scaledScore,
      });
      if (session) {
        await db
          .update(quizSessionsTable)
          .set({ answers: body.answers, completed: true, updatedAt: new Date() })
          .where(eq(quizSessionsTable.id, session.id));
      }
    }

    res.json({
      correct: grade.correct,
      total: grade.total,
      rawPct: grade.rawPct,
      scaledScore: grade.scaledScore,
      passed: grade.passed,
      perQuestion: grade.perQuestion,
    });
  } catch (err) {
    (req as unknown as { log?: { error: (e: unknown) => void } }).log?.error(err);
    error(res, 500, "Failed to grade submission");
  }
});

// ---------------------------------------------------------------------------
// Entitlements (P0-4)
// ---------------------------------------------------------------------------

router.get("/entitlements", async (req, res) => {
  try {
    const userId = getOptionalUserId(req);
    const anonId = normalizeAnonId(req.query.anonId);
    const access = await resolveAccess(userId);
    const trial = await getFreeTrialState(userId, anonId);
    res.json({
      // isPro / plan / proSource / expiresAt are kept as aliases: the
      // client treats "member" as Pro. New fields are the canonical ones.
      isPro: access.isMember,
      isMember: access.isMember,
      plan: access.isMember ? "membership" : "free",
      proSource: access.membershipSource,
      membershipSource: access.membershipSource,
      expiresAt: access.membershipExpiresAt,
      membershipExpiresAt: access.membershipExpiresAt,
      testAttempts: access.testAttempts,
      freeQuestionsUsed: trial.questionsUsed,
      freeQuestionsCap: FREE_QUESTIONS_TOTAL,
      freeQuestionsRemaining: trial.questionsRemaining,
      freeQuestionsAvailable: trial.questionsAvailable,
      freeSimsUsed: trial.simsUsedTotal,
      freeSimsCap: FREE_SIMS_TOTAL,
      freeSimsByExam: trial.simsUsedByExam,
      freeSimAvailable: trial.simAvailable,
      examsStarted: trial.examsUsed,
      tierPassScaledScore: TIER_PASS_SCALED_SCORE,
    });
  } catch (err) {
    (req as unknown as { log?: { error: (e: unknown) => void } }).log?.error(err);
    error(res, 500, "Failed to load entitlements");
  }
});

interface RecordUsageBodyInput {
  kind: FreeUsageKind;
  anonId?: string;
  exam: string | null;
  count: number;
}

/** Returns null when the body is malformed. */
function parseRecordUsageBody(body: unknown): RecordUsageBodyInput | null {
  if (!isRecord(body)) return null;
  if (body.kind !== "question" && body.kind !== "simulation" && body.kind !== "exam") return null;
  if (body.anonId !== undefined && (typeof body.anonId !== "string" || body.anonId.length > 128)) return null;
  if (body.exam !== undefined && body.exam !== null && typeof body.exam !== "string") return null;
  if (body.count !== undefined && !isInt(body.count, 1, 270)) return null;
  return {
    kind: body.kind,
    anonId: typeof body.anonId === "string" ? body.anonId : undefined,
    exam: typeof body.exam === "string" ? body.exam : null,
    count: typeof body.count === "number" ? body.count : 1,
  };
}

router.post("/entitlements/usage", async (req, res) => {
  try {
    const userId = getOptionalUserId(req);
    const body = parseRecordUsageBody(req.body);
    if (!body) {
      error(res, 400, "Invalid usage record");
      return;
    }
    const anonId = normalizeAnonId(body.anonId);
    if (!userId && !anonId) {
      error(res, 400, "anonId is required when not signed in");
      return;
    }
    const exam = body.exam && isExam(body.exam) ? body.exam : null;
    await recordFreeUsage(userId, anonId, body.kind, exam, body.count);
    const trial = await getFreeTrialState(userId, anonId);
    const access = await resolveAccess(userId);
    res.json({
      isPro: access.isMember,
      isMember: access.isMember,
      plan: access.isMember ? "membership" : "free",
      testAttempts: access.testAttempts,
      freeQuestionsUsed: trial.questionsUsed,
      freeQuestionsCap: FREE_QUESTIONS_TOTAL,
      freeQuestionsRemaining: trial.questionsRemaining,
      freeQuestionsAvailable: trial.questionsAvailable,
      freeSimsUsed: trial.simsUsedTotal,
      freeSimsCap: FREE_SIMS_TOTAL,
      freeSimsByExam: trial.simsUsedByExam,
      freeSimAvailable: trial.simAvailable,
      examsStarted: trial.examsUsed,
    });
  } catch (err) {
    (req as unknown as { log?: { error: (e: unknown) => void } }).log?.error(err);
    error(res, 500, "Failed to record usage");
  }
});

export default router;

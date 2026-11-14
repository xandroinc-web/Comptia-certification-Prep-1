/**
 * Typed client for the server-side quiz API (P0-3, P0-4).
 *
 * All calls are relative (`/api/...`, same origin). Signed-in requests
 * send the Supabase access token as `Authorization: Bearer <token>`
 * (see lib/supabase getAccessToken); the server validates it against
 * Supabase Auth. Anonymous callers send no token and are keyed by
 * `anonId` — the same pattern as the generated
 * `@workspace/api-client-react` client (whose token getter is
 * registered in main.tsx). Why a standalone wrapper instead of
 * extending that client: it is Orval-generated from
 * `lib/api-spec/openapi.yaml`, which does not yet describe these new
 * endpoints, and regenerating the spec/client is a separate step. When
 * the spec is updated, these calls should move into the generated
 * client and this module should become a thin re-export.
 *
 * DEV PROXY (required, not yet configured — vite.config.ts belongs to
 * another stream): the quiz app runs on Vite (PORT) and the api-server
 * on its own port, so local dev needs
 *   server: { proxy: { "/api": "http://localhost:<API_PORT>" } }
 * in vite.config.ts. In production the two are same-origin (Vercel
 * rewrites /api to the server), so no proxy is needed there.
 *
 * QUESTION SETS + OPTION ORDER: the server shuffles options
 * deterministically from `questionSetId`. The client must keep the
 * `questionSetId` returned by fetchQuizQuestions, store it on the
 * session, and echo it on submit — re-fetching with the SAME
 * questionSetId reproduces the same option order, which is what makes
 * resume work (stored answer indexes stay valid).
 */

import { getAccessToken } from "./supabase.js";

export type ExamCategory = "A+" | "Network+" | "Security+";
export type QuizMode = "fast" | "full" | "tier" | "simulation" | "topic";
export type Difficulty = "easy" | "medium" | "hard";
export type Plan = "free" | "pro" | "bundle" | "single" | "membership";

/** Unexpired full-test attempts per exam (new pricing model). */
export interface TestAttemptState {
  remaining: number;
  expiresAt: string | null;
}

/** A question as the server serves it — NEVER carries the answer or explanation. */
export interface PublicQuestion {
  id: string;
  question: string;
  options: string[];
  category: ExamCategory;
  difficulty: Difficulty;
  scenario?: string;
}

export interface QuizQuestionsResponse {
  questionSetId: string;
  exam: ExamCategory | "all";
  mode: QuizMode;
  tier: 1 | 2 | 3 | null;
  difficulty: Difficulty | null;
  questions: PublicQuestion[];
  /** Questions actually served (may be < requested when the free cap or pool caps it). */
  served: number;
  requested: number;
  poolSize: number;
  /** False for tier mode (tier exams are mixed-exam by design). */
  examFiltered: boolean;
  /** True when Tier 3 serves the real HellMode bank (else tier-3 JSON). */
  tier3IsHellMode: boolean;
  /** Free questions left today after this serve; null for members. */
  freeRemaining: number | null;
  /** Alias for isMember — the client treats "member" as Pro. */
  isPro: boolean;
  /** Practice Membership holder (unlimited practice, no sims). */
  isMember: boolean;
  /** Unexpired full-test attempts per exam. */
  testAttempts: Record<string, TestAttemptState>;
}

export interface SubmitAnswer {
  questionId: string;
  /** Index into the SERVED (shuffled) options for that question.
   *  Null = unanswered — counts as incorrect and IS in the total. */
  selectedIndex: number | null;
}

export interface SubmitResult {
  correct: number;
  total: number;
  rawPct: number;
  /** 100 + whole-percent * 8; pass is >= 750 (raw >= 82%). */
  scaledScore: number;
  passed: boolean;
  /** Review data: correctness + correct option index + explanation,
   *  for every submitted question (unanswered included). */
  perQuestion: { questionId: string; correct: boolean; correctIndex: number; explanation?: string; category: ExamCategory }[];
}

export interface QuizSessionAnswer {
  questionId: string;
  selectedIndex: number | null;
}

export interface QuizSession {
  id: string;
  userId: string;
  exam: string;
  mode: string;
  tier: number | null;
  difficulty: string | null;
  questionIds: string[];
  answers: QuizSessionAnswer[];
  questionSetId: string | null;
  startedAt: string;
  updatedAt: string;
  completed: boolean;
}

export interface Entitlements {
  /** Alias for isMember — the client treats "member" as Pro. */
  isPro: boolean;
  /** Practice Membership holder (unlimited practice, no sims). */
  isMember: boolean;
  plan: Plan;
  proSource: "admin" | "entitlement" | "stripe" | null;
  membershipSource: "admin" | "entitlement" | "stripe" | null;
  expiresAt: string | null;
  membershipExpiresAt: string | null;
  /** Unexpired full-test attempts per exam. */
  testAttempts: Record<string, TestAttemptState>;
  /** Lifetime free questions used (one-time trial — never resets). */
  freeQuestionsUsed: number;
  freeQuestionsCap: number;
  freeQuestionsRemaining: number;
  /** Free questions still allowed under the either/or rule. */
  freeQuestionsAvailable: boolean;
  freeSimsUsed: number;
  freeSimsCap: number;
  freeSimsByExam: Record<string, number>;
  /** Free sim still allowed under the either/or rule. */
  freeSimAvailable: boolean;
  examsStarted: number;
  tierPassScaledScore: number;
}

export class QuizApiError extends Error {
  readonly status: number;
  readonly code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = "QuizApiError";
    this.status = status;
    this.code = code;
  }
}

async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getAccessToken().catch(() => null);
  const headers: Record<string, string> = {
    "content-type": "application/json",
    ...(init.headers as Record<string, string> | undefined ?? {}),
  };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(path, {
    credentials: "include",
    ...init,
    headers,
  });
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const body = (data ?? {}) as { error?: string; code?: string };
    throw new QuizApiError(res.status, body.error ?? `Request failed (${res.status})`, body.code);
  }
  return data as T;
}

// ---------------------------------------------------------------------------
// Anonymous identity (free-tier usage is keyed by this when signed out)
// ---------------------------------------------------------------------------

const ANON_ID_KEY = "comptia_anon_id";

/** Stable per-browser anonymous id (a random UUID, not PII). */
export function getAnonId(): string {
  try {
    const existing = localStorage.getItem(ANON_ID_KEY);
    if (existing) return existing;
    const id = typeof crypto?.randomUUID === "function" ? crypto.randomUUID() : `anon-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(ANON_ID_KEY, id);
    return id;
  } catch {
    return `anon-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

// ---------------------------------------------------------------------------
// Questions + grading
// ---------------------------------------------------------------------------

export interface FetchQuizQuestionsParams {
  exam?: ExamCategory | "all";
  mode: QuizMode;
  tier?: 1 | 2 | 3;
  difficulty?: Difficulty;
  count?: number;
  /** Reuse to reproduce the same option order (resume). Omit for a fresh set. */
  questionSetId?: string;
  /** Anonymous fingerprint; defaults to getAnonId(). */
  anonId?: string;
}

export async function fetchQuizQuestions(params: FetchQuizQuestionsParams): Promise<QuizQuestionsResponse> {
  const query = new URLSearchParams();
  query.set("mode", params.mode);
  if (params.exam) query.set("exam", params.exam);
  if (params.tier !== undefined) query.set("tier", String(params.tier));
  if (params.difficulty) query.set("difficulty", params.difficulty);
  if (params.count !== undefined) query.set("count", String(params.count));
  if (params.questionSetId) query.set("questionSetId", params.questionSetId);
  query.set("anonId", params.anonId ?? getAnonId());
  return apiFetch<QuizQuestionsResponse>(`/api/quiz/questions?${query.toString()}`);
}

export interface SubmitQuizParams {
  questionSetId: string;
  exam: ExamCategory | "all";
  mode: QuizMode;
  tier?: 1 | 2 | 3;
  difficulty?: Difficulty;
  /** Required for Pro-gated content (Tier 2/3, Medium/Hard). */
  sessionId?: string;
  answers: SubmitAnswer[];
}

export async function submitQuiz(params: SubmitQuizParams): Promise<SubmitResult> {
  return apiFetch<SubmitResult>("/api/quiz/submit", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

// ---------------------------------------------------------------------------
// Check answer — immediate per-question feedback (practice modes only)
// ---------------------------------------------------------------------------

/** Verdict for ONE question only — never the answer key for the set. */
export interface CheckAnswerResult {
  correct: boolean;
  /** Index of the correct option in the served (shuffled) order. */
  correctIndex: number;
  correctAnswerText: string;
  /** Short explanation of why the correct answer is right. */
  explanation: string;
}

export interface CheckAnswerParams {
  questionSetId: string;
  questionId: string;
  selectedIndex: number;
  /** Anonymous fingerprint; defaults to getAnonId(). */
  anonId?: string;
}

export async function checkAnswer(params: CheckAnswerParams): Promise<CheckAnswerResult> {
  return apiFetch<CheckAnswerResult>("/api/quiz/check-answer", {
    method: "POST",
    body: JSON.stringify({ ...params, anonId: params.anonId ?? getAnonId() }),
  });
}

// ---------------------------------------------------------------------------
// Sessions (save/resume)
// ---------------------------------------------------------------------------

export interface CreateOrUpdateSessionParams {
  /** Omit to create; pass to update an existing session. */
  id?: string;
  exam: string;
  mode: string;
  tier?: number | null;
  difficulty?: string | null;
  questionIds: string[];
  answers?: QuizSessionAnswer[];
  questionSetId?: string | null;
  completed?: boolean;
  /** Include when marking completed so a quiz_results row is written. */
  result?: { correct: number; total: number; scaledScore: number };
}

export async function createOrUpdateSession(params: CreateOrUpdateSessionParams): Promise<QuizSession> {
  return apiFetch<QuizSession>("/api/quiz/sessions", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export async function getSession(id: string): Promise<QuizSession> {
  return apiFetch<QuizSession>(`/api/quiz/sessions/${encodeURIComponent(id)}`);
}

// ---------------------------------------------------------------------------
// Entitlements + free usage
// ---------------------------------------------------------------------------

export async function getEntitlements(anonId?: string): Promise<Entitlements> {
  const id = anonId ?? getAnonId();
  return apiFetch<Entitlements>(`/api/entitlements?anonId=${encodeURIComponent(id)}`);
}

export interface RecordFreeUsageParams {
  kind: "question" | "simulation" | "exam";
  anonId?: string;
  exam?: ExamCategory | null;
  count?: number;
}

export async function recordFreeUsage(params: RecordFreeUsageParams): Promise<Entitlements> {
  return apiFetch<Entitlements>("/api/entitlements/usage", {
    method: "POST",
    body: JSON.stringify({ ...params, anonId: params.anonId ?? getAnonId() }),
  });
}

/**
 * App.tsx — integration wiring (P0-3, P0-4).
 *
 * QUIZ DATA NOW COMES FROM THE SERVER. Every quiz start fetches its
 * question set from `GET /api/quiz/questions` (see `src/lib/quiz-api`)
 * and grading happens server-side via `POST /api/quiz/submit`. The
 * browser NEVER receives answer keys: served questions carry
 * `correctIndex: -1` and an empty explanation, so QuizPage runs in
 * no-answer-key mode (no mid-quiz correctness feedback) and the
 * review pages are filled in from the server's `perQuestion` result
 * after submit. If the API call fails, a clear error is shown — the
 * app NEVER falls back to local bank data.
 *
 * SESSIONS / RESUME: signed-in users get a server session
 * (`POST /api/quiz/sessions`) created at quiz start, updated
 * (debounced) as answers are given, and marked completed at finish;
 * the session id is kept in localStorage so an incomplete session can
 * be resumed after a reload (same `questionSetId` re-serves the same
 * option order). Anonymous users keep a localStorage-only resume
 * payload (`comptia_resume_anon`) — same re-fetch, no server row.
 *
 * KNOWN GAPS (server follow-ups, not client bugs):
 * - Admin-managed questions are no longer mixed into quizzes: the
 *   server does not serve `admin_questions` yet.
 * - Topic study has no server-side topic filter; it serves a
 *   mixed-exam set at the allowed difficulty.
 * - Weak-area study can only reuse weak questions the server happens
 *   to serve in the fresh set (weak ids are server question ids).
 * - There is no dedicated bonus endpoint: the bonus round is served
 *   as a 10-question hard full quiz.
 */
import { useState, useEffect, useRef } from "react";
import { Switch, Route, useLocation } from "wouter";
import { ShieldCheck } from "lucide-react";
import { supabase } from "./lib/supabase";
import { useAuth } from "./lib/auth";
import TechBackground from "@/components/TechBackground";
import Footer from "@/components/Footer";
import {
  type ExamCategory,
  type Difficulty,
  type Question,
  getTimeLimitSeconds,
  isCompTiaPass,
} from "@/lib/scoring";
import type { DomainTopic } from "@/data/topics";
import type { ExamTier } from "@/data/exam-bank";
import {
  useGetQuizResults,
  useGetSubscription,
  useGetAdminAccess,
  useGetAppSettings,
  useCreateAdminSimulationEvent,
} from "@workspace/api-client-react";
import {
  canStartTrial,
  recordTrialUsed,
  getRemainingTrials,
  getTrialStatusMessage,
  refreshEntitlements,
  getCachedEntitlements,
} from "@/lib/trials";
import {
  fetchQuizQuestions,
  submitQuiz,
  createOrUpdateSession,
  getSession,
  QuizApiError,
  type PublicQuestion,
  type QuizQuestionsResponse,
  type QuizSession,
  type QuizMode as ServerQuizMode,
} from "@/lib/quiz-api";
import HomePage from "@/pages/HomePage";
import QuizPage from "@/pages/QuizPage";
import PassFailPage from "@/pages/PassFailPage";
import ResultsPage from "@/pages/ResultsPage";
import PricingPage from "@/pages/PricingPage";
import CheckoutSuccessPage from "@/pages/CheckoutSuccessPage";
import CheckoutCancelPage from "@/pages/CheckoutCancelPage";
import ProgressPage from "@/pages/ProgressPage";
import AdminPage from "@/pages/AdminPage";
import { TermsPage } from "@/pages/TermsPage";
import { PrivacyPage } from "@/pages/PrivacyPage";
import {
  clearAdminSimulation,
  getAdminSimulationRuns,
  loadAdminSimulationConfig,
  recordAdminSimulationRun,
  type AdminSimulationConfig,
} from "@/lib/admin-simulation";
import { normalizePageBuilderSettings } from "@/lib/page-builder";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

type AppState = "home" | "quiz" | "passfail" | "results" | "pricing" | "progress" | "restricted";

type QuizMode = "all" | ExamCategory | { topic: DomainTopic };

/** localStorage keys for resume. */
const ACTIVE_SESSION_KEY = "comptia_active_session";
const ANON_RESUME_KEY = "comptia_resume_anon";
const WEAK_SERVER_KEY = "comptia_weak_areas_server";

/** What to re-run for Retry (ResultsPage / PassFailPage). */
type QuizSpec =
  | { kind: "practice"; selected: "all" | ExamCategory; length: "full" | "fast"; diff: Difficulty }
  | { kind: "weak"; selected: "all" | ExamCategory }
  | { kind: "topic"; topic: DomainTopic }
  | { kind: "simulation"; selected: ExamCategory; diff: Difficulty | "mixed" }
  | { kind: "tier"; tier: ExamTier }
  | { kind: "bonus" };

/** Served-question snapshot, keyed by questionSetId. The snapshot
 *  holds PUBLIC questions only (no answers), so storing it in
 *  localStorage is safe. Resume restores from it without re-fetching
 *  — no second cap charge, no network dependency. */
const QSET_SNAPSHOT_PREFIX = "comptia_qset_";

function snapshotKey(questionSetId: string): string {
  return `${QSET_SNAPSHOT_PREFIX}${questionSetId}`;
}

function saveQuestionSnapshot(questionSetId: string, questions: PublicQuestion[]): void {
  try {
    const raw = JSON.stringify(questions);
    if (raw.length > 1024 * 1024) return; // never blow the quota
    localStorage.setItem(snapshotKey(questionSetId), raw);
  } catch {
    // ignore
  }
}

function loadQuestionSnapshot(questionSetId: string): PublicQuestion[] | null {
  try {
    const raw = localStorage.getItem(snapshotKey(questionSetId));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed as PublicQuestion[];
  } catch {
    return null;
  }
}

interface AnonResumePayload {
  questionSetId: string;
  exam: string;
  serverMode: ServerQuizMode;
  tier: number | null;
  difficulty: string | null;
  count: number;
  answers: { questionId: string; selectedIndex: number | null }[];
  savedAt: number;
}

type ResumeOffer =
  | { kind: "server"; session: QuizSession }
  | { kind: "anon"; payload: AnonResumePayload };

/** Stable numeric id for a server question id string (client Question.id is a number). */
function hashServerId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Map a server-served question to the client Question shape.
 *  No answer key is ever sent to the browser: correctIndex is -1 and
 *  the explanation is empty until the server grading result fills
 *  them in at submit time. A scenario sentence already embeds the
 *  question text ("...stating: \"<question>\" What should...?"), so
 *  it is shown alone — appending the question again would duplicate
 *  it. */
function toClientQuestion(q: PublicQuestion): Question {
  return {
    id: hashServerId(q.id),
    category: q.category,
    question: q.scenario ?? q.question,
    options: q.options,
    correctIndex: -1,
    explanation: "",
    difficulty: q.difficulty,
  };
}

function loadWeakServerIds(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(WEAK_SERVER_KEY) || "[]") as unknown;
    return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function saveWeakServerIds(ids: string[]): void {
  try {
    const merged = Array.from(new Set([...loadWeakServerIds(), ...ids]));
    localStorage.setItem(WEAK_SERVER_KEY, JSON.stringify(merged.slice(-200)));
  } catch {
    // ignore
  }
}

const inputClass =
  "w-full rounded-xl border border-gray-700 bg-gray-800 px-4 py-3 text-sm text-white placeholder:text-gray-500 outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500";

function AuthCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="w-[440px] max-w-full rounded-2xl border border-[hsl(217,33%,15%)] bg-[hsl(222,47%,8%)] p-6">
      <div className="flex flex-col items-center text-center">
        <img src={`${basePath}/logo.svg`} alt="Trifecta Quiz" className="h-12 w-12" />
        <h1 className="mt-4 text-xl font-bold text-white">{title}</h1>
        <p className="mt-1 text-sm text-gray-400">{subtitle}</p>
      </div>
      <div className="mt-6">{children}</div>
      <p className="mt-6 text-center text-xs text-gray-500">Secured by Supabase Auth</p>
    </div>
  );
}

function SignInPage() {
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [mode, setMode] = useState<"sign-in" | "reset">("sign-in");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSignIn(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setPending(true);
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signInError) throw signInError;
      setLocation(basePath || "/");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Sign-in failed. Please try again.");
    } finally {
      setPending(false);
    }
  }

  async function handleReset(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setPending(true);
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}${basePath}/sign-in`,
      });
      if (resetError) throw resetError;
      setNotice(`If an account exists for ${email.trim()}, a password-reset link is on its way.`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not send the reset link. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <div className="flex flex-1 items-center justify-center px-4 py-8">
        <AuthCard
          title={mode === "reset" ? "Reset your password" : "Welcome back"}
          subtitle={
            mode === "reset"
              ? "Enter your email and we'll send you a reset link"
              : "Sign in to track your quiz progress"
          }
        >
          {error && (
            <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400" role="alert">
              {error}
            </div>
          )}
          {notice && (
            <div className="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-400" role="status">
              {notice}
            </div>
          )}
          {mode === "reset" ? (
            <form onSubmit={handleReset} className="space-y-3">
              <div>
                <label htmlFor="reset-email" className="mb-1 block text-sm text-gray-300">
                  Email address
                </label>
                <input
                  id="reset-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={inputClass}
                  placeholder="you@example.com"
                  autoComplete="email"
                />
              </div>
              <button
                type="submit"
                disabled={pending}
                className="w-full rounded-xl bg-red-600 px-4 py-3 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-50"
              >
                {pending ? "Sending…" : "Send reset link"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode("sign-in");
                  setError(null);
                  setNotice(null);
                }}
                className="w-full text-center text-sm text-red-400 hover:text-red-300"
              >
                Back to sign-in
              </button>
            </form>
          ) : (
            <form onSubmit={handleSignIn} className="space-y-3">
              <div>
                <label htmlFor="signin-email" className="mb-1 block text-sm text-gray-300">
                  Email address
                </label>
                <input
                  id="signin-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={inputClass}
                  placeholder="you@example.com"
                  autoComplete="email"
                />
              </div>
              <div>
                <label htmlFor="signin-password" className="mb-1 block text-sm text-gray-300">
                  Password
                </label>
                <input
                  id="signin-password"
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={inputClass}
                  placeholder="Your password"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="mt-1 text-xs text-gray-400 hover:text-gray-300"
                >
                  {showPassword ? "Hide password" : "Show password"}
                </button>
              </div>
              <button
                type="submit"
                disabled={pending}
                className="w-full rounded-xl bg-red-600 px-4 py-3 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-50"
              >
                {pending ? "Signing in…" : "Sign in"}
              </button>
              <div className="flex items-center justify-between pt-1 text-sm">
                <button
                  type="button"
                  onClick={() => {
                    setMode("reset");
                    setError(null);
                    setNotice(null);
                  }}
                  className="text-gray-400 hover:text-gray-300"
                >
                  Forgot password?
                </button>
                <span className="text-gray-400">
                  Don&apos;t have an account?{" "}
                  <button type="button" onClick={() => setLocation(`${basePath}/sign-up`)} className="font-semibold text-red-400 hover:text-red-300">
                    Sign up
                  </button>
                </span>
              </div>
            </form>
          )}
        </AuthCard>
      </div>
      <Footer />
    </div>
  );
}

function SignUpPage() {
  const [, setLocation] = useLocation();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmationSent, setConfirmationSent] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSignUp(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setConfirmationSent(null);
    setPending(true);
    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: { full_name: fullName.trim() || undefined },
          emailRedirectTo: `${window.location.origin}${basePath}/`,
        },
      });
      if (signUpError) throw signUpError;
      // When email confirmation is enabled, sign-up returns a user but
      // no session — the account activates via the confirmation link.
      if (data.session) {
        setLocation(basePath || "/");
      } else {
        setConfirmationSent(email.trim());
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Sign-up failed. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <div className="flex flex-1 items-center justify-center px-4 py-8">
        <AuthCard title="Create your account" subtitle="Start tracking your CompTIA prep progress">
          {error && (
            <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400" role="alert">
              {error}
            </div>
          )}
          {confirmationSent ? (
            <div className="space-y-4 text-center">
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm leading-6 text-emerald-300" role="status">
                Check your email — we sent a confirmation link to{" "}
                <span className="font-semibold">{confirmationSent}</span>. Click it to activate
                your account, then sign in.
              </div>
              <button
                type="button"
                onClick={() => setLocation(`${basePath}/sign-in`)}
                className="w-full rounded-xl bg-red-600 px-4 py-3 text-sm font-semibold text-white hover:bg-red-500"
              >
                Go to sign-in
              </button>
            </div>
          ) : (
            <form onSubmit={handleSignUp} className="space-y-3">
              <div>
                <label htmlFor="signup-name" className="mb-1 block text-sm text-gray-300">
                  Full name <span className="text-gray-500">(optional)</span>
                </label>
                <input
                  id="signup-name"
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className={inputClass}
                  placeholder="Your name"
                  autoComplete="name"
                />
              </div>
              <div>
                <label htmlFor="signup-email" className="mb-1 block text-sm text-gray-300">
                  Email address
                </label>
                <input
                  id="signup-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={inputClass}
                  placeholder="you@example.com"
                  autoComplete="email"
                />
              </div>
              <div>
                <label htmlFor="signup-password" className="mb-1 block text-sm text-gray-300">
                  Password
                </label>
                <input
                  id="signup-password"
                  type={showPassword ? "text" : "password"}
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={inputClass}
                  placeholder="At least 6 characters"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="mt-1 text-xs text-gray-400 hover:text-gray-300"
                >
                  {showPassword ? "Hide password" : "Show password"}
                </button>
              </div>
              <button
                type="submit"
                disabled={pending}
                className="w-full rounded-xl bg-red-600 px-4 py-3 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-50"
              >
                {pending ? "Creating account…" : "Create account"}
              </button>
              <p className="pt-1 text-center text-sm text-gray-400">
                Already have an account?{" "}
                <button type="button" onClick={() => setLocation(`${basePath}/sign-in`)} className="font-semibold text-red-400 hover:text-red-300">
                  Sign in
                </button>
              </p>
            </form>
          )}
        </AuthCard>
      </div>
      <Footer />
    </div>
  );
}

function ProgressRoute() {
  const { user, isLoaded, isSignedIn } = useAuth();
  const shouldFetch = Boolean(isLoaded && isSignedIn && user);
  const { data: quizHistory } = useGetQuizResults({
    query: { enabled: shouldFetch, queryKey: ["quiz-results"] },
  });
  const { data: subData } = useGetSubscription({
    query: { enabled: shouldFetch, queryKey: ["subscription"] },
  });
  const isPro =
    subData?.subscription?.status === "active" ||
    subData?.subscription?.status === "trialing";
  const { data: adminAccess } = useGetAdminAccess({
    query: { enabled: shouldFetch, retry: false, queryKey: ["admin-access"] },
  });
  const effectiveIsPro =
    isPro ||
    adminAccess?.freeTestSimulation === true ||
    adminAccess?.isAdmin === true;
  return (
    <div className="min-h-screen">
      <TechBackground />
      <div className="relative z-10">
        <ProgressPage
          quizHistory={quizHistory || []}
          onBack={() => (window.location.href = basePath || "/")}
          onStartQuiz={(cat, diff) => {
            window.location.href = `${basePath}/`;
          }}
           isPro={effectiveIsPro}
        />
      </div>
      <Footer />
    </div>
  );
}

function AppContent() {
  const [, setLocation] = useLocation();
  const [state, setState] = useState<AppState>("home");
  const [mode, setMode] = useState<string>("all");
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [activeQuestions, setActiveQuestions] = useState<Question[]>([]);
  const [finalAnswers, setFinalAnswers] = useState<(number | null)[]>([]);
  const [isWeakMode, setIsWeakMode] = useState(false);

  const [timeLimit, setTimeLimit] = useState(0);
  const [questionTimes, setQuestionTimes] = useState<number[]>([]);
  const [completionTimestamp, setCompletionTimestamp] = useState<string>("");

  // Server-quiz plumbing (questionSetId + session + server question ids).
  const [serverQuestionIds, setServerQuestionIds] = useState<string[]>([]);
  const [questionSetId, setQuestionSetId] = useState<string | null>(null);
  const [quizServerMode, setQuizServerMode] = useState<ServerQuizMode | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [quizError, setQuizError] = useState<{ message: string; code?: string } | null>(null);
  const [quizLoading, setQuizLoading] = useState(false);
  const [resumeOffer, setResumeOffer] = useState<ResumeOffer | null>(null);
  const [resumeInitialAnswers, setResumeInitialAnswers] = useState<(number | null)[] | undefined>(undefined);
  const [resumeInitialIndex, setResumeInitialIndex] = useState(0);

  // Refs mirroring the above for async handlers (avoid stale closures).
  const serverQuestionIdsRef = useRef<string[]>([]);
  const questionSetIdRef = useRef<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const latestAnswersRef = useRef<(number | null)[]>([]);
  const lastQuizSpecRef = useRef<QuizSpec | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const quizMetaRef = useRef<{
    exam: string;
    serverMode: ServerQuizMode;
    tier: number | null;
    difficulty: Difficulty | null;
  } | null>(null);

  // 3-tier exam mode state
  const [isExamMode, setIsExamMode] = useState(false);
  const [examTier, setExamTier] = useState<ExamTier | null>(null);
  const [examUnlocked, setExamUnlocked] = useState<Record<ExamTier, boolean>>({ 1: true, 2: false, 3: false });
  const [examTierScores, setExamTierScores] = useState<Record<ExamTier, number>>({ 1: 0, 2: 0, 3: 0 });
  const [examTierAnswers, setExamTierAnswers] = useState<Partial<Record<ExamTier, (number | null)[]>>>({});
  const [examTierTimes, setExamTierTimes] = useState<Partial<Record<ExamTier, number[]>>>({});
  const [isBonusMode, setIsBonusMode] = useState(false);
  const [examFinalPct, setExamFinalPct] = useState(0);
  const [adminSimulation, setAdminSimulation] = useState<AdminSimulationConfig | null>(null);
  const [adminSimulationRuns, setAdminSimulationRuns] = useState(0);
  const [simulationExamUnlocked, setSimulationExamUnlocked] = useState<Record<ExamTier, boolean>>({ 1: true, 2: false, 3: false });
  const [simulationExamScores, setSimulationExamScores] = useState<Record<ExamTier, number>>({ 1: 0, 2: 0, 3: 0 });

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("comptia_exam_progress") || "null");
      if (saved && typeof saved.unlocked === "object") {
        setExamUnlocked({ 1: true, 2: saved.unlocked[2] === true, 3: saved.unlocked[3] === true });
        setExamTierScores({ 1: saved.scores?.[1] || 0, 2: saved.scores?.[2] || 0, 3: saved.scores?.[3] || 0 });
      }
    } catch {
      // ignore
    }
  }, []);

  function saveExamProgress(unlocked: Record<ExamTier, boolean>, scores: Record<ExamTier, number>) {
    try {
      localStorage.setItem("comptia_exam_progress", JSON.stringify({ unlocked, scores }));
    } catch {
      // ignore
    }
  }

  const { user, isLoaded, isSignedIn } = useAuth();
  const createAdminSimulationEvent = useCreateAdminSimulationEvent();

  const shouldFetch = Boolean(isLoaded && isSignedIn && user);
  const { data: quizHistory, isLoading: historyLoading } = useGetQuizResults({
    query: { enabled: shouldFetch, queryKey: ["quiz-results"] },
  });
  const { data: subData } = useGetSubscription({
    query: { enabled: shouldFetch, queryKey: ["subscription"] },
  });
  const isPro =
    subData?.subscription?.status === "active" ||
    subData?.subscription?.status === "trialing";
  const adminAccessQuery = useGetAdminAccess({
    query: { enabled: shouldFetch, retry: false, queryKey: ["admin-access"] },
  });
  const { data: publicSettings } = useGetAppSettings();
  const adminAccess = adminAccessQuery.data;
  const isSimulationPro = adminAccess?.freeTestSimulation === true;
  const isAdmin = adminAccess?.isAdmin === true;
  const pageBuilder = normalizePageBuilderSettings(publicSettings?.pageBuilder);

  // (a) Refresh server entitlements on mount and whenever the signed-in
  // identity changes, so trials.ts gates read server state.
  useEffect(() => {
    refreshEntitlements();
  }, [isSignedIn, user?.id]);

  // (e) Confirm before leaving/reloading a timed quiz in progress.
  useEffect(() => {
    if (state !== "quiz") return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [state]);

  // Resume offer: signed-in users get their server session (by the id
  // kept in localStorage); anonymous users get their local payload.
  useEffect(() => {
    if (!isLoaded) return;
    let cancelled = false;
    (async () => {
      if (isSignedIn) {
        const id = localStorage.getItem(ACTIVE_SESSION_KEY);
        if (!id) {
          if (!cancelled) setResumeOffer(null);
          return;
        }
        try {
          const session = await getSession(id);
          if (cancelled) return;
          if (session.completed) {
            localStorage.removeItem(ACTIVE_SESSION_KEY);
            setResumeOffer(null);
            return;
          }
          setResumeOffer({ kind: "server", session });
        } catch {
          localStorage.removeItem(ACTIVE_SESSION_KEY);
          if (!cancelled) setResumeOffer(null);
        }
      } else {
        try {
          const raw = localStorage.getItem(ANON_RESUME_KEY);
          if (!raw) {
            if (!cancelled) setResumeOffer(null);
            return;
          }
          const payload = JSON.parse(raw) as AnonResumePayload;
          if (!cancelled) setResumeOffer({ kind: "anon", payload });
        } catch {
          localStorage.removeItem(ANON_RESUME_KEY);
          if (!cancelled) setResumeOffer(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("adminSimulation") !== "1" || !isLoaded) return;
    if (!isSignedIn) {
      window.history.replaceState({}, document.title, `${basePath}/`);
      return;
    }
    if (!user || adminAccessQuery.isFetching || adminAccessQuery.isPending) return;
    if (isAdmin) {
      const config = loadAdminSimulationConfig();
      if (config) {
        setAdminSimulation(config);
        setAdminSimulationRuns(getAdminSimulationRuns());
        setSimulationExamUnlocked({ 1: true, 2: false, 3: false });
        setSimulationExamScores({ 1: 0, 2: 0, 3: 0 });
        if (config.profile === "restricted") setState("restricted");
      }
    }
    window.history.replaceState({}, document.title, `${basePath}/`);
  }, [isLoaded, isSignedIn, user, isAdmin, adminAccessQuery.isFetching, adminAccessQuery.isPending]);

  const simulatedPremium = adminSimulation?.profile === "pro" || adminSimulation?.profile === "hellmode";
  const isOwnerTesting = isAdmin && !adminSimulation;
  const effectiveIsPro = adminSimulation ? simulatedPremium : Boolean(isPro || isSimulationPro || isAdmin);
  const effectiveExamUnlocked: Record<ExamTier, boolean> = adminSimulation
    ? {
        1: true,
        2: adminSimulation.featureFlags.tierProgression && (
          adminSimulation.profile === "hellmode" || simulationExamUnlocked[2]
        ),
        3: adminSimulation.featureFlags.tierProgression && (
          adminSimulation.profile === "hellmode" || simulationExamUnlocked[3]
        ),
      }
    : examUnlocked;
  const effectiveExamScores = adminSimulation ? simulationExamScores : examTierScores;

  function logAdminSimulationEvent(
    event: "session_started" | "quiz_started" | "quiz_completed" | "access_blocked" | "session_ended",
    quizMode?: string,
    scorePercent?: number,
  ) {
    if (!adminSimulation || !isAdmin) return;
    createAdminSimulationEvent.mutate({
      data: {
        profile: adminSimulation.profile,
        event,
        dailyQuizLimit: adminSimulation.dailyQuizLimit,
        featureFlags: adminSimulation.featureFlags,
        ...(quizMode ? { quizMode: quizMode.slice(0, 100) } : {}),
        ...(scorePercent !== undefined ? { scorePercent } : {}),
      },
    });
  }

  function checkTrial(quizMode = "Quiz"): boolean {
    const signedIn = isSignedIn ?? false;
    if (adminSimulation) {
      if (adminSimulation.profile === "restricted") {
        logAdminSimulationEvent("access_blocked", quizMode);
        setState("restricted");
        return false;
      }
      if (adminSimulation.dailyQuizLimit > 0 && adminSimulationRuns >= adminSimulation.dailyQuizLimit) {
        logAdminSimulationEvent("access_blocked", quizMode);
        setState("pricing");
        return false;
      }
      const nextRuns = recordAdminSimulationRun();
      setAdminSimulationRuns(nextRuns);
      logAdminSimulationEvent("quiz_started", quizMode);
      return true;
    }
    if (isPro || isSimulationPro || isOwnerTesting) return true;
    if (!canStartTrial(signedIn, isPro)) {
      setState("pricing");
      return false;
    }
    recordTrialUsed(signedIn, isPro);
    return true;
  }

  // ---------------------------------------------------------------------------
  // Server quiz plumbing
  // ---------------------------------------------------------------------------

  /** Fetch a question set from the API. On failure sets quizError and
   *  returns null — callers must NOT fall back to local bank data. */
  async function loadQuestions(params: {
    exam?: ExamCategory | "all";
    mode: ServerQuizMode;
    tier?: 1 | 2 | 3;
    difficulty?: Difficulty;
    count?: number;
    questionSetId?: string;
  }): Promise<QuizQuestionsResponse | null> {
    setQuizLoading(true);
    setQuizError(null);
    try {
      return await fetchQuizQuestions(params);
    } catch (err) {
      if (err instanceof QuizApiError) {
        setQuizError({ message: err.message, code: err.code });
      } else {
        setQuizError({ message: "Could not load questions. Check your connection and try again." });
      }
      return null;
    } finally {
      setQuizLoading(false);
    }
  }

  /** One entry per served question; null = unanswered (counts as
   *  wrong server-side). Never filter unanswered out — the graded
   *  total must be the full delivered count. */
  function toSubmitAnswers(answers: (number | null)[]): { questionId: string; selectedIndex: number | null }[] {
    const ids = serverQuestionIdsRef.current;
    const out: { questionId: string; selectedIndex: number | null }[] = [];
    answers.forEach((sel, i) => {
      if (ids[i]) out.push({ questionId: ids[i], selectedIndex: sel });
    });
    return out;
  }

  /** Best-effort in-progress save (debounced caller). */
  async function saveSessionProgress(answers: (number | null)[]): Promise<void> {
    const id = sessionIdRef.current;
    const meta = quizMetaRef.current;
    if (!id || !meta) return;
    try {
      await createOrUpdateSession({
        id,
        exam: meta.exam,
        mode: meta.serverMode,
        tier: meta.tier,
        difficulty: meta.difficulty,
        questionIds: serverQuestionIdsRef.current,
        answers: toSubmitAnswers(answers),
        questionSetId: questionSetIdRef.current,
      });
    } catch {
      // Best-effort only; the finish save is authoritative.
    }
  }

  /** Called by QuizPage after every answer. */
  function handleQuizAnswer(answers: (number | null)[]): void {
    latestAnswersRef.current = answers;
    if (isSignedIn && sessionIdRef.current) {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        void saveSessionProgress(answers);
      }, 1000);
    } else if (!isSignedIn) {
      // Anonymous: localStorage-only resume payload.
      try {
        const raw = localStorage.getItem(ANON_RESUME_KEY);
        if (!raw) return;
        const payload = JSON.parse(raw) as AnonResumePayload;
        payload.answers = toSubmitAnswers(answers);
        payload.savedAt = Date.now();
        localStorage.setItem(ANON_RESUME_KEY, JSON.stringify(payload));
      } catch {
        // ignore
      }
    }
  }

  function clearResumeState(): void {
    try {
      localStorage.removeItem(ANON_RESUME_KEY);
      localStorage.removeItem(ACTIVE_SESSION_KEY);
    } catch {
      // ignore
    }
    setResumeOffer(null);
  }

  function dismissResume(): void {
    try {
      if (resumeOffer?.kind === "server") localStorage.removeItem(ACTIVE_SESSION_KEY);
      else localStorage.removeItem(ANON_RESUME_KEY);
    } catch {
      // ignore
    }
    setResumeOffer(null);
  }

  /**
   * Start a quiz from a served set: map questions (no answer keys),
   * create the server session for signed-in users, store the anonymous
   * resume payload otherwise, and enter the quiz state.
   */
  async function beginQuiz(args: {
    res: QuizQuestionsResponse;
    displayMode: string;
    difficulty: Difficulty;
    timeLimitSeconds: number;
    spec: QuizSpec;
    exam: string;
    serverMode: ServerQuizMode;
    tier: number | null;
    isWeak: boolean;
    isExam: boolean;
    examTierValue: ExamTier | null;
    isBonus: boolean;
    initialAnswers?: (number | null)[];
    initialIndex?: number;
    reuseSessionId?: string | null;
  }): Promise<boolean> {
    const { res } = args;
    const gated =
      (args.serverMode === "tier" && args.tier !== null && args.tier >= 2) ||
      (args.serverMode !== "tier" && (args.difficulty === "medium" || args.difficulty === "hard"));

    let finalSessionId: string | null = args.reuseSessionId ?? null;
    if (isSignedIn && !finalSessionId) {
      try {
        const created = await createOrUpdateSession({
          exam: args.exam,
          mode: args.serverMode,
          tier: args.tier,
          difficulty: args.difficulty,
          questionIds: res.questions.map((q) => q.id),
          questionSetId: res.questionSetId,
        });
        finalSessionId = created.id;
      } catch {
        if (gated) {
          // Pro-gated grading needs the session id; don't start a quiz
          // that could never be graded.
          setQuizError({
            message: "Could not start this quiz — the server session could not be created. Sign in again and retry.",
            code: "SESSION_REQUIRED",
          });
          return false;
        }
        finalSessionId = null;
      }
    }

    const clientQuestions = res.questions.map(toClientQuestion);
    // Snapshot the served set so resume can restore without
    // re-fetching (no second cap charge). Public questions only.
    saveQuestionSnapshot(res.questionSetId, res.questions);
    const ids = res.questions.map((q) => q.id);
    quizMetaRef.current = {
      exam: args.exam,
      serverMode: args.serverMode,
      tier: args.tier,
      difficulty: args.difficulty,
    };
    serverQuestionIdsRef.current = ids;
    questionSetIdRef.current = res.questionSetId;
    latestAnswersRef.current = args.initialAnswers ?? Array(res.questions.length).fill(null);
    lastQuizSpecRef.current = args.spec;

    if (isSignedIn && finalSessionId) {
      sessionIdRef.current = finalSessionId;
      setSessionId(finalSessionId);
      try {
        localStorage.setItem(ACTIVE_SESSION_KEY, finalSessionId);
      } catch {
        // ignore
      }
    } else {
      sessionIdRef.current = null;
      setSessionId(null);
    }
    if (!isSignedIn) {
      try {
        const payload: AnonResumePayload = {
          questionSetId: res.questionSetId,
          exam: args.exam,
          serverMode: args.serverMode,
          tier: args.tier,
          difficulty: args.difficulty,
          count: res.questions.length,
          answers: [],
          savedAt: Date.now(),
        };
        localStorage.setItem(ANON_RESUME_KEY, JSON.stringify(payload));
      } catch {
        // ignore
      }
    }

    setServerQuestionIds(ids);
    setQuestionSetId(res.questionSetId);
    setQuizServerMode(args.serverMode);
    setMode(args.displayMode);
    setDifficulty(args.difficulty);
    setIsWeakMode(args.isWeak);
    setActiveQuestions(clientQuestions);
    setTimeLimit(args.timeLimitSeconds);
    setQuestionTimes([]);
    setCompletionTimestamp("");
    setFinalAnswers([]);
    setIsExamMode(args.isExam);
    setIsBonusMode(args.isBonus);
    setExamTier(args.examTierValue);
    setResumeInitialAnswers(args.initialAnswers);
    setResumeInitialIndex(args.initialIndex ?? 0);
    setQuizError(null);
    setState("quiz");
    return true;
  }

  /**
   * Grade the current quiz server-side and fill the review pages'
   * correct answers + explanations in from the server's perQuestion
   * result. The server grades over the FULL delivered count
   * (unanswered count as wrong), so its numbers ARE the displayed
   * numbers — no client-side recomputation.
   */
  async function gradeAndBuildReview(answers: (number | null)[]): Promise<{
    correct: number;
    total: number;
    rawPctFull: number;
    scaledFull: number;
  }> {
    const meta = quizMetaRef.current;
    const qsid = questionSetIdRef.current;
    if (!meta || !qsid) throw new Error("No active quiz to grade.");
    const submitted = toSubmitAnswers(answers);
    const result = await submitQuiz({
      questionSetId: qsid,
      exam: meta.exam as ExamCategory | "all",
      mode: meta.serverMode,
      tier: (meta.tier ?? undefined) as 1 | 2 | 3 | undefined,
      difficulty: meta.difficulty ?? undefined,
      sessionId: sessionIdRef.current ?? undefined,
      answers: submitted,
    });
    const byId = new Map(result.perQuestion.map((p) => [p.questionId, p]));
    const ids = serverQuestionIdsRef.current;
    setActiveQuestions((prev) =>
      prev.map((q, i) => {
        const p = byId.get(ids[i]);
        return p
          ? { ...q, correctIndex: p.correctIndex, explanation: p.explanation ?? "", category: p.category }
          : q;
      }),
    );
    const wrongIds = result.perQuestion.filter((p) => !p.correct).map((p) => p.questionId);
    saveWeakServerIds(wrongIds);
    return { correct: result.correct, total: result.total, rawPctFull: result.rawPct, scaledFull: result.scaledScore };
  }

  /** Mark the server session completed (with the result). The submit
   *  call already persisted the quiz_results row and marked the
   *  session completed, so this is idempotent — no duplicate row. */
  async function completeSession(result: { correct: number; total: number; scaledScore: number }): Promise<void> {
    const id = sessionIdRef.current;
    const meta = quizMetaRef.current;
    if (!id || !meta) return;
    try {
      await createOrUpdateSession({
        id,
        exam: meta.exam,
        mode: meta.serverMode,
        tier: meta.tier,
        difficulty: meta.difficulty,
        questionIds: serverQuestionIdsRef.current,
        answers: toSubmitAnswers(latestAnswersRef.current),
        questionSetId: questionSetIdRef.current,
        completed: true,
        result,
      });
    } catch {
      // Submit already persisted the result; the session row staying
      // open is recoverable via the resume offer (it will 404/clear).
    }
  }

  // ---------------------------------------------------------------------------
  // Quiz start paths (all server-served)
  // ---------------------------------------------------------------------------

  async function handleStart(selected: "all" | ExamCategory, length: "full" | "fast", diff: Difficulty) {
    if (!checkTrial(`${selected} ${length} quiz`)) return;
    const questionCount = length === "fast" ? 15 : 30;
    const res = await loadQuestions({ exam: selected, mode: length, difficulty: diff, count: questionCount });
    if (!res) return;
    await beginQuiz({
      res,
      displayMode: selected,
      difficulty: diff,
      timeLimitSeconds: getTimeLimitSeconds(res.questions.length, diff),
      spec: { kind: "practice", selected, length, diff },
      exam: selected,
      serverMode: length,
      tier: null,
      isWeak: false,
      isExam: false,
      examTierValue: null,
      isBonus: false,
    });
  }

  async function handleStudyWeak(selected: "all" | ExamCategory) {
    if (!checkTrial(`${selected} weak-area study`)) return;
    const weakIds = loadWeakServerIds();
    if (weakIds.length === 0) {
      setQuizError({ message: "No weak areas yet — finish a quiz first and the questions you miss will show up here." });
      return;
    }
    const res = await loadQuestions({ exam: selected, mode: "full", difficulty: "easy", count: 30 });
    if (!res) return;
    // Keep only the weak questions the server happened to serve in
    // this set; if none overlap, fall back to the served set.
    const weakSet = new Set(weakIds);
    const filtered = res.questions.filter((q) => weakSet.has(q.id));
    const served = filtered.length > 0 ? filtered : res.questions;
    const weakRes: QuizQuestionsResponse = { ...res, questions: served, served: served.length };
    await beginQuiz({
      res: weakRes,
      displayMode: selected,
      difficulty: "medium",
      timeLimitSeconds: getTimeLimitSeconds(served.length, "medium"),
      spec: { kind: "weak", selected },
      exam: selected,
      serverMode: "full",
      tier: null,
      isWeak: true,
      isExam: false,
      examTierValue: null,
      isBonus: false,
    });
  }

  async function handleStudyTopic(topic: DomainTopic) {
    if (!checkTrial(`${topic} topic study`)) return;
    // The server has no topic filter yet: topic study serves a
    // mixed-exam set at the allowed difficulty (easy for free, medium
    // for Pro — passing medium for a free user would 403).
    const res = await loadQuestions({
      exam: "all",
      mode: "topic",
      ...(effectiveIsPro ? { difficulty: "medium" as Difficulty } : {}),
      count: 30,
    });
    if (!res) return;
    await beginQuiz({
      res,
      displayMode: topic,
      difficulty: effectiveIsPro ? "medium" : "easy",
      timeLimitSeconds: getTimeLimitSeconds(res.questions.length, "medium"),
      spec: { kind: "topic", topic },
      exam: "all",
      serverMode: "topic",
      tier: null,
      isWeak: false,
      isExam: false,
      examTierValue: null,
      isBonus: false,
    });
  }

  async function handleStartSimulation(
    selected: ExamCategory,
    diff: Difficulty | "mixed",
  ) {
    if (adminSimulation && !adminSimulation.featureFlags.timedSimulations) {
      logAdminSimulationEvent("access_blocked", `${selected} simulation`);
      return;
    }
    if (!adminSimulation) {
      // Client pre-check against the cached entitlements; the server
      // is the authority and will 403 if no attempt is left.
      // Membership alone grants NO sims — a sim needs an admin bypass,
      // a paid test attempt for this exam, or the free half-sim.
      const ent = getCachedEntitlements();
      const hasAttempt = (ent?.testAttempts?.[selected]?.remaining ?? 0) > 0;
      if (!isOwnerTesting && !hasAttempt && ent && !ent.freeSimAvailable) {
        setState("pricing");
        return;
      }
      // A paid attempt (or the admin bypass) is the payment for this
      // sim — skip the free-trial check, which would otherwise block
      // a user whose one-time taste is spent.
      if (!isOwnerTesting && !hasAttempt && !checkTrial(`${selected} simulation`)) return;
    } else if (!checkTrial(`${selected} simulation`)) return;
    // The server ignores the difficulty param for simulations (pool is
    // easy+medium for free, all difficulties for Pro); passing
    // medium/hard would trip the Pro gate for free users, so omit it.
    const res = await loadQuestions({ exam: selected, mode: "simulation", count: 90 });
    if (!res) return;
    await beginQuiz({
      res,
      displayMode: `${selected} Simulation`,
      difficulty: diff === "mixed" ? "medium" : diff,
      timeLimitSeconds: res.questions.length * 60,
      spec: { kind: "simulation", selected, diff },
      exam: selected,
      serverMode: "simulation",
      tier: null,
      isWeak: false,
      isExam: false,
      examTierValue: null,
      isBonus: false,
    });
  }

  async function handleFinish(answers: (number | null)[], qTimes: number[]) {
    latestAnswersRef.current = answers;
    setFinalAnswers(answers);
    setQuestionTimes(qTimes);
    const timestamp = new Date().toLocaleString();
    setCompletionTimestamp(timestamp);

    try {
      const { correct, total, rawPctFull, scaledFull } = await gradeAndBuildReview(answers);
      if (adminSimulation) {
        logAdminSimulationEvent("quiz_completed", mode, rawPctFull);
      }
      // quiz_results persistence now happens server-side in
      // POST /api/quiz/submit (not via createResult).
      await completeSession({ correct, total, scaledScore: scaledFull });
    } catch (err) {
      setQuizError({
        message:
          err instanceof QuizApiError
            ? `Grading failed: ${err.message}`
            : "Grading failed. Your answers are saved — use Submit & Grade to retry.",
      });
      return;
    }

    clearResumeState();
    setState("passfail");
  }

  async function handleRetry() {
    const spec = lastQuizSpecRef.current;
    if (!spec) return;
    if (spec.kind === "tier") {
      await handleStartExamTier(spec.tier);
      return;
    }
    if (spec.kind === "bonus") {
      await handleStartBonus();
      return;
    }
    if (spec.kind === "practice") {
      await handleStart(spec.selected, spec.length, spec.diff);
      return;
    }
    if (spec.kind === "weak") {
      await handleStudyWeak(spec.selected);
      return;
    }
    if (spec.kind === "topic") {
      await handleStudyTopic(spec.topic);
      return;
    }
    if (spec.kind === "simulation") {
      await handleStartSimulation(spec.selected, spec.diff);
      return;
    }
  }

  function handleHome() {
    setState("home");
    setIsWeakMode(false);
    setIsExamMode(false);
    setExamTier(null);
    setIsBonusMode(false);
  }

  function endAdminSimulation() {
    if (adminSimulation) logAdminSimulationEvent("session_ended");
    clearAdminSimulation();
    setAdminSimulation(null);
    setAdminSimulationRuns(0);
    setState("home");
    setLocation("/admin");
  }

  async function handleStartExamTier(tier: ExamTier) {
    if (!isOwnerTesting && !effectiveExamUnlocked[tier]) return;
    if (!checkTrial(`Exam Tier ${tier}`)) return;
    const tierSettings = pageBuilder.tiers[String(tier) as "1" | "2" | "3"];
    const res = await loadQuestions({ mode: "tier", tier, count: tierSettings.questionCount });
    if (!res) return;
    const tierDifficulty: Difficulty = tier === 1 ? "easy" : tier === 2 ? "medium" : "hard";
    await beginQuiz({
      res,
      displayMode: `Exam Tier ${tier}`,
      difficulty: tierDifficulty,
      // Timer derives from the DELIVERED count: free Tier 1 serves at
      // most the one-time 30-question taste, not the full 270.
      timeLimitSeconds: res.questions.length * tierSettings.secondsPerQuestion,
      spec: { kind: "tier", tier },
      exam: "all",
      serverMode: "tier",
      tier,
      isWeak: false,
      isExam: true,
      examTierValue: tier,
      isBonus: false,
    });
  }

  useEffect(() => {
    const requestedTier = Number(new URLSearchParams(window.location.search).get("adminTier"));
    if (!isAdmin || ![1, 2, 3].includes(requestedTier)) return;
    window.history.replaceState({}, document.title, `${basePath}/`);
    void handleStartExamTier(requestedTier as ExamTier);
  }, [isAdmin]);

  async function handleExamFinish(answers: (number | null)[], qTimes: number[]) {
    const currentTier = examTier as ExamTier;
    latestAnswersRef.current = answers;
    try {
      const { correct, total, rawPctFull, scaledFull } = await gradeAndBuildReview(answers);
      // The ONE pass standard: scaled >= 750 (82% raw). The admin
      // page-builder passingScore is not consulted here — it defaults
      // to 82 and the results page uses the same scaled check.
      const scorePct = rawPctFull;
      const passed = isCompTiaPass(scaledFull);

      setExamTierAnswers((prev) => ({ ...prev, [currentTier]: answers }));
      setExamTierTimes((prev) => ({ ...prev, [currentTier]: qTimes }));
      const nextScores = { ...effectiveExamScores, [currentTier]: scorePct };
      if (adminSimulation) setSimulationExamScores(nextScores);
      else {
        setExamTierScores(nextScores);
        saveExamProgress(effectiveExamUnlocked, nextScores);
      }

      const nextTier = (currentTier + 1) as ExamTier;
      if (
        passed &&
        nextTier <= 3 &&
        !effectiveExamUnlocked[nextTier] &&
        (!adminSimulation || adminSimulation.featureFlags.tierProgression)
      ) {
        const newUnlocked = { ...effectiveExamUnlocked, [nextTier]: true };
        if (adminSimulation) setSimulationExamUnlocked(newUnlocked);
        else {
          setExamUnlocked(newUnlocked);
          saveExamProgress(newUnlocked, nextScores);
        }
      }

      setFinalAnswers(answers);
      setQuestionTimes(qTimes);
      setCompletionTimestamp(new Date().toLocaleString());

      if (currentTier === 3) {
        // Calculate final average across all tiers
        const scores = nextScores;
        const avg = Math.round((scores[1] + scores[2] + scores[3]) / 3);
        setExamFinalPct(avg);
      }
      if (adminSimulation) {
        logAdminSimulationEvent("quiz_completed", `Exam Tier ${currentTier}`, scorePct);
      }
      await completeSession({ correct, total, scaledScore: scaledFull });
      // Refresh entitlements so the next tier unlocks from server
      // state (the server verifies tier passes from quiz_results).
      await refreshEntitlements();
    } catch (err) {
      setQuizError({
        message:
          err instanceof QuizApiError
            ? `Grading failed: ${err.message}`
            : "Grading failed. Your answers are saved — use Submit & Grade to retry.",
      });
      return;
    }

    clearResumeState();
    setState("results");
  }

  async function handleStartBonus() {
    if (adminSimulation && !adminSimulation.featureFlags.bonusQuestions) return;
    if (!checkTrial("Bonus round")) return;
    // No dedicated bonus endpoint: the bonus round is served as a
    // 10-question hard full quiz (hard needs a signed-in Pro user,
    // which the 95% tier-average gate already implies).
    const res = await loadQuestions({ exam: "all", mode: "full", difficulty: "hard", count: 10 });
    if (!res) return;
    await beginQuiz({
      res,
      displayMode: "Bonus",
      difficulty: "hard",
      timeLimitSeconds: res.questions.length * 60,
      spec: { kind: "bonus" },
      exam: "all",
      serverMode: "full",
      tier: null,
      isWeak: false,
      isExam: true,
      examTierValue: null,
      isBonus: true,
    });
  }

  async function handleBonusFinish(answers: (number | null)[], qTimes: number[]) {
    latestAnswersRef.current = answers;
    try {
      const { correct, total, rawPctFull, scaledFull } = await gradeAndBuildReview(answers);
      setFinalAnswers(answers);
      setQuestionTimes(qTimes);
      setCompletionTimestamp(new Date().toLocaleString());
      if (adminSimulation) {
        logAdminSimulationEvent("quiz_completed", "Bonus round", rawPctFull);
      }
      await completeSession({ correct, total, scaledScore: scaledFull });
    } catch (err) {
      setQuizError({
        message:
          err instanceof QuizApiError
            ? `Grading failed: ${err.message}`
            : "Grading failed. Your answers are saved — use Submit & Grade to retry.",
      });
      return;
    }
    clearResumeState();
    setState("results");
  }

  // ---------------------------------------------------------------------------
  // Resume
  // ---------------------------------------------------------------------------

  function resumeLabel(offer: ResumeOffer): string {
    if (offer.kind === "server") {
      const s = offer.session;
      return s.mode === "tier" ? `Tier ${s.tier} exam` : `${s.exam} ${s.mode} quiz`;
    }
    const p = offer.payload;
    return p.serverMode === "tier" ? `Tier ${p.tier} exam` : `${p.exam} ${p.serverMode} quiz`;
  }

  function resumeCounts(offer: ResumeOffer): { answered: number; total: number } {
    if (offer.kind === "server") {
      return { answered: offer.session.answers.length, total: offer.session.questionIds.length };
    }
    return { answered: offer.payload.answers.length, total: offer.payload.count };
  }

  async function handleResume() {
    const offer = resumeOffer;
    if (!offer) return;
    setResumeOffer(null);
    const saved =
      offer.kind === "server"
        ? {
            exam: offer.session.exam,
            mode: offer.session.mode,
            tier: offer.session.tier,
            difficulty: offer.session.difficulty,
            questionIds: offer.session.questionIds,
            questionSetId: offer.session.questionSetId,
            answers: offer.session.answers,
          }
        : {
            exam: offer.payload.exam,
            mode: offer.payload.serverMode,
            tier: offer.payload.tier,
            difficulty: offer.payload.difficulty,
            questionIds: [] as string[],
            questionSetId: offer.payload.questionSetId,
            answers: offer.payload.answers,
          };
    const count = offer.kind === "server" ? saved.questionIds.length : offer.payload.count;
    // Resume restores the served set from the local snapshot when
    // available — no re-fetch, no second cap charge. Re-fetching
    // with the same questionSetId reproduces the same option order
    // (server shuffles deterministically from it); signed-in
    // re-serves are additionally exempt from cap counting server-side.
    // The timer restarts from the delivered count; remaining time is
    // not stored on the session.
    let res: QuizQuestionsResponse | null = null;
    const snapshot = saved.questionSetId ? loadQuestionSnapshot(saved.questionSetId) : null;
    const snapshotOk =
      snapshot !== null &&
      snapshot.length === count &&
      (offer.kind === "server" ? snapshot.every((q) => saved.questionIds.includes(q.id)) : true);
    if (snapshotOk && snapshot && saved.questionSetId) {
      res = {
        questionSetId: saved.questionSetId,
        exam: saved.exam as ExamCategory | "all",
        mode: saved.mode as ServerQuizMode,
        tier: (saved.tier ?? null) as 1 | 2 | 3 | null,
        difficulty: (saved.difficulty ?? null) as Difficulty | null,
        questions: snapshot,
        served: snapshot.length,
        requested: snapshot.length,
        poolSize: snapshot.length,
        examFiltered: false,
        tier3IsHellMode: false,
        freeRemaining: null,
        isPro: false,
        isMember: false,
        testAttempts: {},
      };
    } else {
      res = await loadQuestions({
        exam: saved.exam as ExamCategory | "all",
        mode: saved.mode as ServerQuizMode,
        tier: (saved.tier ?? undefined) as 1 | 2 | 3 | undefined,
        difficulty: (saved.difficulty ?? undefined) as Difficulty | undefined,
        count,
        questionSetId: saved.questionSetId ?? undefined,
      });
    }
    if (!res) return;
    const byId = new Map(saved.answers.map((a) => [a.questionId, a.selectedIndex]));
    const initialAnswers = res.questions.map((q) => byId.get(q.id) ?? null);
    const firstUnanswered = initialAnswers.findIndex((a) => a === null);
    const initialIndex = firstUnanswered === -1 ? 0 : firstUnanswered;
    const serverMode = saved.mode as ServerQuizMode;
    const tier = (saved.tier ?? null) as 1 | 2 | 3 | null;
    const difficulty = (saved.difficulty as Difficulty | null) ?? "easy";
    const displayMode =
      serverMode === "tier" ? `Exam Tier ${tier}` : serverMode === "simulation" ? `${saved.exam} Simulation` : saved.exam;
    const timeLimitSeconds =
      serverMode === "tier" && tier
        ? res.questions.length * pageBuilder.tiers[String(tier) as "1" | "2" | "3"].secondsPerQuestion
        : serverMode === "simulation"
          ? res.questions.length * 60
          : getTimeLimitSeconds(res.questions.length, difficulty);
    const spec: QuizSpec =
      serverMode === "tier" && tier
        ? { kind: "tier", tier: tier as ExamTier }
        : serverMode === "simulation"
          ? { kind: "simulation", selected: saved.exam as ExamCategory, diff: "mixed" }
          : serverMode === "topic"
            ? { kind: "topic", topic: saved.exam as DomainTopic }
            : {
                kind: "practice",
                selected: saved.exam as "all" | ExamCategory,
                length: serverMode === "full" ? "full" : "fast",
                diff: difficulty,
              };
    await beginQuiz({
      res,
      displayMode,
      difficulty,
      timeLimitSeconds,
      spec,
      exam: saved.exam,
      serverMode,
      tier,
      isWeak: false,
      isExam: serverMode === "tier",
      examTierValue: serverMode === "tier" ? (tier as ExamTier) : null,
      isBonus: false,
      initialAnswers,
      initialIndex,
      reuseSessionId: offer.kind === "server" ? offer.session.id : null,
    });
  }

  const simulationRunsRemaining = adminSimulation
    ? adminSimulation.dailyQuizLimit === 0
      ? null
      : Math.max(0, adminSimulation.dailyQuizLimit - adminSimulationRuns)
    : undefined;
  const simulationTrialMessage = adminSimulation && adminSimulation.dailyQuizLimit > 0
    ? simulationRunsRemaining === 0
      ? "No quiz starts remain in this test session."
      : `${simulationRunsRemaining} quiz starts remain in this test session.`
    : null;

  if (state === "restricted" && adminSimulation?.profile === "restricted") {
    return (
      <div className="relative flex min-h-screen flex-col overflow-hidden bg-[#060910] text-white">
        <TechBackground />
        <div className="relative z-10 flex flex-1 items-center justify-center px-4">
          <section className="w-full max-w-lg rounded-3xl border border-red-500/20 bg-[#0c111b] p-8 text-center shadow-2xl shadow-red-950/20">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-red-400/20 bg-red-400/10 text-red-300">
              <ShieldCheck size={26} />
            </div>
            <p className="mt-5 text-xs font-bold uppercase tracking-[0.2em] text-red-300">Simulated account state</p>
            <h1 className="mt-2 text-2xl font-bold">Access is restricted</h1>
            <p className="mt-3 text-sm leading-6 text-slate-400">
              This is an isolated preview of the restricted learner experience. No real account was suspended or changed.
            </p>
            <button
              type="button"
              onClick={endAdminSimulation}
              className="mt-6 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-500"
            >
              Exit test and return to admin
            </button>
          </section>
        </div>
        <div className="relative z-10">
          <Footer />
        </div>
      </div>
    );
  }

  if (state === "pricing") {
    return (
      <div className="min-h-screen">
        <PricingPage onBack={handleHome} />
        <Footer />
      </div>
    );
  }

  if (state === "progress") {
    return (
      <div className="min-h-screen">
        <ProgressPage
          quizHistory={adminSimulation ? [] : quizHistory || []}
          onBack={handleHome}
          onStartQuiz={(cat, diff) => {
            setMode(cat as ExamCategory);
            setDifficulty(diff);
            void handleStart(cat as "all" | ExamCategory, "full", diff);
          }}
          isPro={effectiveIsPro}
        />
        <Footer />
      </div>
    );
  }

  const resumeCountsValue = resumeOffer ? resumeCounts(resumeOffer) : null;

  return (
    <div className="min-h-screen">
      <TechBackground />
      <div className="relative z-10">
        {quizError && (
          <div role="alert" className="mx-auto mt-4 max-w-2xl rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200">
            <p className="font-semibold">Couldn’t load your quiz</p>
            <p className="mt-1 leading-relaxed text-red-300/90">{quizError.message}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {(quizError.code === "PRO_REQUIRED" ||
                quizError.code === "AUTH_REQUIRED" ||
                quizError.code === "TIER_LOCKED" ||
                quizError.code === "TEST_ATTEMPT_REQUIRED" ||
                quizError.code === "FREE_LIMIT_REACHED") && (
                <button
                  type="button"
                  onClick={() => setState("pricing")}
                  className="rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-red-500"
                >
                  View plans
                </button>
              )}
              <button
                type="button"
                onClick={() => setQuizError(null)}
                className="rounded-lg border border-white/10 px-3 py-2 text-sm text-slate-300 transition hover:bg-white/5 hover:text-white"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}
        {quizLoading ? (
          <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-4 text-slate-400" role="status" aria-label="Loading questions">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-700 border-t-red-500" />
            <p className="text-sm">Loading your questions…</p>
          </div>
        ) : (
          <>
            {state === "home" && resumeOffer && resumeCountsValue && (
              <div className="mx-auto mt-4 max-w-2xl rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm text-emerald-200">
                <p className="font-semibold">Resume your quiz?</p>
                <p className="mt-1 text-emerald-300/90">
                  You have an unfinished {resumeLabel(resumeOffer)} — {resumeCountsValue.answered} of {resumeCountsValue.total} answered
                  {resumeOffer.kind === "anon" ? " (saved in this browser only)" : ""}.
                </p>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => void handleResume()}
                    className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500"
                  >
                    Resume quiz
                  </button>
                  <button
                    type="button"
                    onClick={dismissResume}
                    className="rounded-lg border border-white/10 px-3 py-2 text-sm text-slate-300 transition hover:bg-white/5 hover:text-white"
                  >
                    Discard
                  </button>
                </div>
              </div>
            )}
            {state === "home" && (
              <HomePage
                onStart={handleStart}
                onStartSimulation={handleStartSimulation}
                onStudyWeak={handleStudyWeak}
                onStudyTopic={handleStudyTopic}
                onStartExamTier={handleStartExamTier}
                examUnlocked={effectiveExamUnlocked}
                examTierScores={effectiveExamScores}
                onPricing={() => setState("pricing")}
                onProgress={() => setState("progress")}
                quizHistory={adminSimulation ? [] : quizHistory || []}
                historyLoading={adminSimulation ? false : historyLoading}
                isPro={effectiveIsPro}
                isAdmin={isOwnerTesting}
                isSignedIn={adminSimulation ? false : isSignedIn ?? false}
                testAttempts={getCachedEntitlements()?.testAttempts}
                remainingTrials={simulationRunsRemaining ?? getRemainingTrials(isSignedIn ?? false, effectiveIsPro)}
                trialStatusMessage={simulationTrialMessage ?? getTrialStatusMessage(isSignedIn ?? false, effectiveIsPro)}
                simulationProfile={adminSimulation?.profile}
                simulationFeatures={adminSimulation?.featureFlags}
                simulationRunsRemaining={simulationRunsRemaining}
                onEndSimulation={endAdminSimulation}
              />
            )}
            {state === "quiz" && (
              <QuizPage
                questions={activeQuestions}
                mode={mode}
                difficulty={difficulty}
                isWeakMode={isWeakMode}
                isExamMode={isExamMode}
                timeLimitSeconds={timeLimit}
                onFinish={isBonusMode ? handleBonusFinish : isExamMode ? handleExamFinish : handleFinish}
                onHome={handleHome}
                tierSecondsPerQuestion={
                  examTier
                    ? pageBuilder.tiers[String(examTier) as "1" | "2" | "3"].secondsPerQuestion
                    : undefined
                }
                initialAnswers={resumeInitialAnswers}
                initialIndex={resumeInitialIndex}
                onAnswer={handleQuizAnswer}
                hideAnswers
                questionSetId={questionSetId}
                serverQuestionIds={serverQuestionIds}
                // Immediate per-question feedback for practice modes;
                // the full-test simulation is a real exam and shows
                // nothing mid-quiz (feedback comes at the end).
                instantFeedback={quizServerMode !== null && quizServerMode !== "simulation"}
              />
            )}
            {state === "passfail" && (
              <PassFailPage
                questions={activeQuestions}
                answers={finalAnswers}
                mode={mode}
                difficulty={difficulty}
                isWeakMode={isWeakMode}
                questionTimes={questionTimes}
                completionTimestamp={completionTimestamp}
                onViewResults={() => setState("results")}
                onRetry={handleRetry}
                onHome={handleHome}
              />
            )}
            {state === "results" && (
              <ResultsPage
                questions={activeQuestions}
                answers={finalAnswers}
                mode={mode}
                difficulty={difficulty}
                isWeakMode={isWeakMode}
                isExamMode={isExamMode}
                isBonusMode={isBonusMode}
                examTier={examTier}
                examUnlocked={effectiveExamUnlocked}
                examTierScores={effectiveExamScores}
                examFinalPct={examFinalPct}
                questionTimes={questionTimes}
                completionTimestamp={completionTimestamp}
                onRetry={handleRetry}
                onHome={handleHome}
                onProgress={() => setState("progress")}
                onNextExamTier={handleStartExamTier}
                onStartBonus={handleStartBonus}
                canStartBonus={adminSimulation?.featureFlags.bonusQuestions ?? true}
              />
            )}
          </>
        )}
      </div>
      <Footer />
    </div>
  );
}

export default function App() {
  const [location] = useLocation();

  if (location === "/checkout/success") {
    return <CheckoutSuccessPage onHome={() => (window.location.href = basePath || "/")} />;
  }
  if (location === "/checkout/cancel") {
    return (
      <CheckoutCancelPage
        onHome={() => (window.location.href = basePath || "/")}
        onPricing={() => (window.location.href = `${basePath}/pricing`)}
      />
    );
  }

  return (
    <Switch>
      <Route path="/sign-in/*?" component={SignInPage} />
      <Route path="/sign-up/*?" component={SignUpPage} />
      <Route path="/checkout/success" component={() => (
        <CheckoutSuccessPage onHome={() => (window.location.href = basePath || "/")} />
      )} />
      <Route path="/checkout/cancel" component={() => (
        <CheckoutCancelPage
          onHome={() => (window.location.href = basePath || "/")}
          onPricing={() => (window.location.href = `${basePath}/pricing`)}
        />
      )} />
      <Route path="/terms" component={TermsPage} />
      <Route path="/privacy" component={PrivacyPage} />
      <Route path="/progress" component={ProgressRoute} />
      <Route path="/admin" component={AdminPage} />
      <Route path="/" component={AppContent} />
    </Switch>
  );
}

import { useState, useEffect, useMemo } from "react";
import { SignIn, SignUp, Show, useUser, useAuth } from "@clerk/react";
import { Switch, Route, useLocation } from "wouter";
import { ShieldCheck, X } from "lucide-react";
import TechBackground from "@/components/TechBackground";
import {
  ExamCategory,
  Difficulty,
  getAllQuestions,
  getQuestionsByCategory,
  getQuestionsByTopic,
  getTimeLimitSeconds,
  Question,
  scrambleOptions,
  comptiaScaledScore,
  weightedScore,
} from "@/data/questions";
import { getMixedTopicQuestions } from "@/data/topic-pool";
import type { DomainTopic } from "@/data/topics";
import { generateSimulation, recordSimulationUsed, getSimulationStatus } from "@/data/simulation";
import type { SimulationQuestion } from "@/data/simulation";
import { getTierAsQuestions, getTierTimeLimitSeconds, getBonusAsQuestions, ExamTier } from "@/data/exam-bank";
import {
  useGetQuizResults,
  useCreateQuizResult,
  useGetSubscription,
  useGetAdminAccess,
  useGetManagedQuestions,
  useCreateAdminSimulationEvent,
} from "@workspace/api-client-react";
import {
  canStartTrial,
  recordTrialUsed,
  getRemainingTrials,
  getTrialStatusMessage,
} from "@/lib/trials";
import HomePage from "@/pages/HomePage";
import QuizPage from "@/pages/QuizPage";
import PassFailPage from "@/pages/PassFailPage";
import ResultsPage from "@/pages/ResultsPage";
import PricingPage from "@/pages/PricingPage";
import CheckoutSuccessPage from "@/pages/CheckoutSuccessPage";
import CheckoutCancelPage from "@/pages/CheckoutCancelPage";
import ProgressPage from "@/pages/ProgressPage";
import AdminPage from "@/pages/AdminPage";
import {
  clearAdminSimulation,
  getAdminSimulationRuns,
  loadAdminSimulationConfig,
  recordAdminSimulationRun,
  type AdminSimulationConfig,
} from "@/lib/admin-simulation";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

type AppState = "home" | "quiz" | "passfail" | "results" | "pricing" | "progress" | "restricted";

type QuizMode = "all" | ExamCategory | { topic: DomainTopic };

const EXAM_TIER_PASS_PCT = 80;
const EXAM_BADGE_PCT = 90;
const EXAM_BONUS_PCT = 95;

function getWeakQuestions(): Question[] {
  try {
    const ids = JSON.parse(
      localStorage.getItem("comptia_weak_areas") || "[]",
    ) as number[];
    const all = getAllQuestions();
    return all.filter((q) => ids.includes(q.id));
  } catch {
    return [];
  }
}

function SignInPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center px-4">
      <SignIn
        routing="path"
        path={`${basePath}/sign-in`}
        signUpUrl={`${basePath}/sign-up`}
      />
    </div>
  );
}

function SignUpPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center px-4">
      <SignUp
        routing="path"
        path={`${basePath}/sign-up`}
        signInUrl={`${basePath}/sign-in`}
      />
    </div>
  );
}

function AdminAccessButton() {
  const { isLoaded, isSignedIn } = useAuth();
  const [showPrompt, setShowPrompt] = useState(false);

  if (!isLoaded) return null;

  function openAdmin() {
    if (isSignedIn) {
      window.location.href = `${basePath}/admin`;
      return;
    }
    setShowPrompt(true);
  }

  function continueToSignIn() {
    window.location.href = `${basePath}/sign-in`;
  }

  return (
    <>
      <button
        type="button"
        onClick={openAdmin}
        aria-label="Open secure admin access"
        title="Secure admin access"
        className="fixed bottom-4 right-4 z-50 flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-slate-950/70 text-slate-500 shadow-lg shadow-black/20 backdrop-blur transition hover:border-red-500/40 hover:bg-slate-900 hover:text-red-300 focus:outline-none focus:ring-2 focus:ring-red-500/60 focus:ring-offset-2 focus:ring-offset-slate-950"
      >
        <ShieldCheck size={16} strokeWidth={1.8} />
      </button>

      {showPrompt && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
          role="presentation"
          onClick={() => setShowPrompt(false)}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-access-title"
            className="relative w-full max-w-sm rounded-2xl border border-white/10 bg-[#0c111b] p-5 shadow-2xl shadow-black/40"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setShowPrompt(false)}
              aria-label="Close admin access prompt"
              className="absolute right-3 top-3 rounded-md p-1 text-slate-500 transition hover:text-white focus:outline-none focus:ring-2 focus:ring-red-500/60"
            >
              <X size={16} />
            </button>
            <div className="flex items-start gap-3 pr-6">
              <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-2 text-red-300">
                <ShieldCheck size={18} />
              </div>
              <div>
                <h2 id="admin-access-title" className="font-semibold text-white">
                  Secure admin access
                </h2>
                <p className="mt-1 text-sm leading-5 text-slate-400">
                  Continue to the secure sign-in prompt. Your admin password or token is handled by Clerk and is never stored by this app.
                </p>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowPrompt(false)}
                className="rounded-lg border border-white/10 px-3 py-2 text-sm text-slate-300 transition hover:bg-white/5 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={continueToSignIn}
                className="rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-red-500 focus:outline-none focus:ring-2 focus:ring-red-400/70"
              >
                Continue to sign in
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}

function ProgressRoute() {
  const { user, isLoaded } = useUser();
  const { isSignedIn } = useAuth();
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
      <AdminAccessButton />
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

  const { user, isLoaded } = useUser();
  const { isSignedIn } = useAuth();
  const createResult = useCreateQuizResult();
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
  const adminAccess = adminAccessQuery.data;
  const isSimulationPro = adminAccess?.freeTestSimulation === true;
  const isAdmin = adminAccess?.isAdmin === true;

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
  const { data: managedQuestionData } = useGetManagedQuestions({
    query: { queryKey: ["managed-questions"], staleTime: 60_000 },
  });
  const managedQuestions = useMemo<(Question & { adminTier?: number })[]>(
    () =>
      (managedQuestionData ?? []).map((question) => ({
        id: 1_000_000 + question.id,
        category: ["A+", "Network+", "Security+"].includes(question.category)
          ? (question.category as ExamCategory)
          : "A+",
        question: question.question,
        options: question.options,
        correctIndex: question.correctIndex,
        explanation: question.explanation,
        difficulty: question.difficulty,
        adminTier: question.tier,
      })),
    [managedQuestionData],
  );

  function includeManagedQuestions(questions: Question[], selected: "all" | ExamCategory, diff: Difficulty, count: number) {
    const matching = managedQuestions.filter(
      (question) =>
        (selected === "all" || question.category === selected) &&
        question.difficulty === diff,
    );
    return scrambleOptions([...questions, ...matching]).slice(0, count);
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

  function handleStart(selected: "all" | ExamCategory, length: "full" | "fast", diff: Difficulty) {
    if (!checkTrial(`${selected} ${length} quiz`)) return;
    // Full mode is the 90-question practice run. Fast mode is exactly half
    // that length; do not derive it from the 270-question bank size.
    const questionCount = length === "fast" ? 45 : 90;
     const baseQuestions =
      selected === "all"
        ? getAllQuestions(questionCount, diff)
        : getQuestionsByCategory(selected, questionCount, diff);
     const qs = includeManagedQuestions(baseQuestions, selected, diff, questionCount);
    const limit = getTimeLimitSeconds(qs.length, diff);
    setMode(selected);
    setDifficulty(diff);
    setIsWeakMode(false);
    setActiveQuestions(qs);
    setTimeLimit(limit);
    setQuestionTimes([]);
    setCompletionTimestamp("");
    setState("quiz");
  }

  function handleStudyWeak(selected: "all" | ExamCategory) {
    if (!checkTrial(`${selected} weak-area study`)) return;
    let qs = getWeakQuestions();
    if (selected !== "all") {
      qs = qs.filter((q) => q.category === selected);
    }
    if (qs.length === 0) return;
    qs = scrambleOptions(qs);
    const limit = getTimeLimitSeconds(qs.length, "medium");
    setMode(selected);
    setDifficulty("medium");
    setIsWeakMode(true);
    setActiveQuestions(qs);
    setTimeLimit(limit);
    setQuestionTimes([]);
    setCompletionTimestamp("");
    setState("quiz");
  }

  function handleStudyTopic(topic: DomainTopic) {
    if (!checkTrial(`${topic} topic study`)) return;
    const qs = getMixedTopicQuestions(topic, 30);
    const limit = getTimeLimitSeconds(qs.length, "medium");
    setMode(topic);
    setDifficulty("medium");
    setIsWeakMode(false);
    setActiveQuestions(qs);
    setTimeLimit(limit);
    setQuestionTimes([]);
    setCompletionTimestamp("");
    setState("quiz");
  }

  function handleStartSimulation(
    selected: ExamCategory,
    diff: Difficulty | "mixed",
  ) {
    if (adminSimulation && !adminSimulation.featureFlags.timedSimulations) {
      logAdminSimulationEvent("access_blocked", `${selected} simulation`);
      return;
    }
    if (
      !adminSimulation &&
      !getSimulationStatus(selected, effectiveIsPro).canStart
    ) {
      setState("pricing");
      return;
    }
    if (!checkTrial(`${selected} simulation`)) return;
    if (!adminSimulation && !effectiveIsPro) recordSimulationUsed(selected);
    const qs = generateSimulation(selected, diff, effectiveIsPro);
    setMode(`${selected} Simulation`);
    setDifficulty(diff === "mixed" ? "medium" : diff);
    setIsWeakMode(false);
    setIsExamMode(false);
    setIsBonusMode(false);
    setExamTier(null);
    setActiveQuestions(qs);
    setTimeLimit(qs.length * 60);
    setQuestionTimes([]);
    setCompletionTimestamp("");
    setState("quiz");
  }

  function handleFinish(answers: (number | null)[], qTimes: number[]) {
    setFinalAnswers(answers);
    setQuestionTimes(qTimes);
    const timestamp = new Date().toLocaleString();
    setCompletionTimestamp(timestamp);

    if (adminSimulation) {
      const correct = activeQuestions.filter((q, i) => answers[i] === q.correctIndex).length;
      logAdminSimulationEvent(
        "quiz_completed",
        mode,
        Math.round((correct / activeQuestions.length) * 100),
      );
    } else if (isSignedIn) {
      const totalCorrect = activeQuestions.filter(
        (q, i) => answers[i] === q.correctIndex,
      ).length;
      const rawPct = Math.round((totalCorrect / activeQuestions.length) * 100);
      const wPct = weightedScore(activeQuestions, answers);
      const scaled = comptiaScaledScore(wPct);
      const wrongIds = activeQuestions
        .filter((q, i) => answers[i] !== q.correctIndex)
        .map((q) => q.id);

      createResult.mutate({
        data: {
          category: mode === "all" ? "Trifecta" : mode,
          mode: isWeakMode ? "study" : difficulty,
          score: wPct,
          totalQuestions: activeQuestions.length,
          correctCount: totalCorrect,
          scaledScore: scaled,
          weakAreaIds: wrongIds,
        },
      });
    }

    setState("passfail");
  }

  function handleRetry() {
    if (isExamMode && examTier) {
      handleStartExamTier(examTier);
      return;
    }
    if (isExamMode && isBonusMode) {
      if (!checkTrial("Bonus round retry")) return;
      const qs = getBonusAsQuestions();
      setActiveQuestions(qs);
      setTimeLimit(qs.length * 60);
      setQuestionTimes([]);
      setCompletionTimestamp("");
      setState("quiz");
      return;
    }
    if (!checkTrial(`${mode} retry`)) return;
    if (isWeakMode) {
      const qs = getWeakQuestions();
      if (mode !== "all" && ["A+", "Network+", "Security+"].includes(mode)) {
        setActiveQuestions(qs.filter((q) => q.category === mode));
      } else {
        setActiveQuestions(qs);
      }
    } else {
      let qs: Question[];
      if (mode === "all") {
        qs = getAllQuestions(undefined, difficulty);
      } else if (["A+", "Network+", "Security+"].includes(mode)) {
        qs = getQuestionsByCategory(mode as ExamCategory, undefined, difficulty);
      } else {
        qs = getQuestionsByTopic(mode as DomainTopic, 20);
      }
      setActiveQuestions(qs);
    }
    setQuestionTimes([]);
    setCompletionTimestamp("");
    setState("quiz");
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

  function handleStartExamTier(tier: ExamTier) {
    if (!isOwnerTesting && !effectiveExamUnlocked[tier]) return;
    if (!checkTrial(`Exam Tier ${tier}`)) return;
    const managedTierQuestions = managedQuestions.filter((question) => question.adminTier === tier);
    const qs = scrambleOptions([...getTierAsQuestions(tier), ...managedTierQuestions]).slice(0, 270);
    const limit = getTierTimeLimitSeconds(tier);
    const tierDifficulty: Difficulty = tier === 1 ? "easy" : tier === 2 ? "medium" : "hard";
    setMode(`Exam Tier ${tier}`);
    setDifficulty(tierDifficulty);
    setIsExamMode(true);
    setIsWeakMode(false);
    setIsBonusMode(false);
    setExamTier(tier);
    setActiveQuestions(qs);
    setTimeLimit(limit);
    setQuestionTimes([]);
    setCompletionTimestamp("");
    setFinalAnswers([]);
    setState("quiz");
  }

  useEffect(() => {
    const requestedTier = Number(new URLSearchParams(window.location.search).get("adminTier"));
    if (!isAdmin || ![1, 2, 3].includes(requestedTier)) return;
    window.history.replaceState({}, document.title, `${basePath}/`);
    handleStartExamTier(requestedTier as ExamTier);
  }, [isAdmin]);

  function handleExamFinish(answers: (number | null)[], qTimes: number[]) {
    const currentTier = examTier as ExamTier;
    const totalCorrect = activeQuestions.filter((q, i) => answers[i] === q.correctIndex).length;
    const rawPct = Math.round((totalCorrect / activeQuestions.length) * 100);

    setExamTierAnswers((prev) => ({ ...prev, [currentTier]: answers }));
    setExamTierTimes((prev) => ({ ...prev, [currentTier]: qTimes }));
    const nextScores = { ...effectiveExamScores, [currentTier]: rawPct };
    if (adminSimulation) setSimulationExamScores(nextScores);
    else {
      setExamTierScores(nextScores);
      saveExamProgress(effectiveExamUnlocked, nextScores);
    }

    const passed = rawPct >= EXAM_TIER_PASS_PCT;
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
      logAdminSimulationEvent("quiz_completed", `Exam Tier ${currentTier}`, rawPct);
    }

    setState("results");
  }

  function handleStartBonus() {
    if (adminSimulation && !adminSimulation.featureFlags.bonusQuestions) return;
    if (!checkTrial("Bonus round")) return;
    const qs = getBonusAsQuestions();
    const limit = qs.length * 60;
    setMode("Bonus");
    setDifficulty("hard");
    setIsExamMode(true);
    setIsWeakMode(false);
    setIsBonusMode(true);
    setExamTier(null);
    setActiveQuestions(qs);
    setTimeLimit(limit);
    setQuestionTimes([]);
    setCompletionTimestamp("");
    setFinalAnswers([]);
    setState("quiz");
  }

  function handleBonusFinish(answers: (number | null)[], qTimes: number[]) {
    setFinalAnswers(answers);
    setQuestionTimes(qTimes);
    setCompletionTimestamp(new Date().toLocaleString());
    if (adminSimulation) {
      const correct = activeQuestions.filter((q, i) => answers[i] === q.correctIndex).length;
      logAdminSimulationEvent("quiz_completed", "Bonus round", Math.round((correct / activeQuestions.length) * 100));
    }
    setState("results");
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
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#060910] px-4 text-white">
        <TechBackground />
        <section className="relative z-10 w-full max-w-lg rounded-3xl border border-red-500/20 bg-[#0c111b] p-8 text-center shadow-2xl shadow-red-950/20">
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
        <AdminAccessButton />
      </div>
    );
  }

  if (state === "pricing") {
    return <PricingPage onBack={handleHome} />;
  }

  if (state === "progress") {
    return (
      <ProgressPage
        quizHistory={adminSimulation ? [] : quizHistory || []}
        onBack={handleHome}
        onStartQuiz={(cat, diff) => {
          setMode(cat as ExamCategory);
          setDifficulty(diff);
          handleStart(cat as "all" | ExamCategory, "full", diff);
        }}
        isPro={effectiveIsPro}
      />
    );
  }

  return (
    <div className="min-h-screen">
      <TechBackground />
      <div className="relative z-10">
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
      </div>
      <AdminAccessButton />
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
      <Route path="/progress" component={ProgressRoute} />
      <Route path="/admin" component={AdminPage} />
      <Route path="/" component={AppContent} />
    </Switch>
  );
}

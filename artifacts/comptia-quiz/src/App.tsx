import { useState, useEffect, useMemo } from "react";
import { SignIn, SignUp, Show, useUser, useAuth } from "@clerk/react";
import { Switch, Route, useLocation } from "wouter";
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

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

type AppState = "home" | "quiz" | "passfail" | "results" | "pricing" | "progress";

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
  const effectiveIsPro = isPro || adminAccess?.freeTestSimulation === true;
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
    </div>
  );
}

function AppContent() {
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
  const { data: adminAccess } = useGetAdminAccess({
    query: { enabled: shouldFetch, retry: false, queryKey: ["admin-access"] },
  });
  const isSimulationPro = adminAccess?.freeTestSimulation === true;
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

  function checkTrial(): boolean {
    const signedIn = isSignedIn ?? false;
    if (isPro || isSimulationPro) return true;
    if (!canStartTrial(signedIn, isPro)) {
      setState("pricing");
      return false;
    }
    recordTrialUsed(signedIn, isPro);
    return true;
  }

  function handleStart(selected: "all" | ExamCategory, length: "full" | "fast", diff: Difficulty) {
    if (!checkTrial()) return;
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
    if (!checkTrial()) return;
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
    if (!checkTrial()) return;
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

  function handleFinish(answers: (number | null)[], qTimes: number[]) {
    setFinalAnswers(answers);
    setQuestionTimes(qTimes);
    const timestamp = new Date().toLocaleString();
    setCompletionTimestamp(timestamp);

    if (isSignedIn) {
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
    if (!checkTrial()) return;
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

  function handleStartExamTier(tier: ExamTier) {
    if (!examUnlocked[tier]) return;
    if (!checkTrial()) return;
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

  function handleExamFinish(answers: (number | null)[], qTimes: number[]) {
    const currentTier = examTier as ExamTier;
    const totalCorrect = activeQuestions.filter((q, i) => answers[i] === q.correctIndex).length;
    const rawPct = Math.round((totalCorrect / activeQuestions.length) * 100);

    setExamTierAnswers((prev) => ({ ...prev, [currentTier]: answers }));
    setExamTierTimes((prev) => ({ ...prev, [currentTier]: qTimes }));
    setExamTierScores((prev) => {
      const next = { ...prev, [currentTier]: rawPct };
      saveExamProgress(examUnlocked, next);
      return next;
    });

    const passed = rawPct >= EXAM_TIER_PASS_PCT;
    const nextTier = (currentTier + 1) as ExamTier;

    if (passed && nextTier <= 3 && !examUnlocked[nextTier]) {
      const newUnlocked = { ...examUnlocked, [nextTier]: true };
      setExamUnlocked(newUnlocked);
      saveExamProgress(newUnlocked, { ...examTierScores, [currentTier]: rawPct });
    }

    setFinalAnswers(answers);
    setQuestionTimes(qTimes);
    setCompletionTimestamp(new Date().toLocaleString());

    if (currentTier === 3) {
      // Calculate final average across all tiers
      const scores = { ...examTierScores, [currentTier]: rawPct };
      const avg = Math.round((scores[1] + scores[2] + scores[3]) / 3);
      setExamFinalPct(avg);
    }

    setState("results");
  }

  function handleStartBonus() {
    if (!checkTrial()) return;
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
    setState("results");
  }

  if (state === "pricing") {
    return <PricingPage onBack={handleHome} />;
  }

  if (state === "progress") {
    return (
      <ProgressPage
        quizHistory={quizHistory || []}
        onBack={handleHome}
        onStartQuiz={(cat, diff) => {
          setMode(cat as ExamCategory);
          setDifficulty(diff);
          handleStart(cat as "all" | ExamCategory, "full", diff);
        }}
        isPro={isPro}
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
          onStudyWeak={handleStudyWeak}
          onStudyTopic={handleStudyTopic}
          onStartExamTier={handleStartExamTier}
          examUnlocked={examUnlocked}
          examTierScores={examTierScores}
          onPricing={() => setState("pricing")}
          onProgress={() => setState("progress")}
          quizHistory={quizHistory || []}
          historyLoading={historyLoading}
          isPro={isPro || isSimulationPro}
          isSignedIn={isSignedIn ?? false}
          remainingTrials={getRemainingTrials(isSignedIn ?? false, isPro || isSimulationPro)}
          trialStatusMessage={getTrialStatusMessage(isSignedIn ?? false, isPro || isSimulationPro)}
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
          examUnlocked={examUnlocked}
          examTierScores={examTierScores}
          examFinalPct={examFinalPct}
          questionTimes={questionTimes}
          completionTimestamp={completionTimestamp}
          onRetry={handleRetry}
          onHome={handleHome}
          onProgress={() => setState("progress")}
          onNextExamTier={handleStartExamTier}
          onStartBonus={handleStartBonus}
        />
      )}
      </div>
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

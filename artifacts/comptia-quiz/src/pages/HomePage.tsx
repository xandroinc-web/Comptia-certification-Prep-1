import { useState, useEffect, useMemo } from "react";
import { useAuth, displayNameFor, avatarUrlFor } from "../lib/auth";
import { useLocation } from "wouter";
import { QuizResult } from "@workspace/api-client-react";
import { Sparkles, BookOpen, Monitor, Wifi, HardDrive, Cloud, Wrench, Shield, Bug, ClipboardList, Trophy, Flame, Timer, Lock, Zap } from "lucide-react";
import { EXAMS, EXAM_DESCRIPTIONS, EXAM_COUNTS } from "@/lib/bank-meta";
import type { ExamCategory } from "@/lib/scoring";
import { ALL_DOMAINS, DomainTopic, getDomainColor, DOMAIN_METADATA } from "@/data/topics";
import { getTopicPoolCount, getTopicsInRandomOrder } from "@/data/topic-pool";
import { computeGamification, GamificationState } from "@/lib/gamification";
import type { ExamTier } from "@/data/exam-bank";
import { useGetAppSettings } from "@workspace/api-client-react";
import type { AdminSimulationFlags, AdminSimulationProfile } from "@/lib/admin-simulation";
import { normalizePageBuilderSettings, type PageBuilderSettings } from "@/lib/page-builder";

import {
  type Difficulty,
  DIFFICULTY_LABELS,
  DIFFICULTY_COLORS,
} from "@/lib/scoring";
import { getDifficultyBreakdown, getDifficultyCount } from "@/lib/bank-meta";

type TestLength = "full" | "fast";

interface HomePageProps {
  onStart: (mode: "all" | ExamCategory, length: TestLength, difficulty: Difficulty) => void;
  onStartSimulation?: (category: ExamCategory, difficulty: Difficulty | "mixed") => void;
  onStudyWeak: (mode: "all" | ExamCategory) => void;
  onStudyTopic: (topic: DomainTopic) => void;
  onStartExamTier: (tier: ExamTier) => void;
  examUnlocked: Record<ExamTier, boolean>;
  examTierScores: Record<ExamTier, number>;
  onPricing: () => void;
  onProgress: () => void;
  quizHistory: QuizResult[];
  historyLoading: boolean;
  isPro: boolean;
  isAdmin: boolean;
  isSignedIn: boolean;
  /** Unexpired full-test attempts per exam (from the entitlements cache). */
  testAttempts?: Record<string, { remaining: number; expiresAt: string | null }>;
  remainingTrials: number;
  trialStatusMessage: string | null;
  simulationProfile?: AdminSimulationProfile | null;
  simulationFeatures?: AdminSimulationFlags;
  simulationRunsRemaining?: number | null;
  onEndSimulation?: () => void;
}

function getWeakCount(): number {
  try {
    const stored = JSON.parse(localStorage.getItem("comptia_weak_areas") || "[]");
    return stored.length;
  } catch { return 0; }
}

function loadBuilderPreview(isAdmin: boolean): PageBuilderSettings | null {
  if (!isAdmin || typeof window === "undefined") return null;
  if (new URLSearchParams(window.location.search).get("pageBuilderPreview") !== "1") return null;
  try {
    return normalizePageBuilderSettings(JSON.parse(localStorage.getItem("comptia_page_builder_preview") || "null"));
  } catch {
    return null;
  }
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

const DOMAIN_ICONS: Record<DomainTopic, React.ReactNode> = {
  "1.0 Mobile Devices": <Monitor size={14} />,
  "2.0 Networking": <Wifi size={14} />,
  "3.0 Hardware": <HardDrive size={14} />,
  "4.0 Virtualization & Cloud Computing": <Cloud size={14} />,
  "5.0 Hardware & Network Troubleshooting": <Wrench size={14} />,
  "1.0 Operating Systems": <BookOpen size={14} />,
  "2.0 Security": <Shield size={14} />,
  "3.0 Software Troubleshooting": <Bug size={14} />,
  "4.0 Operational Procedures": <ClipboardList size={14} />,
};

export default function HomePage({ onStart, onStartSimulation, onStudyWeak, onStudyTopic, onStartExamTier, examUnlocked, examTierScores, onPricing, onProgress, quizHistory, historyLoading, isPro, isAdmin, isSignedIn, testAttempts, remainingTrials, trialStatusMessage, simulationProfile, simulationFeatures, simulationRunsRemaining, onEndSimulation }: HomePageProps) {
  const [selected, setSelected] = useState<"all" | ExamCategory>("all");
  const [testLength, setTestLength] = useState<TestLength>("full");
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [weakCount, setWeakCount] = useState(0);
  const [previewSettings] = useState(() => loadBuilderPreview(isAdmin));
  const [, setLocation] = useLocation();
  const { user, isLoaded, signOut } = useAuth();

  const gamification = useMemo(() => computeGamification(quizHistory), [quizHistory]);
  const randomTopics = useMemo(() => getTopicsInRandomOrder(), []);
  const { data: appSettings } = useGetAppSettings();
  const pageBuilder = normalizePageBuilderSettings(previewSettings ?? appSettings?.pageBuilder);
  const homeThemeStyle = {
    "--home-primary": pageBuilder.primaryColor,
    "--home-accent": pageBuilder.accentColor,
    "--home-background": pageBuilder.backgroundColor,
    "--home-panel": pageBuilder.panelColor,
    "--home-text": pageBuilder.textColor,
    backgroundColor: pageBuilder.backgroundColor,
    color: pageBuilder.textColor,
  } as React.CSSProperties;

  useEffect(() => {
    setWeakCount(getWeakCount());
  }, []);

  const selectedCount =
    selected === "all"
      ? getDifficultyCount(difficulty)
      : getDifficultyBreakdown(selected)[difficulty];
  const totalQuestions = Math.min(30, selectedCount);
  const fastCount = Math.min(15, totalQuestions);
  const diffBreakdown = getDifficultyBreakdown(selected === "all" ? undefined : selected);

  return (
    <div className="home-page-theme min-h-screen flex flex-col items-center p-4" style={homeThemeStyle}>
      <div className="w-full max-w-lg">
        {/* Auth bar */}
        <div className="flex items-center justify-end gap-3 mb-4 mt-2">
          {isSignedIn && isLoaded && user && (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                {avatarUrlFor(user) ? (
                  <img src={avatarUrlFor(user) as string} alt="" className="w-7 h-7 rounded-full" />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-red-600 flex items-center justify-center text-white text-xs font-bold">
                    {displayNameFor(user)[0]?.toUpperCase() || "U"}
                  </div>
                )}
                <span className="text-gray-300 text-sm font-medium">
                  {displayNameFor(user)}
                </span>
              </div>
              <button
                onClick={() => void signOut()}
                className="text-gray-500 hover:text-gray-300 text-xs font-medium transition-colors"
              >
                Sign out
              </button>
            </div>
          )}
          {!isSignedIn && (
            <>
              <button
                onClick={() => setLocation("/sign-in")}
                className="text-gray-400 hover:text-white text-sm font-medium transition-colors"
              >
                Sign in
              </button>
              <button
                onClick={() => setLocation("/sign-up")}
                className="bg-red-600 hover:bg-red-500 text-white text-sm font-medium px-3 py-1.5 rounded-lg transition-colors"
              >
                Sign up
              </button>
            </>
          )}
        </div>

        {/* Disclaimer */}
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 mb-6 text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <svg className="w-4 h-4 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
            <span className="text-amber-400 text-xs font-bold uppercase tracking-wider">{pageBuilder.disclaimerTitle}</span>
          </div>
          <p className="text-gray-300 text-sm leading-relaxed">
            {pageBuilder.disclaimerText}
          </p>
        </div>

        {simulationProfile && (
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-violet-400/30 bg-violet-400/10 px-4 py-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-violet-200">
                Admin test session · {simulationProfile === "hellmode" ? "HellMode" : simulationProfile}
              </p>
              <p className="mt-1 text-xs text-violet-100/70">
                Simulated access only. No real account, subscription, or quiz history is being changed.
                {simulationRunsRemaining !== null && simulationRunsRemaining !== undefined
                  ? ` ${simulationRunsRemaining} quiz starts remaining.`
                  : ""}
              </p>
            </div>
            <button
              type="button"
              onClick={onEndSimulation}
              className="rounded-lg border border-violet-300/20 px-3 py-2 text-xs font-semibold text-violet-100 transition hover:bg-violet-200/10"
            >
              Exit test session
            </button>
          </div>
        )}

        {/* Trial / Pro status banner */}
        {!isPro && trialStatusMessage && (
          <div className={`rounded-xl p-4 mb-4 text-center border ${remainingTrials === 0 ? "bg-red-500/10 border-red-500/30" : "bg-sky-500/10 border-sky-500/30"}`}>
            <p className={`text-sm font-semibold ${remainingTrials === 0 ? "text-red-300" : "text-sky-300"}`}>
              {trialStatusMessage}
            </p>
            {remainingTrials === 0 && (
              <button
                onClick={onPricing}
                className="mt-2 text-xs font-bold uppercase tracking-wider text-white bg-red-600 hover:bg-red-500 px-3 py-1.5 rounded-lg transition-colors"
              >
                Get Practice Membership
              </button>
            )}
          </div>
        )}

        {/* Header */}
        <div className="text-center mb-10">
          <div className="flex items-center justify-center gap-3 mb-6 flex-wrap">
            <div className="inline-flex items-center gap-2 bg-red-600/10 border border-red-600/30 rounded-full px-4 py-1.5 text-red-400 text-sm font-medium">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              {pageBuilder.eyebrow}
            </div>
            {isPro ? (
              <div className="inline-flex items-center gap-1.5 bg-red-500/10 border border-red-500/30 rounded-full px-3 py-1 text-red-400 text-xs font-bold uppercase tracking-wider">
                <Sparkles size={14} />
                Pro
              </div>
            ) : (
              <div className="inline-flex items-center gap-1.5 bg-sky-500/10 border border-sky-500/30 rounded-full px-3 py-1 text-sky-400 text-xs font-bold uppercase tracking-wider">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
                Free to Start
              </div>
            )}
            {gamification.streak > 0 && (
              <div className="inline-flex items-center gap-1.5 bg-orange-500/10 border border-orange-500/30 rounded-full px-3 py-1 text-orange-400 text-xs font-bold uppercase tracking-wider">
                <Flame size={14} />
                {gamification.streak}-Day Streak
              </div>
            )}
          </div>

          {/* Simulation Mode Card */}
          {(simulationFeatures?.timedSimulations ?? true) && (
            <SimulationCard
              selected={selected}
              isAdmin={isAdmin}
              testAttempts={testAttempts}
              onStartSimulation={onStartSimulation}
              onPricing={onPricing}
              isAdminSimulation={Boolean(simulationProfile)}
              simulationRunsRemaining={simulationRunsRemaining}
            />
          )}
          <h1 className="text-4xl font-bold text-white tracking-tight mb-2">
            {pageBuilder.title}
          </h1>
          <p className="text-gray-400 text-base">
            {pageBuilder.subtitle}
          </p>
          <p className="text-sky-300/80 text-sm mt-1.5 italic">
            {pageBuilder.tagline}
          </p>
           {appSettings?.announcement && (
             <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-2.5 text-left text-xs text-red-200">
               {appSettings.announcement}
             </div>
           )}
           {appSettings?.maintenanceMode && (
             <div className="mt-2 rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-2.5 text-left text-xs text-amber-200">
               Maintenance mode is active. Your saved progress remains available.
             </div>
           )}

          {/* Road to Certification mini bar */}
          {gamification.roadToCertPct > 0 && (
            <div className="mt-5 max-w-xs mx-auto">
              <div className="flex items-center justify-between mb-1">
                <span className="text-gray-500 text-xs font-medium uppercase tracking-wider">Road to Certification</span>
                <span className="text-red-400 text-xs font-bold">{gamification.roadToCertPct}%</span>
              </div>
              <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                <div className="h-2 bg-gradient-to-r from-red-600 to-red-400 rounded-full transition-all duration-700" style={{ width: `${gamification.roadToCertPct}%` }} />
              </div>
            </div>
          )}

          {/* Achievement preview row */}
          {gamification.badges.filter(b => b.unlocked).length > 0 && (
            <div className="flex items-center justify-center gap-2 mt-4 flex-wrap">
              {gamification.badges.filter(b => b.unlocked).slice(0, 5).map(b => (
                <span key={b.id} className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-semibold border ${b.color}`}>
                  <span>{b.icon}</span>
                  {b.label}
                </span>
              ))}
              {gamification.badges.filter(b => b.unlocked).length > 5 && (
                <span className="text-gray-500 text-xs">+{gamification.badges.filter(b => b.unlocked).length - 5} more</span>
              )}
            </div>
          )}
        </div>

        {/* Simulation disclaimer — this is practice, not the real exam */}
        <div className="rounded-2xl border-2 border-amber-500/60 bg-amber-500/10 p-5 mb-4 text-center">
          <p className="text-amber-300 font-bold text-base leading-relaxed">
            This is NOT the real CompTIA exam. Trifecta Quiz is a practice
            simulation built to mirror the real exam — same style, same
            timing, same pressure — so you walk into the real test ready to
            pass it the first time.
          </p>
        </div>

        {/* Why CompTIA matters */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 mb-4">
          <h2 className="text-white text-lg font-bold mb-4">
            Why CompTIA matters
          </h2>
          <div className="space-y-4">
            <div>
              <p className="text-white font-semibold text-sm">
                CompTIA is the standard employers ask for.
              </p>
              <p className="text-gray-400 text-sm mt-0.5">
                A+, Network+ and Security+ are the certifications hiring
                managers look for. They prove you can do the job, not just
                talk about it.
              </p>
            </div>
            <div>
              <p className="text-white font-semibold text-sm">
                Certified gets you hired.
              </p>
              <p className="text-gray-400 text-sm mt-0.5">
                Certified candidates get past the HR filter, get interviews
                faster, and earn more than uncertified applicants with the
                same skills.
              </p>
            </div>
            <div>
              <p className="text-white font-semibold text-sm">
                Why practice with this simulation.
              </p>
              <p className="text-gray-400 text-sm mt-0.5">
                Real-exam format, timed, scored 100–900 with a 750 pass
                mark, tiers up to HellMode, and fireworks when you pass — so
                the real exam feels like something you have already done.
              </p>
            </div>
          </div>
        </div>

        {/* Progress Snapshot */}
        {quizHistory.length > 0 && (
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 mb-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-gray-400 text-sm font-medium uppercase tracking-widest">Progress Snapshot</p>
              {isPro && (
                <span className="inline-flex items-center gap-1 bg-red-500/10 border border-red-500/30 rounded-full px-2 py-0.5 text-red-400 text-[10px] font-bold uppercase tracking-wider">
                  <Sparkles size={10} />
                  Pro
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-gray-800/50 rounded-xl p-3 text-center">
                <p className="text-gray-500 text-xs uppercase tracking-wider">Quizzes</p>
                <p className="text-white font-bold text-lg">{quizHistory.length}</p>
              </div>
              <div className="bg-gray-800/50 rounded-xl p-3 text-center">
                <p className="text-gray-500 text-xs uppercase tracking-wider">Avg Score</p>
                <p className="text-white font-bold text-lg">{Math.round(quizHistory.reduce((a, h) => a + h.score, 0) / quizHistory.length)}%</p>
              </div>
              <div className="bg-gray-800/50 rounded-xl p-3 text-center">
                <p className="text-gray-500 text-xs uppercase tracking-wider">Best Score</p>
                <p className="text-white font-bold text-lg">{Math.max(...quizHistory.map((h) => h.score))}%</p>
              </div>
              <div className="bg-gray-800/50 rounded-xl p-3 text-center">
                <p className="text-gray-500 text-xs uppercase tracking-wider">Streak</p>
                <p className="text-white font-bold text-lg">{gamification.streak} days</p>
              </div>
            </div>
            {isPro && (
              <div className="mt-3 pt-3 border-t border-gray-800">
                <p className="text-gray-500 text-xs uppercase tracking-wider mb-2">Latest Badges</p>
                <div className="flex flex-wrap gap-2">
                  {gamification.badges.filter(b => b.unlocked).slice(-3).map(b => (
                    <span key={b.id} className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-semibold border ${b.color}`}>
                      <span>{b.icon}</span>
                      {b.label}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* 3-Tier Exam Mode Card */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 mb-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-gray-400 text-sm font-medium uppercase tracking-widest">3-Tier CompTIA Exam</p>
            <span className="inline-flex items-center gap-1 bg-red-500/10 border border-red-500/30 rounded-full px-2 py-0.5 text-red-400 text-[10px] font-bold uppercase tracking-wider">
              <Flame size={12} />
              {EXAM_COUNTS.all} Questions
            </span>
          </div>
          <p className="text-gray-500 text-sm mb-4">
            Locked progression: {pageBuilder.tiers["1"].name} → {pageBuilder.tiers["2"].name} → {pageBuilder.tiers["3"].name}. Pass each tier at its configured threshold. {pageBuilder.tiers["3"].name} uses hard-weighted troubleshooting, log-analysis, and command-line scenarios with a fixed 45-second clock. Score 90%+ for a Winner's Circle badge and 95%+ to unlock 10 bonus questions.
          </p>
          {isAdmin && (
            <div className="mb-4 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-xs text-red-300">
              Owner testing enabled: all tiers and retests are available without learner locks or trial limits.
            </div>
          )}
          <div className="grid grid-cols-3 gap-2">
            {([1, 2, 3] as ExamTier[]).map((tier) => {
              const unlocked = examUnlocked[tier];
              const canStartTier = isAdmin || unlocked;
              const score = examTierScores[tier];
              const completed = score > 0;
              const tierSettings = pageBuilder.tiers[String(tier) as "1" | "2" | "3"];
              const passed = score >= tierSettings.passingScore;
              return (
                <div
                  key={tier}
                  style={{ borderColor: tierSettings.color }}
                  className={`rounded-xl border p-3 text-center ${
                    canStartTier
                      ? completed
                        ? passed
                          ? "bg-emerald-500/10 border-emerald-500/30"
                          : "bg-red-500/10 border-red-500/30"
                        : "bg-gray-800/50 border-gray-700"
                      : "bg-gray-900/50 border-gray-800 opacity-60"
                  }`}
                >
                  <p className="text-white font-bold text-sm mb-1">
                    Tier {tier}
                    {` (${pageBuilder.tiers[String(tier) as "1" | "2" | "3"].name})`}
                  </p>
                  <p
                    className={`text-xs mb-1 ${tier === 3 ? "font-semibold" : "text-gray-500"}`}
                    style={tier === 3 ? { color: pageBuilder.tiers["3"].color } : undefined}
                  >
                    {pageBuilder.tiers[String(tier) as "1" | "2" | "3"].questionCount} questions · {pageBuilder.tiers[String(tier) as "1" | "2" | "3"].secondsPerQuestion}s each · pass {pageBuilder.tiers[String(tier) as "1" | "2" | "3"].passingScore}%
                  </p>
                  <p className="mb-2 min-h-8 text-[10px] leading-4 text-gray-500">
                    {pageBuilder.tiers[String(tier) as "1" | "2" | "3"].description}
                  </p>
                  {completed && (
                    <p className={`text-xs font-bold ${passed ? "text-emerald-400" : "text-red-400"}`}>
                      {passed ? "✓ Passed" : "✗ Retry"} — {score}%
                    </p>
                  )}
                  {canStartTier && (!completed || isAdmin) ? (
                    <button
                      onClick={() => !isAdmin && remainingTrials === 0 ? onPricing() : onStartExamTier(tier)}
                      disabled={!isAdmin && remainingTrials === 0}
                      className={`w-full mt-1 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                        !isAdmin && remainingTrials === 0
                          ? "bg-gray-800 text-gray-500 cursor-not-allowed"
                          : "bg-red-600 hover:bg-red-500 text-white"
                      }`}
                    >
                      {!isAdmin && remainingTrials === 0 ? "Locked" : isAdmin ? "Test tier" : "Start"}
                    </button>
                  ) : !canStartTier ? (
                    <p className="text-gray-600 text-xs flex items-center justify-center gap-1">
                      <Lock size={10} /> Locked
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>

        {/* Quiz History (signed-in only) */}
        {isSignedIn && (
          historyLoading ? (
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 mb-4 animate-pulse">
              <div className="h-4 bg-gray-800 rounded w-1/3 mb-3" />
              <div className="h-10 bg-gray-800 rounded" />
            </div>
          ) : quizHistory.length > 0 ? (
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 mb-4">
              <p className="text-gray-400 text-sm font-medium uppercase tracking-widest mb-3">
                Your Quiz History
              </p>
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {quizHistory.map((h) => (
                  <div
                    key={h.id}
                    className="flex items-center justify-between bg-gray-800/50 rounded-lg px-3 py-2"
                  >
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                        h.scaledScore >= 750
                          ? "bg-emerald-500/10 text-emerald-400"
                          : "bg-red-500/10 text-red-400"
                      }`}>
                        {h.scaledScore >= 750 ? "PASS" : "FAIL"}
                      </span>
                      <span className="text-gray-300 text-sm">{h.category}</span>
                      <span className="text-gray-500 text-xs">{formatDate(h.completedAt)}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-white text-sm font-semibold">{h.scaledScore}</span>
                      <span className="text-gray-500 text-xs ml-1">({h.correctCount}/{h.totalQuestions})</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 mb-4 text-center">
              <p className="text-gray-400 text-sm">No quiz history yet. Take your first quiz to start tracking progress!</p>
            </div>
          )
        )}

        {!isSignedIn && (
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 mb-4 text-center">
            <p className="text-gray-400 text-sm">
              <button onClick={() => setLocation("/sign-in")} className="text-red-400 hover:text-red-300 font-semibold underline">Sign in</button>
              {" "}to save your quiz results and track your progress over time.
            </p>
          </div>
        )}

        {/* Mode selection */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 mb-4">
          <p className="text-gray-400 text-sm font-medium uppercase tracking-widest mb-4">
            Choose Exam
          </p>

          <div className="space-y-3">
            {/* All exams */}
            <label
              className={`flex items-start gap-4 p-4 rounded-xl border cursor-pointer transition-all duration-150 ${
                selected === "all"
                  ? "border-red-500 bg-red-500/10"
                  : "border-gray-700 hover:border-gray-600 hover:bg-gray-800/50"
              }`}
            >
              <input
                type="radio"
                name="exam"
                value="all"
                checked={selected === "all"}
                onChange={() => setSelected("all")}
                className="sr-only"
              />
              <div
                className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                  selected === "all"
                    ? "border-red-500 bg-red-500"
                    : "border-gray-600"
                }`}
              >
                {selected === "all" && (
                  <div className="w-2 h-2 rounded-full bg-white" />
                )}
              </div>
              <div>
                <p className="text-white font-semibold">All Three Exams</p>
                <p className="text-gray-400 text-sm mt-0.5">
                  {EXAM_COUNTS.all} questions covering A+, Network+, and Security+
                </p>
              </div>
            </label>

            {/* Individual exams */}
            {EXAMS.map((exam) => (
              <label
                key={exam}
                className={`flex items-start gap-4 p-4 rounded-xl border cursor-pointer transition-all duration-150 ${
                  selected === exam
                    ? "border-red-500 bg-red-500/10"
                    : "border-gray-700 hover:border-gray-600 hover:bg-gray-800/50"
                }`}
              >
                <input
                  type="radio"
                  name="exam"
                  value={exam}
                  checked={selected === exam}
                  onChange={() => setSelected(exam)}
                  className="sr-only"
                />
                <div
                  className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                    selected === exam
                      ? "border-red-500 bg-red-500"
                      : "border-gray-600"
                  }`}
                >
                  {selected === exam && (
                    <div className="w-2 h-2 rounded-full bg-white" />
                  )}
                </div>
                <div>
                  <p className="text-white font-semibold">CompTIA {exam}</p>
                  <p className="text-gray-400 text-sm mt-0.5">
                    {EXAM_DESCRIPTIONS[exam]} — {EXAM_COUNTS[exam]} questions
                  </p>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* Topic Study Mode (A+ only) */}
        {selected === "A+" && (simulationFeatures?.topicStudy ?? true) && (
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 mb-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-gray-400 text-sm font-medium uppercase tracking-widest">
                Study by Topic
              </p>
              <span className="inline-flex items-center gap-1 bg-gray-800 border border-gray-700 rounded-full px-2 py-0.5 text-gray-400 text-[10px] font-bold uppercase tracking-wider">
                🎲 Random Mode
              </span>
            </div>
            <p className="text-gray-500 text-xs mb-3">
              Focus on one of the nine A+ domains. Each topic pulls 30 mixed easy/medium/hard questions from the full Trifecta bank so it feels like a mini exam.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {randomTopics.map((topic) => {
                const meta = DOMAIN_METADATA[topic];
                const count = getTopicPoolCount(topic);
                if (count < 30) return null;
                const color = getDomainColor(topic);
                return (
                  <button
                    key={meta.id}
                    onClick={() => remainingTrials === 0 ? onPricing() : onStudyTopic(topic)}
                    className={`flex items-center gap-2.5 p-3 rounded-lg border transition-all text-left ${
                      remainingTrials === 0
                        ? "border-gray-800 bg-gray-800/30 text-gray-600 cursor-not-allowed"
                        : "border-gray-700/60 hover:border-gray-500 hover:bg-gray-800/50"
                    }`}
                  >
                    <div
                      className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: color + "20", color }}
                    >
                      {DOMAIN_ICONS[topic]}
                    </div>
                    <div className="min-w-0">
                      <p className="text-white text-sm font-medium truncate">{meta.label}</p>
                      <p className="text-gray-500 text-xs">30+ questions</p>
                    </div>
                  </button>
                );
              })}
            </div>
            <button
              onClick={() => {
                if (remainingTrials === 0) return onPricing();
                const topic = randomTopics[Math.floor(Math.random() * randomTopics.length)];
                onStudyTopic(topic);
              }}
              className={`w-full mt-3 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                remainingTrials === 0
                  ? "bg-gray-800 text-gray-500 cursor-not-allowed"
                  : "bg-gray-800 hover:bg-gray-700 text-gray-300"
              }`}
            >
              🎲 Random Topic
            </button>
          </div>
        )}

        {/* Difficulty selector */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 mb-4">
          <p className="text-gray-400 text-sm font-medium uppercase tracking-widest mb-3">
            Difficulty
          </p>
          <div className="flex rounded-xl bg-gray-800 p-1 gap-1">
            {(["easy", "medium", "hard"] as Difficulty[]).map((d) => (
              <button
                key={d}
                onClick={() => setDifficulty(d)}
                className={`flex-1 py-2.5 text-sm font-semibold rounded-lg transition-all ${
                  difficulty === d
                    ? "bg-red-600 text-white shadow-sm"
                    : "text-gray-400 hover:text-gray-200"
                }`}
              >
                <span className="flex items-center justify-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${d === "easy" ? "bg-emerald-400" : d === "medium" ? "bg-amber-400" : "bg-red-400"}`} />
                  {DIFFICULTY_LABELS[d]}
                </span>
              </button>
            ))}
          </div>
          <div className="flex gap-3 mt-2 text-center">
            <div className="flex-1">
              <p className="text-emerald-400 text-xs font-semibold">{diffBreakdown.easy} Easy</p>
            </div>
            <div className="flex-1">
              <p className="text-amber-400 text-xs font-semibold">{diffBreakdown.medium} Medium</p>
            </div>
            <div className="flex-1">
              <p className="text-red-400 text-xs font-semibold">{diffBreakdown.hard} Hard</p>
            </div>
          </div>
          <p className="text-gray-600 text-xs mt-2 text-center">
            {difficulty === "easy" ? "75 seconds per question — balanced bank, foundational concepts" :
             difficulty === "medium" ? "60 seconds per question — balanced bank, standard exam pace" :
             "45 seconds per question — balanced bank, advanced concepts"}
          </p>
        </div>

        {/* Test length toggle */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 mb-4">
          <p className="text-gray-400 text-sm font-medium uppercase tracking-widest mb-3">
            Test Length
          </p>
          <div className="flex rounded-xl bg-gray-800 p-1">
            <button
              onClick={() => setTestLength("full")}
              className={`flex-1 py-2.5 text-sm font-semibold rounded-lg transition-all ${
                testLength === "full"
                  ? "bg-red-600 text-white shadow-sm"
                  : "text-gray-400 hover:text-gray-200"
              }`}
            >
              Full — {totalQuestions} questions
            </button>
            <button
              onClick={() => setTestLength("fast")}
              className={`flex-1 py-2.5 text-sm font-semibold rounded-lg transition-all ${
                testLength === "fast"
                  ? "bg-red-600 text-white shadow-sm"
                  : "text-gray-400 hover:text-gray-200"
              }`}
            >
              Fast — {fastCount} questions
            </button>
          </div>
          <p className="text-gray-600 text-xs mt-2 text-center">
            Fast mode gives you half the questions for a quick practice session
          </p>
        </div>

        <button
          onClick={() => remainingTrials === 0 ? onPricing() : onStart(selected, testLength, difficulty)}
          disabled={remainingTrials === 0}
          className={`w-full font-semibold text-base py-3.5 rounded-xl transition-colors duration-150 shadow-lg ${
            remainingTrials === 0
              ? "bg-gray-800 text-gray-500 cursor-not-allowed shadow-none"
              : "bg-red-600 hover:bg-red-500 active:bg-red-700 text-white shadow-red-900/30"
          }`}
        >
          {remainingTrials === 0 ? "Trial limit reached — Get Practice Membership" : `Start ${difficulty !== "medium" ? DIFFICULTY_LABELS[difficulty] + " " : ""}${testLength === "fast" ? "Fast" : "Full"} Quiz`}
        </button>

        {weakCount > 0 && (
          <button
            onClick={() => remainingTrials === 0 ? onPricing() : onStudyWeak(selected)}
            disabled={remainingTrials === 0}
            className={`w-full mt-3 py-3 rounded-xl border font-semibold text-sm transition-colors ${
              remainingTrials === 0
                ? "border-gray-700 bg-gray-800/50 text-gray-600 cursor-not-allowed"
                : "border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20"
            }`}
          >
            Study {weakCount} Weak Question{weakCount > 1 ? "s" : ""}
          </button>
        )}

        {/* Progress button */}
        <button
          onClick={onProgress}
          className="w-full mt-3 py-3 rounded-xl border border-blue-500/40 bg-blue-500/10 text-blue-300 hover:bg-blue-500/20 font-semibold text-sm transition-colors flex items-center justify-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
          </svg>
          View Progress & Analytics
        </button>

        {!isPro && (
          <button
            onClick={onPricing}
            className="w-full mt-4 py-3 rounded-xl border border-red-500/40 bg-gradient-to-r from-red-600/20 to-red-500/10 text-red-300 hover:from-red-600/30 hover:to-red-500/20 font-semibold text-sm transition-all flex items-center justify-center gap-2"
          >
            <Sparkles size={16} />
            Get Practice Membership — unlimited practice, all tiers & more
          </button>
        )}

        <div className="flex items-center justify-center gap-3 mt-4 mb-8">
          <p className="text-gray-600 text-xs">
            Click any answer for instant feedback — auto-advances after 1.8s
          </p>
          {isPro ? (
            <span className="inline-flex items-center gap-1 bg-red-500/10 border border-red-500/20 rounded-full px-2 py-0.5 text-red-400/70 text-[10px] font-bold uppercase tracking-wider">
              <Sparkles size={10} />
              Member
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 bg-sky-500/10 border border-sky-500/20 rounded-full px-2 py-0.5 text-sky-400/70 text-[10px] font-bold uppercase tracking-wider">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
              Basic Plan
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   SIMULATION MODE CARD
   ═══════════════════════════════════════════════════════════ */

import {
  getSimulationStatus,
  hasFreeSimulationRemaining,
  SIMULATION_CONFIGS,
  type SimulationConfig,
} from "@/lib/bank-meta";

function SimulationCard({
  selected,
  isAdmin,
  testAttempts,
  onStartSimulation,
  onPricing,
  isAdminSimulation,
  simulationRunsRemaining,
}: {
  selected: "all" | ExamCategory;
  isAdmin: boolean;
  testAttempts?: Record<string, { remaining: number; expiresAt: string | null }>;
  onStartSimulation?: (cat: ExamCategory, diff: Difficulty | "mixed") => void;
  onPricing: () => void;
  isAdminSimulation: boolean;
  simulationRunsRemaining?: number | null;
}) {
  const [simDiff, setSimDiff] = useState<Difficulty | "mixed">("mixed");

  if (selected === "all") return null;

  const config = SIMULATION_CONFIGS[
    selected === "A+" ? "a_plus" : selected === "Network+" ? "network_plus" : "security_plus"
  ];

  const attemptsLeft = testAttempts?.[selected]?.remaining ?? 0;
  const status = isAdminSimulation
    ? { canStart: simulationRunsRemaining !== 0 }
    : getSimulationStatus(selected, isAdmin, testAttempts);
  const hasFree = isAdminSimulation
    ? simulationRunsRemaining !== 0
    : hasFreeSimulationRemaining(selected);
  const isLocked = !status.canStart;
  // Full-bank sims (90 questions) are for admins and paid attempts;
  // the free taste serves the easy+medium half-sim.
  const canStartFullSim = isAdmin || attemptsLeft > 0;

  return (
    <div className="bg-gradient-to-br from-gray-900/90 to-gray-900/60 border border-red-500/30 rounded-2xl p-5 mb-6 relative overflow-hidden">
      {/* Glow accent */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-red-500/5 rounded-full blur-3xl" />

      <div className="relative z-10">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-8 h-8 rounded-lg bg-red-500/15 flex items-center justify-center">
            <Timer size={18} className="text-red-400" />
          </div>
          <div>
            <p className="text-white font-semibold text-sm">Simulation Mode</p>
            <p className="text-gray-500 text-xs">
              {isAdminSimulation || canStartFullSim
                ? config.description
                : config.freeDescription}
            </p>
          </div>
          {isAdminSimulation && (
            <span className="ml-auto inline-flex items-center gap-1 rounded-full border border-violet-400/30 bg-violet-400/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-violet-200">
              Test profile{simulationRunsRemaining === null || simulationRunsRemaining === undefined ? "" : ` · ${simulationRunsRemaining} left`}
            </span>
          )}
          {!isAdminSimulation && attemptsLeft > 0 && (
            <span className="ml-auto inline-flex items-center gap-1 bg-amber-500/10 border border-amber-500/30 rounded-full px-2 py-0.5 text-amber-400 text-[10px] font-bold uppercase tracking-wider">
              <Timer size={10} />
              {attemptsLeft} attempt{attemptsLeft > 1 ? "s" : ""} left
            </span>
          )}
          {!isAdminSimulation && attemptsLeft === 0 && hasFree && (
            <span className="ml-auto inline-flex items-center gap-1 bg-emerald-500/10 border border-emerald-500/30 rounded-full px-2 py-0.5 text-emerald-400 text-[10px] font-bold uppercase tracking-wider">
              <Zap size={10} />
              1 Free
            </span>
          )}
          {!isAdminSimulation && attemptsLeft === 0 && !hasFree && (
            <span className="ml-auto inline-flex items-center gap-1 bg-red-500/10 border border-red-500/30 rounded-full px-2 py-0.5 text-red-400 text-[10px] font-bold uppercase tracking-wider">
              <Lock size={10} />
              Full Test
            </span>
          )}
        </div>

        {/* Difficulty selector for simulation */}
        <div className="flex rounded-lg bg-gray-800/80 p-1 gap-1 mb-3">
          {(["mixed", "easy", "medium", "hard"] as const).map((d) => {
            const isHardLocked = d === "hard" && !isAdmin && attemptsLeft === 0 && !hasFree;
            return (
              <button
                key={d}
                onClick={() => !isHardLocked && setSimDiff(d)}
                disabled={isHardLocked}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all ${
                  simDiff === d
                    ? "bg-red-600 text-white"
                    : isHardLocked
                    ? "text-gray-600 cursor-not-allowed"
                    : "text-gray-400 hover:text-gray-200"
                }`}
              >
                <span className="flex items-center justify-center gap-1">
                  {d === "mixed" ? (
                    <Zap size={10} />
                  ) : d === "easy" ? (
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  ) : d === "medium" ? (
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                  ) : (
                    <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                  )}
                  {d === "mixed" ? "Mixed" : d.charAt(0).toUpperCase() + d.slice(1)}
                  {isHardLocked && <Lock size={10} className="ml-0.5" />}
                </span>
              </button>
            );
          })}
        </div>

        <button
          onClick={() => {
            if (isLocked) {
              if (!isAdminSimulation) onPricing();
              return;
            }
            onStartSimulation?.(selected, simDiff);
          }}
          className={`w-full py-2.5 rounded-xl font-semibold text-sm transition-all ${
            isLocked
              ? "bg-gray-800 text-gray-500 cursor-not-allowed"
              : "bg-gradient-to-r from-red-600 to-red-500 hover:from-red-500 hover:to-red-400 text-white shadow-lg shadow-red-900/30"
          }`}
        >
          {isLocked ? (
            <span className="flex items-center justify-center gap-2">
              <Lock size={14} />
              {isAdminSimulation ? "Test session limit reached" : "Get a Full Test — one attempt"}
            </span>
          ) : (
            <span className="flex items-center justify-center gap-2">
              <Timer size={14} />
              Start {selected} Simulation
              {attemptsLeft === 0 && hasFree && (
                <span className="text-[10px] bg-white/20 px-1.5 py-0.5 rounded">FREE</span>
              )}
            </span>
          )}
        </button>
      </div>
    </div>
  );
}

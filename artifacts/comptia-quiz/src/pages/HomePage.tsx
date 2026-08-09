import { useState, useEffect, useMemo } from "react";
import { Show, useUser, useClerk } from "@clerk/react";
import { useLocation } from "wouter";
import { QuizResult } from "@workspace/api-client-react";
import { Sparkles, BookOpen, Monitor, Wifi, HardDrive, Cloud, Wrench, Shield, Bug, ClipboardList, Trophy, Flame, Star, Timer, Lock, Zap } from "lucide-react";
import { ExamCategory, EXAMS, EXAM_DESCRIPTIONS, EXAM_COUNTS } from "@/data/questions";
import { ALL_DOMAINS, DomainTopic, getDomainColor, DOMAIN_METADATA } from "@/data/topics";
import { getTopicPoolCount, getTopicsInRandomOrder } from "@/data/topic-pool";
import { computeGamification, GamificationState } from "@/lib/gamification";
import { ExamTier } from "@/data/exam-bank";

import {
  Difficulty,
  DIFFICULTY_LABELS,
  DIFFICULTY_COLORS,
  getDifficultyBreakdown,
  getDifficultyCount,
} from "@/data/questions";

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
  isSignedIn: boolean;
  remainingTrials: number;
  trialStatusMessage: string | null;
}

function getWeakCount(): number {
  try {
    const stored = JSON.parse(localStorage.getItem("comptia_weak_areas") || "[]");
    return stored.length;
  } catch { return 0; }
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

export default function HomePage({ onStart, onStartSimulation, onStudyWeak, onStudyTopic, onStartExamTier, examUnlocked, examTierScores, onPricing, onProgress, quizHistory, historyLoading, isPro, isSignedIn, remainingTrials, trialStatusMessage }: HomePageProps) {
  const [selected, setSelected] = useState<"all" | ExamCategory>("all");
  const [testLength, setTestLength] = useState<TestLength>("full");
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [weakCount, setWeakCount] = useState(0);
  const [, setLocation] = useLocation();
  const { user, isLoaded } = useUser();
  const { signOut } = useClerk();

  const gamification = useMemo(() => computeGamification(quizHistory), [quizHistory]);
  const randomTopics = useMemo(() => getTopicsInRandomOrder(), []);

  useEffect(() => {
    setWeakCount(getWeakCount());
  }, []);

  const selectedCount =
    selected === "all"
      ? getDifficultyCount(difficulty)
      : getDifficultyBreakdown(selected)[difficulty];
  const totalQuestions = selectedCount;
  const fastCount = Math.ceil(selectedCount / 2);
  const diffBreakdown = getDifficultyBreakdown(selected === "all" ? undefined : selected);

  return (
    <div className="min-h-screen flex flex-col items-center p-4">
      <div className="w-full max-w-lg">
        {/* Auth bar */}
        <div className="flex items-center justify-end gap-3 mb-4 mt-2">
          <Show when="signed-in">
            {isLoaded && user && (
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  {user.imageUrl ? (
                    <img src={user.imageUrl} alt="" className="w-7 h-7 rounded-full" />
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-red-600 flex items-center justify-center text-white text-xs font-bold">
                      {user.firstName?.[0] || user.emailAddresses[0]?.emailAddress?.[0]?.toUpperCase() || "U"}
                    </div>
                  )}
                  <span className="text-gray-300 text-sm font-medium">
                    {user.firstName || user.emailAddresses[0]?.emailAddress || "User"}
                  </span>
                </div>
                <button
                  onClick={() => signOut({ redirectUrl: "/" })}
                  className="text-gray-500 hover:text-gray-300 text-xs font-medium transition-colors"
                >
                  Sign out
                </button>
              </div>
            )}
          </Show>
          <Show when="signed-out">
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
          </Show>
        </div>

        {/* Disclaimer */}
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 mb-6 text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <svg className="w-4 h-4 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
            <span className="text-amber-400 text-xs font-bold uppercase tracking-wider">Practice Disclaimer</span>
          </div>
          <p className="text-gray-300 text-sm leading-relaxed">
            This is a <span className="text-amber-300 font-semibold">practice tool</span> for CompTIA exam prep.
            The 100–900 scoring scale and 750 passing score are simulations based on CompTIA's real scoring model, but your actual exam results may differ.
            Questions are curated from the full 270-question bank and are timed at <span className="text-amber-300 font-semibold">60 seconds per question</span> to mimic exam pressure.
          </p>
        </div>

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
                Upgrade to Pro
              </button>
            )}
          </div>
        )}

        {/* Header */}
        <div className="text-center mb-10">
          <div className="flex items-center justify-center gap-3 mb-6 flex-wrap">
            <div className="inline-flex items-center gap-2 bg-red-600/10 border border-red-600/30 rounded-full px-4 py-1.5 text-red-400 text-sm font-medium">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              CompTIA Certification Prep
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
          <SimulationCard
            selected={selected}
            isPro={isPro}
            onStartSimulation={onStartSimulation}
            onPricing={onPricing}
          />
          <h1 className="text-4xl font-bold text-white tracking-tight mb-2">
            Trifecta Quiz
          </h1>
          <p className="text-gray-400 text-base">
            A+, Network+, and Security+ practice questions
          </p>
          <p className="text-sky-300/80 text-sm mt-1.5 italic">
            Build confidence by mastering what you know with certainty
          </p>

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
              810 Questions
            </span>
          </div>
          <p className="text-gray-500 text-sm mb-4">
            Locked progression: 270 questions per tier (Mild → Medium → HellMode). Pass each tier to unlock the next. Score 90%+ for a Winner's Circle badge and 95%+ to unlock 10 bonus questions.
          </p>
          <div className="grid grid-cols-3 gap-2">
            {([1, 2, 3] as ExamTier[]).map((tier) => {
              const unlocked = examUnlocked[tier];
              const score = examTierScores[tier];
              const completed = score > 0;
              const passed = score >= 80;
              return (
                <div
                  key={tier}
                  className={`rounded-xl border p-3 text-center ${
                    unlocked
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
                    {tier === 1 && " (Mild)"}
                    {tier === 2 && " (Medium)"}
                    {tier === 3 && " (HellMode)"}
                  </p>
                  <p className="text-gray-500 text-xs mb-2">270 questions</p>
                  {completed ? (
                    <p className={`text-xs font-bold ${passed ? "text-emerald-400" : "text-red-400"}`}>
                      {passed ? "✓ Passed" : "✗ Retry"} — {score}%
                    </p>
                  ) : unlocked ? (
                    <button
                      onClick={() => remainingTrials === 0 ? onPricing() : onStartExamTier(tier)}
                      disabled={remainingTrials === 0}
                      className={`w-full mt-1 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                        remainingTrials === 0
                          ? "bg-gray-800 text-gray-500 cursor-not-allowed"
                          : "bg-red-600 hover:bg-red-500 text-white"
                      }`}
                    >
                      {remainingTrials === 0 ? "Locked" : "Start"}
                    </button>
                  ) : (
                    <p className="text-gray-600 text-xs flex items-center justify-center gap-1">
                      <Lock size={10} /> Locked
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Quiz History (signed-in only) */}
        <Show when="signed-in">
          {historyLoading ? (
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
          )}
        </Show>

        <Show when="signed-out">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 mb-4 text-center">
            <p className="text-gray-400 text-sm">
              <button onClick={() => setLocation("/sign-in")} className="text-red-400 hover:text-red-300 font-semibold underline">Sign in</button>
              {" "}to save your quiz results and track your progress over time.
            </p>
          </div>
        </Show>

        {/* Testimonials */}
        <div className="mb-8">
          <p className="text-gray-500 text-sm font-medium uppercase tracking-widest mb-4 text-center">
            What Ontario IT Pros Say
          </p>
          <div className="flex gap-4 overflow-x-auto pb-2 snap-x snap-mandatory scrollbar-hide">
            {[
              {
                name: "Sarah K.",
                location: "Toronto, ON",
                role: "IT Support Specialist",
                text: "Passed my A+ on the first try after using this for 3 weeks. The topic breakdown showed me I was weak on networking — studied that domain hard and nailed it.",
                exam: "A+",
                score: 785,
              },
              {
                name: "Marcus T.",
                location: "Ottawa, ON",
                role: "Junior Sysadmin",
                text: "The gamification kept me coming back daily. Hit a 7-day streak and the badges made studying feel like a game instead of a chore. Network+ certified now!",
                exam: "Network+",
                score: 812,
              },
              {
                name: "Priya R.",
                location: "Mississauga, ON",
                role: "Cybersecurity Analyst",
                text: "Topic mode is a game-changer. I drilled the Security domain every night for two weeks. The per-topic analytics told me exactly when I was ready for the real exam.",
                exam: "Security+",
                score: 798,
              },
              {
                name: "James L.",
                location: "Hamilton, ON",
                role: "Desktop Technician",
                text: "As someone who gets test anxiety, the timed simulations here built my confidence. 90 questions, 90 minutes — when I sat for the real A+ it felt like just another practice run.",
                exam: "A+",
                score: 756,
              },
              {
                name: "Amanda C.",
                location: "London, ON",
                role: "NOC Technician",
                text: "Got the Pro tier and it was worth every penny. Unlimited retakes on weak areas helped me turn my 60% networking score into 88% in two weeks. Just passed Network+.",
                exam: "Network+",
                score: 805,
              },
              {
                name: "David O.",
                location: "Kitchener, ON",
                role: "Field Service Tech",
                text: "The flagging system during quizzes is brilliant. I flagged every unsure question, reviewed them after, and never missed the same concept twice. A+ certified!",
                exam: "A+",
                score: 778,
              },
              {
                name: "Fatima S.",
                location: "Brampton, ON",
                role: "Help Desk Lead",
                text: "Tried three other CompTIA apps before this one. Nothing else tracks per-domain mastery like this. The 'Road to Certification' bar kept me motivated through Core 2.",
                exam: "A+",
                score: 790,
              },
              {
                name: "Ryan B.",
                location: "Windsor, ON",
                role: "IT Consultant",
                text: "Completed all three certs in 8 months. The adaptive recommendations knew exactly when to push me to harder questions. This app doesn't just quiz you — it coaches you.",
                exam: "Security+",
                score: 845,
              },
              {
                name: "Jessica M.",
                location: "Markham, ON",
                role: "Junior Network Engineer",
                text: "The dark theme with red accents might seem like a small thing, but studying at 11 PM with an easy-on-the-eyes UI actually made a difference. Passed Network+ with an 802.",
                exam: "Network+",
                score: 802,
              },
              {
                name: "Tyler N.",
                location: "Barrie, ON",
                role: "SOC Analyst",
                text: "Going for the trifecta and this was the only app that properly covers all three exams with the same depth. The weak area tracking is scary accurate — it knew my blind spots before I did.",
                exam: "Security+",
                score: 821,
              },
            ].map((t, i) => (
              <div
                key={i}
                className="min-w-[280px] max-w-[280px] bg-gray-900 border border-gray-800 rounded-2xl p-5 snap-start flex-shrink-0"
              >
                <div className="flex items-center gap-0.5 mb-3">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <Star key={s} size={12} className="text-amber-400 fill-amber-400" />
                  ))}
                </div>
                <p className="text-gray-300 text-sm leading-relaxed mb-4">
                  “{t.text}”
                </p>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-red-600/20 flex items-center justify-center text-red-400 text-sm font-bold">
                    {t.name.split(" ")[0][0]}
                  </div>
                  <div>
                    <p className="text-white text-sm font-medium">{t.name}</p>
                    <p className="text-gray-500 text-xs">{t.role} • {t.location}</p>
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <span className="text-emerald-400 text-[10px] font-bold uppercase tracking-wider bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                    {t.exam} Pass
                  </span>
                  <span className="text-gray-500 text-[10px]">{t.score} score</span>
                </div>
              </div>
            ))}
          </div>
        </div>

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
        {selected === "A+" && (
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
          {remainingTrials === 0 ? "Trial limit reached — Upgrade to Pro" : `Start ${difficulty !== "medium" ? DIFFICULTY_LABELS[difficulty] + " " : ""}${testLength === "fast" ? "Fast" : "Full"} Quiz`}
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
            Upgrade to Pro — unlimited quizzes, analytics & more
          </button>
        )}

        <div className="flex items-center justify-center gap-3 mt-4 mb-8">
          <p className="text-gray-600 text-xs">
            Click any answer for instant feedback — auto-advances after 1.8s
          </p>
          {isPro ? (
            <span className="inline-flex items-center gap-1 bg-red-500/10 border border-red-500/20 rounded-full px-2 py-0.5 text-red-400/70 text-[10px] font-bold uppercase tracking-wider">
              <Sparkles size={10} />
              Pro
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
} from "@/data/simulation";

function SimulationCard({
  selected,
  isPro,
  onStartSimulation,
  onPricing,
}: {
  selected: "all" | ExamCategory;
  isPro: boolean;
  onStartSimulation?: (cat: ExamCategory, diff: Difficulty | "mixed") => void;
  onPricing: () => void;
}) {
  const [simDiff, setSimDiff] = useState<Difficulty | "mixed">("mixed");

  if (selected === "all") return null;

  const config = SIMULATION_CONFIGS[
    selected === "A+" ? "a_plus" : selected === "Network+" ? "network_plus" : "security_plus"
  ];

  const status = getSimulationStatus(selected, isPro);
  const hasFree = hasFreeSimulationRemaining(selected);
  const isLocked = !status.canStart;

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
            <p className="text-gray-500 text-xs">{config.description}</p>
          </div>
          {!isPro && hasFree && (
            <span className="ml-auto inline-flex items-center gap-1 bg-emerald-500/10 border border-emerald-500/30 rounded-full px-2 py-0.5 text-emerald-400 text-[10px] font-bold uppercase tracking-wider">
              <Zap size={10} />
              1 Free
            </span>
          )}
          {!isPro && !hasFree && (
            <span className="ml-auto inline-flex items-center gap-1 bg-red-500/10 border border-red-500/30 rounded-full px-2 py-0.5 text-red-400 text-[10px] font-bold uppercase tracking-wider">
              <Lock size={10} />
              Pro Only
            </span>
          )}
        </div>

        {/* Difficulty selector for simulation */}
        <div className="flex rounded-lg bg-gray-800/80 p-1 gap-1 mb-3">
          {(["mixed", "easy", "medium", "hard"] as const).map((d) => {
            const isHardLocked = d === "hard" && !isPro && !hasFree;
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
              onPricing();
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
              Upgrade to Pro for Simulations
            </span>
          ) : (
            <span className="flex items-center justify-center gap-2">
              <Timer size={14} />
              Start {selected} Simulation
              {!isPro && hasFree && (
                <span className="text-[10px] bg-white/20 px-1.5 py-0.5 rounded">FREE</span>
              )}
            </span>
          )}
        </button>
      </div>
    </div>
  );
}

import { useEffect, useRef } from "react";
import { Question, ExamCategory, Difficulty, comptiaScaledScore, isCompTiaPass, COMPTIA_PASS_SCORE, weightedScore, DIFFICULTY_LABELS } from "@/data/questions";
import { DOMAIN_METADATA, getDomainColor } from "@/data/topics";
import { ExamTier } from "@/data/exam-bank";
import { playBadgeSound, playBonusUnlockSound } from "@/lib/sound-effects";

interface ResultsPageProps {
  questions: Question[];
  answers: (number | null)[];
  mode: string;
  difficulty: Difficulty;
  isWeakMode?: boolean;
  isExamMode?: boolean;
  isBonusMode?: boolean;
  examTier?: ExamTier | null;
  examUnlocked?: Record<ExamTier, boolean>;
  examTierScores?: Record<ExamTier, number>;
  examFinalPct?: number;
  questionTimes: number[];
  completionTimestamp: string;
  onRetry: () => void;
  onHome: () => void;
  onProgress?: () => void;
  onNextExamTier?: (tier: ExamTier) => void;
  onStartBonus?: () => void;
  canStartBonus?: boolean;
}

const CATEGORY_COLOR: Record<string, { badge: string; bar: string }> = {
  "A+": { badge: "text-blue-400 bg-blue-500/10 border-blue-500/30", bar: "bg-blue-500" },
  "Network+": { badge: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30", bar: "bg-emerald-500" },
  "Security+": { badge: "text-purple-400 bg-purple-500/10 border-purple-500/30", bar: "bg-purple-500" },
};

function gradeLabel(pct: number): { label: string; color: string } {
  if (pct >= 90) return { label: "Excellent", color: "text-emerald-400" };
  if (pct >= 80) return { label: "Great", color: "text-blue-400" };
  if (pct >= 70) return { label: "Pass", color: "text-amber-400" };
  if (pct >= 60) return { label: "Almost", color: "text-orange-400" };
  return { label: "Keep Studying", color: "text-red-400" };
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export default function ResultsPage({
  questions,
  answers,
  mode,
  difficulty,
  isWeakMode,
  isExamMode,
  isBonusMode,
  examTier,
  examUnlocked,
  examTierScores,
  examFinalPct,
  questionTimes,
  completionTimestamp,
  onRetry,
  onHome,
  onProgress,
  onNextExamTier,
  onStartBonus,
  canStartBonus = true,
}: ResultsPageProps) {
  const totalCorrect = questions.filter((q, i) => answers[i] === q.correctIndex).length;
  const rawPct = Math.round((totalCorrect / questions.length) * 100);
  const wPct = weightedScore(questions, answers);
  const scaled = comptiaScaledScore(wPct);
  const passed = isCompTiaPass(scaled);
  const grade = gradeLabel(rawPct);

  const isFinalTier = isExamMode && examTier === 3;
  const isLastTier = isExamMode && examTier === 3;
  const nextTier = examTier && examTier < 3 ? ((examTier + 1) as ExamTier) : null;
  const tierPassed = isExamMode ? rawPct >= 80 : null;
  const showBadge = isFinalTier && (examFinalPct ?? 0) >= 90;
  const showBonus = isFinalTier && (examFinalPct ?? 0) >= 95;
  const bonusAvailable = isFinalTier && showBonus && !isBonusMode && canStartBonus;

  // Play unlock sounds once
  const badgePlayed = useRef(false);
  const bonusPlayed = useRef(false);
  useEffect(() => {
    if (showBadge && !badgePlayed.current) {
      playBadgeSound();
      badgePlayed.current = true;
    }
    if (showBonus && !bonusPlayed.current) {
      playBonusUnlockSound();
      bonusPlayed.current = true;
    }
  }, [showBadge, showBonus]);

  const totalTime = questionTimes.reduce((a, b) => a + b, 0);
  const avgTime = Math.round(totalTime / questions.length);

  const categories = [...new Set(questions.map((q) => q.category))] as ExamCategory[];

  const catStats = categories.map((cat) => {
    const catQs = questions.filter((q) => q.category === cat);
    const correct = catQs.filter((q) => {
      const idx = questions.indexOf(q);
      return answers[idx] === q.correctIndex;
    }).length;
    return { cat, correct, total: catQs.length, pct: Math.round((correct / catQs.length) * 100) };
  });

  // Topic breakdown for A+ questions with topics
  const topicQuestions = questions.filter((q) => q.topic);
  const topicGroups = topicQuestions.length > 0
    ? [...new Set(topicQuestions.map((q) => q.topic!))].map((topic) => {
        const tqs = questions.filter((q) => q.topic === topic);
        const correct = tqs.filter((q) => {
          const idx = questions.indexOf(q);
          return answers[idx] === q.correctIndex;
        }).length;
        return { topic, correct, total: tqs.length, pct: Math.round((correct / tqs.length) * 100) };
      })
    : [];

  const scoreCircumference = 2 * Math.PI * 52;
  const scoreDash = (rawPct / 100) * scoreCircumference;

  return (
    <div className="min-h-screen py-8 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Score card */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 mb-6 text-center">
          <p className="text-gray-500 text-sm font-medium uppercase tracking-widest mb-2">
            CompTIA Scaled Score
          </p>

          {/* Circular progress */}
          <div className="relative inline-flex items-center justify-center mb-4">
            <svg width="128" height="128" className="rotate-[-90deg]">
              <circle cx="64" cy="64" r="52" fill="none" stroke="#1f2937" strokeWidth="10" />
              <circle
                cx="64"
                cy="64"
                r="52"
                fill="none"
                stroke={passed ? "#22c55e" : rawPct >= 60 ? "#f59e0b" : "#ef4444"}
                strokeWidth="10"
                strokeLinecap="round"
                strokeDasharray={`${scoreDash} ${scoreCircumference}`}
                className="transition-all duration-700"
              />
            </svg>
            <div className="absolute text-center">
              <p className="text-3xl font-black text-white">{scaled}</p>
              <p className={`text-xs font-semibold ${passed ? "text-emerald-400" : "text-red-400"}`}>
                {passed ? "PASS" : "FAIL"}
              </p>
            </div>
          </div>

          <p className={`text-2xl font-bold mb-1 ${grade.color}`}>{grade.label}</p>
          <p className="text-gray-400 text-base">
            {totalCorrect} / {questions.length} correct ({rawPct}%)
          </p>
          <p className="text-gray-500 text-sm mt-1">
            CompTIA passing score: {COMPTIA_PASS_SCORE}
          </p>

          {/* Timing row */}
          <div className="flex items-center justify-center gap-4 mt-4 pt-4 border-t border-gray-800 text-sm">
            <div>
              <p className="text-gray-500 text-xs uppercase tracking-wider">Total Time</p>
              <p className="text-white font-semibold">{Math.floor(totalTime / 60)}m {totalTime % 60}s</p>
            </div>
            <div className="w-px h-8 bg-gray-700" />
            <div>
              <p className="text-gray-500 text-xs uppercase tracking-wider">Avg / Question</p>
              <p className="text-white font-semibold">{avgTime}s</p>
            </div>
          </div>

          {/* Exam tier progress summary */}
          {isExamMode && examTierScores && (
            <div className="mt-4 pt-4 border-t border-gray-800">
              <p className="text-gray-500 text-xs uppercase tracking-wider mb-2">Tier Progress</p>
              <div className="flex items-center justify-center gap-2">
                {[1, 2, 3].map((t) => (
                  <span
                    key={t}
                    className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold border ${
                      examTierScores[t as ExamTier] >= 80
                        ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                        : examTierScores[t as ExamTier] > 0
                        ? "bg-red-500/10 text-red-400 border-red-500/30"
                        : examUnlocked?.[t as ExamTier]
                        ? "bg-gray-800 text-gray-400 border-gray-700"
                        : "bg-gray-900/50 text-gray-600 border-gray-800 opacity-60"
                    }`}
                  >
                    {examTierScores[t as ExamTier] >= 80 ? "✓" : examTierScores[t as ExamTier] > 0 ? "✗" : examUnlocked?.[t as ExamTier] ? "○" : "🔒"}
                    Tier {t} {examTierScores[t as ExamTier] > 0 ? `— ${examTierScores[t as ExamTier]}%` : ""}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Winner's circle badge for final exam score >= 90% */}
          {showBadge && (
            <div className="mt-5 pt-4 border-t border-amber-500/30">
              <div className="inline-flex items-center gap-2 bg-amber-500/10 border border-amber-500/40 rounded-full px-4 py-2 text-amber-300 font-bold text-sm">
                <span className="text-lg">🏆</span>
                Winner's Circle Badge — {examFinalPct}% Mastery
              </div>
              <p className="text-gray-400 text-xs mt-2">You scored 90% or higher across all three tiers. Outstanding work!</p>
            </div>
          )}

          {bonusAvailable && (
            <div className="mt-3 pt-3 border-t border-sky-500/30">
              <div className="inline-flex items-center gap-2 bg-sky-500/10 border border-sky-500/40 rounded-full px-4 py-2 text-sky-300 font-bold text-sm">
                <span className="text-lg">🎁</span>
                Bonus Round Unlocked — 95%+ Mastery
              </div>
            </div>
          )}

          {completionTimestamp && (
            <p className="text-gray-600 text-xs mt-2">
              Completed: {completionTimestamp}
            </p>
          )}

          <div className="flex items-center justify-center gap-2 mt-3 flex-wrap">
            <span className="inline-flex items-center gap-1 bg-emerald-500/10 border border-emerald-500/30 rounded-full px-2 py-0.5 text-emerald-400 text-[10px] font-bold uppercase tracking-wider">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
              100% Free
            </span>
          </div>
        </div>

        {/* Category breakdown */}
        {catStats.length > 1 && (
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 mb-6">
            <p className="text-gray-400 text-sm font-medium uppercase tracking-widest mb-4">
              Breakdown by Exam
            </p>
            <div className="space-y-4">
              {catStats.map(({ cat, correct, total, pct: cPct }) => (
                <div key={cat}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span
                      className={`text-xs font-semibold uppercase tracking-wider px-2.5 py-0.5 rounded-full border ${CATEGORY_COLOR[cat].badge}`}
                    >
                      CompTIA {cat}
                    </span>
                    <span className="text-gray-400 text-sm">
                      {correct}/{total} — {cPct}%
                    </span>
                  </div>
                  <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className={`h-2 rounded-full transition-all duration-500 ${CATEGORY_COLOR[cat].bar}`}
                      style={{ width: `${cPct}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Topic breakdown (A+ only) */}
        {topicGroups.length > 0 && (
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 mb-6">
            <p className="text-gray-400 text-sm font-medium uppercase tracking-widest mb-4">
              Breakdown by A+ Topic
            </p>
            <div className="space-y-4">
              {topicGroups.map(({ topic, correct, total, pct: tPct }) => {
                const color = getDomainColor(topic);
                const label = DOMAIN_METADATA[topic]?.label || topic;
                return (
                  <div key={topic}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span
                        className="text-xs font-semibold uppercase tracking-wider px-2.5 py-0.5 rounded-full border"
                        style={{ backgroundColor: color + "18", color, borderColor: color + "40" }}
                      >
                        {label}
                      </span>
                      <span className="text-gray-400 text-sm">
                        {correct}/{total} — {tPct}%
                      </span>
                    </div>
                    <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                      <div
                        className="h-2 rounded-full transition-all duration-500"
                        style={{ width: `${tPct}%`, backgroundColor: color }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Question review */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 mb-6">
          <p className="text-gray-400 text-sm font-medium uppercase tracking-widest mb-4">
            Answer Review
          </p>
          <div className="space-y-5">
            {questions.map((q, i) => {
              const userAnswer = answers[i];
              const isCorrect = userAnswer === q.correctIndex;
              const qTime = questionTimes[i] ?? 0;
              return (
                <div key={q.id} className={`rounded-xl p-4 border ${isCorrect ? "border-emerald-800/50 bg-emerald-900/10" : "border-red-800/50 bg-red-900/10"}`}>
                  <div className="flex items-start gap-3 mb-3">
                    <span className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold mt-0.5 ${isCorrect ? "bg-emerald-500 text-white" : "bg-red-500 text-white"}`}>
                      {isCorrect ? "✓" : "✗"}
                    </span>
                    <div className="flex-1">
                      <p className="text-gray-200 text-sm leading-snug font-medium">{q.question}</p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className={`text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border ${CATEGORY_COLOR[q.category].badge}`}>
                          {q.category}
                        </span>
                        {q.topic && (
                          <span
                            className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border"
                            style={{
                              backgroundColor: getDomainColor(q.topic) + "18",
                              color: getDomainColor(q.topic),
                              borderColor: getDomainColor(q.topic) + "40",
                            }}
                          >
                            {DOMAIN_METADATA[q.topic]?.label || q.topic}
                          </span>
                        )}
                        <span className="text-gray-600 text-xs">
                          {formatDuration(qTime)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="ml-9 space-y-1.5">
                    {!isCorrect && userAnswer !== null && (
                      <div className="flex items-center gap-2">
                        <span className="text-red-400 text-xs font-medium w-20 flex-shrink-0">Your answer:</span>
                        <span className="text-red-300 text-sm">{q.options[userAnswer]}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <span className="text-emerald-400 text-xs font-medium w-20 flex-shrink-0">Correct:</span>
                      <span className="text-emerald-300 text-sm">{q.options[q.correctIndex]}</span>
                    </div>
                    <div className="mt-2 pt-2 border-t border-gray-700/50">
                      <p className="text-gray-400 text-xs leading-relaxed">{q.explanation}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Free footer */}
        <div className="flex items-center justify-center gap-1.5 mt-4">
          <svg className="w-3 h-3 text-emerald-400/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
          <p className="text-gray-600 text-[10px] font-medium uppercase tracking-widest">
            Free to Start — Sign in to track progress
          </p>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-3 mt-4">
          {isExamMode && examTier && !isBonusMode && tierPassed && nextTier && (
            <button
              onClick={() => onNextExamTier?.(nextTier)}
              className="w-full py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold transition-colors text-sm shadow-lg shadow-emerald-900/30"
            >
              Unlock & Start Tier {nextTier} →
            </button>
          )}
          {bonusAvailable && (
            <button
              onClick={() => onStartBonus?.()}
              className="w-full py-3.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-semibold transition-colors text-sm shadow-lg shadow-sky-900/30"
            >
              🎁 Start 10 Bonus Questions
            </button>
          )}
          <div className="flex gap-3">
            <button
              onClick={onHome}
              className="flex-1 py-3.5 rounded-xl border border-gray-700 text-gray-300 hover:text-white hover:border-gray-500 font-semibold transition-colors text-sm"
            >
              Home
            </button>
            <button
              onClick={onRetry}
              className="flex-1 py-3.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-semibold transition-colors text-sm shadow-lg shadow-red-900/30"
            >
              {isExamMode && !tierPassed ? `Retry Tier ${examTier}` : "Try Again"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

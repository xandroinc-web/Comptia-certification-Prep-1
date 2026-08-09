import { useMemo } from "react";
import { QuizResult } from "@workspace/api-client-react";
import {
  ExamCategory,
  Difficulty,
  DIFFICULTY_LABELS,
  questions,
} from "@/data/questions";
import {
  analyzeProgress,
  OverallProgress,
  SubjectMastery,
  TopicMastery,
  getMasteryColor,
  getMasteryBarColor,
  getMasteryLabel,
  StudyRecommendation,
} from "@/lib/analytics";
import { TrendingUp, TrendingDown, Zap, BookOpen, Target, ArrowLeft, Award, Clock, Flame, ChevronRight, Trophy } from "lucide-react";
import { computeGamification, Badge, GamificationState } from "@/lib/gamification";

interface ProgressPageProps {
  quizHistory: QuizResult[];
  onBack: () => void;
  onStartQuiz: (category: ExamCategory | "all", difficulty: Difficulty) => void;
  isPro: boolean;
}

function MasteryBadge({ level }: { level: SubjectMastery["mastery"] }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${getMasteryColor(level)}`}>
      {getMasteryLabel(level)}
    </span>
  );
}

function StatCard({ label, value, icon, color }: { label: string; value: string; icon: React.ReactNode; color: string }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${color}`}>
        {icon}
      </div>
      <div>
        <p className="text-gray-500 text-xs uppercase tracking-wider">{label}</p>
        <p className="text-white font-bold text-lg">{value}</p>
      </div>
    </div>
  );
}

function CircularProgress({ pct, size = 80, strokeWidth = 6, color = "#dc2626" }: { pct: number; size?: number; strokeWidth?: number; color?: string }) {
  const r = (size - strokeWidth) / 2;
  const c = 2 * Math.PI * r;
  const dash = (pct / 100) * c;
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="rotate-[-90deg]">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#1f2937" strokeWidth={strokeWidth} />
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke={color} strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c}`}
          className="transition-all duration-700"
        />
      </svg>
      <div className="absolute text-center">
        <p className="text-white font-bold text-sm">{pct}%</p>
      </div>
    </div>
  );
}

function RecommendationCard({ rec, onAction }: { rec: StudyRecommendation; onAction: () => void }) {
  const priorityIcon = rec.priority === "high" ? <TrendingUp size={16} className="text-red-400" /> :
    rec.priority === "medium" ? <Zap size={16} className="text-amber-400" /> :
    <Target size={16} className="text-blue-400" />;
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-start gap-3">
      <div className="mt-0.5">{priorityIcon}</div>
      <div className="flex-1">
        <p className="text-white font-semibold text-sm">{rec.title}</p>
        <p className="text-gray-400 text-xs mt-0.5 leading-relaxed">{rec.description}</p>
        <button onClick={onAction} className="mt-2 text-red-400 text-xs font-semibold hover:text-red-300 flex items-center gap-1">
          {rec.action} <ChevronRight size={12} />
        </button>
      </div>
    </div>
  );
}

export default function ProgressPage({ quizHistory, onBack, onStartQuiz, isPro }: ProgressPageProps) {
  const data: OverallProgress = analyzeProgress(quizHistory);
  const gamification = useMemo(() => computeGamification(quizHistory), [quizHistory]);

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top bar */}
      <div className="border-b border-gray-800 bg-gray-900/80 backdrop-blur px-4 py-3 flex items-center gap-3">
        <button onClick={onBack} className="text-gray-500 hover:text-gray-300 text-sm transition-colors flex items-center gap-1.5">
          <ArrowLeft size={16} />
          Back
        </button>
        <h1 className="text-white font-semibold text-sm">Progress Dashboard</h1>
      </div>

      <div className="flex-1 p-4 pt-6 max-w-3xl mx-auto w-full">
        {quizHistory.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-16 h-16 rounded-full bg-gray-800 flex items-center justify-center mx-auto mb-4">
              <Target size={28} className="text-gray-500" />
            </div>
            <p className="text-white font-semibold text-lg mb-2">No Data Yet</p>
            <p className="text-gray-500 text-sm max-w-sm mx-auto">
              Take a few quizzes to build your progress dashboard. We'll track your strengths, weaknesses, and growth over time.
            </p>
            <button
              onClick={() => onStartQuiz("all", "medium")}
              className="mt-6 bg-red-600 hover:bg-red-500 text-white font-semibold px-6 py-2.5 rounded-xl text-sm transition-colors"
            >
              Start Your First Quiz
            </button>
          </div>
        ) : (
          <>
            {/* Stats row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              <StatCard label="Quizzes" value={String(data.totalQuizzes)} icon={<BookOpen size={18} className="text-red-400" />} color="bg-red-500/10" />
              <StatCard label="Avg Score" value={`${data.avgScore}%`} icon={<TrendingUp size={18} className="text-blue-400" />} color="bg-blue-500/10" />
              <StatCard label="Streak" value={`${data.streak} 🔥`} icon={<Flame size={18} className="text-amber-400" />} color="bg-amber-500/10" />
              <StatCard label="Study Time" value={formatTime(data.totalStudyTime)} icon={<Clock size={18} className="text-emerald-400" />} color="bg-emerald-500/10" />
            </div>

            {/* Subject mastery */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 mb-6">
              <h2 className="text-white font-semibold text-sm mb-4 flex items-center gap-2">
                <Award size={16} className="text-red-400" />
                Subject Mastery
              </h2>
              <div className="space-y-4">
                {data.categories.map((cat) => (
                  <div key={cat.category}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-white font-medium text-sm">CompTIA {cat.category}</span>
                        <MasteryBadge level={cat.mastery} />
                      </div>
                      <span className="text-gray-500 text-xs">{cat.totalAttempts} quiz{cat.totalAttempts > 1 ? "zes" : ""}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-2 bg-gray-800 rounded-full overflow-hidden">
                        <div
                          className={`h-2 rounded-full transition-all duration-500 ${getMasteryBarColor(cat.mastery)}`}
                          style={{ width: `${Math.min(cat.avgScore, 100)}%` }}
                        />
                      </div>
                      <span className="text-white font-semibold text-sm w-10 text-right">{cat.avgScore}%</span>
                    </div>
                    <div className="flex gap-3 mt-1.5">
                      <span className="text-gray-600 text-xs">Best: {cat.bestScore}%</span>
                      <span className="text-gray-600 text-xs">Pass rate: {cat.passingRate}%</span>
                      <span className="text-gray-600 text-xs">{cat.correctQuestions}/{cat.totalQuestions} correct</span>
                    </div>
                    {cat.weakTopicIds.length > 0 && (
                      <div className="mt-2 bg-gray-800/50 rounded-lg p-2">
                        <p className="text-gray-500 text-xs mb-1">Weak topics ({cat.weakTopicIds.length}):</p>
                        <div className="flex flex-wrap gap-1">
                          {cat.weakTopicIds.slice(0, 5).map((id) => {
                            const q = questions.find((q) => q.id === id);
                            return q ? (
                              <span key={id} className="text-gray-400 text-xs bg-gray-800 px-2 py-0.5 rounded truncate max-w-[200px]">
                                {q.question.substring(0, 40)}...
                              </span>
                            ) : null;
                          })}
                        </div>
                      </div>
                    )}
                    {/* Topic breakdown for A+ */}
                    {cat.topicBreakdown && cat.topicBreakdown.length > 0 && (
                      <div className="mt-4 space-y-3">
                        <p className="text-gray-500 text-xs font-medium uppercase tracking-wider mb-2">A+ Domain Breakdown</p>
                        {cat.topicBreakdown.map((topic) => (
                          <div key={topic.topic}>
                            <div className="flex items-center justify-between mb-1">
                              <div className="flex items-center gap-2">
                                <span
                                  className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border"
                                  style={{ backgroundColor: topic.color + "18", color: topic.color, borderColor: topic.color + "40" }}
                                >
                                  {topic.label}
                                </span>
                                <MasteryBadge level={topic.mastery} />
                              </div>
                              <span className="text-gray-500 text-xs">{topic.totalAttempts} quiz{topic.totalAttempts > 1 ? "zes" : ""}</span>
                            </div>
                            <div className="flex items-center gap-3">
                              <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                                <div
                                  className="h-1.5 rounded-full transition-all duration-500"
                                  style={{ width: `${Math.min(topic.avgScore, 100)}%`, backgroundColor: topic.color }}
                                />
                              </div>
                              <span className="text-gray-400 text-xs w-10 text-right">{topic.avgScore}%</span>
                            </div>
                            <div className="flex gap-3 mt-1">
                              <span className="text-gray-600 text-xs">Best: {topic.bestScore}%</span>
                              <span className="text-gray-600 text-xs">{topic.correctQuestions}/{topic.totalQuestions} correct</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Recommendations */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 mb-6">
              <h2 className="text-white font-semibold text-sm mb-4 flex items-center gap-2">
                <Zap size={16} className="text-amber-400" />
                Recommended Actions
              </h2>
              <div className="space-y-3">
                {data.recommendations.map((rec, i) => (
                  <RecommendationCard
                    key={i}
                    rec={rec}
                    onAction={() => {
                      const cat = rec.category === "all" ? "all" : rec.category;
                      let diff: Difficulty = "medium";
                      if (rec.type === "difficulty" && rec.title.includes("Hard")) diff = "hard";
                      if (rec.type === "difficulty" && rec.title.includes("Easy")) diff = "easy";
                      onStartQuiz(cat as ExamCategory, diff);
                    }}
                  />
                ))}
              </div>
            </div>

            {/* Score history mini-chart */}
            {data.progressHistory.length > 1 && (
              <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 mb-6">
                <h2 className="text-white font-semibold text-sm mb-4 flex items-center gap-2">
                  <TrendingUp size={16} className="text-blue-400" />
                  Score Trend
                </h2>
                <div className="flex items-end gap-1 h-32">
                  {data.progressHistory.map((h, i) => {
                    const h2 = Math.max(20, h.score);
                    const color = h.score >= 82 ? "bg-emerald-500" : h.score >= 70 ? "bg-amber-500" : "bg-red-500";
                    return (
                      <div key={i} className="flex-1 flex flex-col items-center gap-1">
                        <div className={`w-full rounded-t-sm ${color} transition-all`} style={{ height: `${h2}%` }} />
                        <span className="text-gray-600 text-[10px] truncate w-full text-center">{h.date}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Road to Certification */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 mb-6">
              <h2 className="text-white font-semibold text-sm mb-4 flex items-center gap-2">
                <Trophy size={16} className="text-red-400" />
                Road to Certification
              </h2>
              <div className="flex items-center gap-4 mb-3">
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-gray-400 text-xs">Exam Readiness</span>
                    <span className="text-red-400 text-sm font-bold">{gamification.roadToCertPct}%</span>
                  </div>
                  <div className="h-3 bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className="h-3 bg-gradient-to-r from-red-600 to-red-400 rounded-full transition-all duration-700"
                      style={{ width: `${gamification.roadToCertPct}%` }}
                    />
                  </div>
                </div>
                <div className="text-center">
                  <span className="text-2xl">{gamification.roadToCertPct >= 80 ? "🎓" : gamification.roadToCertPct >= 50 ? "📚" : "🌱"}</span>
                </div>
              </div>
              <div className="flex gap-3 mt-2">
                <span className="text-gray-600 text-xs">{gamification.totalQuestionsAnswered} questions answered</span>
                <span className="text-gray-600 text-xs">{gamification.streak}-day streak</span>
                <span className="text-gray-600 text-xs">{gamification.longestStreak} best streak</span>
              </div>
            </div>

            {/* Achievements */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 mb-6">
              <h2 className="text-white font-semibold text-sm mb-4 flex items-center gap-2">
                <Award size={16} className="text-amber-400" />
                Achievements
                <span className="text-gray-500 text-xs font-normal">
                  {gamification.badges.filter((b) => b.unlocked).length}/{gamification.badges.length} unlocked
                </span>
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {gamification.badges.map((badge) => (
                  <div
                    key={badge.id}
                    className={`rounded-xl p-3 border transition-all ${
                      badge.unlocked
                        ? `${badge.color}`
                        : "bg-gray-800/50 border-gray-800 text-gray-600 opacity-50"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-lg">{badge.icon}</span>
                      <span className={`text-xs font-semibold ${badge.unlocked ? "" : "text-gray-500"}`}>
                        {badge.label}
                      </span>
                    </div>
                    <p className="text-[10px] leading-relaxed">{badge.description}</p>
                    {badge.unlocked && badge.unlockedAt && (
                      <p className="text-[10px] mt-1 opacity-60">
                        {new Date(badge.unlockedAt).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Pro Score Badges & Difficulty Breakdown */}
            {isPro && (
              <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 mb-6">
                <h2 className="text-white font-semibold text-sm mb-4 flex items-center gap-2">
                  <Trophy size={16} className="text-red-400" />
                  Pro Score Badges
                </h2>
                <div className="grid grid-cols-3 gap-3 mb-4">
                  {[
                    { label: "80% Club", score: 80, color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30" },
                    { label: "90% Club", score: 90, color: "text-amber-400 bg-amber-500/10 border-amber-500/30" },
                    { label: "Perfect 100", score: 100, color: "text-red-400 bg-red-500/10 border-red-500/30" },
                  ].map((badge) => {
                    const earned = quizHistory.some((h) => h.score >= badge.score);
                    return (
                      <div
                        key={badge.label}
                        className={`rounded-xl p-3 border text-center ${earned ? badge.color : "bg-gray-800/50 border-gray-800 text-gray-600 opacity-60"}`}
                      >
                        <p className="text-lg mb-1">{earned ? "🏅" : "🔒"}</p>
                        <p className="text-xs font-semibold">{badge.label}</p>
                      </div>
                    );
                  })}
                </div>
                <h3 className="text-gray-400 text-xs font-medium uppercase tracking-wider mb-2">Performance by Difficulty</h3>
                <div className="space-y-2">
                  {(["easy", "medium", "hard"] as Difficulty[]).map((diff) => {
                    const attempts = quizHistory.filter((h) => h.mode === diff);
                    const avg = attempts.length > 0 ? Math.round(attempts.reduce((a, h) => a + h.score, 0) / attempts.length) : 0;
                    const best = attempts.length > 0 ? Math.max(...attempts.map((h) => h.score)) : 0;
                    return (
                      <div key={diff} className="flex items-center justify-between bg-gray-800/50 rounded-lg px-3 py-2">
                        <span className="text-gray-300 text-sm font-medium capitalize">{diff}</span>
                        <div className="flex items-center gap-3 text-xs">
                          <span className="text-gray-500">{attempts.length} quiz{attempts.length !== 1 ? "zes" : ""}</span>
                          <span className="text-gray-400">Avg {avg}%</span>
                          <span className="text-white font-semibold">Best {best}%</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Weak areas */}
            {data.weakAreas.length > 0 && (
              <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 mb-6">
                <h2 className="text-white font-semibold text-sm mb-4 flex items-center gap-2">
                  <TrendingDown size={16} className="text-red-400" />
                  Top Struggles
                </h2>
                <div className="space-y-2">
                  {data.weakAreas.map((w, i) => (
                    <div key={i} className="flex items-start gap-3 bg-gray-800/50 rounded-lg p-3">
                      <span className="text-red-500 font-bold text-sm">{i + 1}</span>
                      <div className="flex-1">
                        <p className="text-gray-300 text-sm leading-snug">{w.question}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-gray-500">{w.category}</span>
                          <span className="text-xs text-red-400">{w.failCount} misses</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

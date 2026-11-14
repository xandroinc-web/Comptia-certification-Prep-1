import { QuizResult } from "@workspace/api-client-react";
import type { ExamCategory } from "@/lib/scoring";
import { analyzeProgress } from "./analytics";

export interface Badge {
  id: string;
  label: string;
  description: string;
  icon: string;
  color: string;
  unlocked: boolean;
  unlockedAt?: string;
}

export interface GamificationState {
  streak: number;
  longestStreak: number;
  lastStudyDate: string | null;
  badges: Badge[];
  totalQuestionsAnswered: number;
  roadToCertPct: number;
}

const BADGE_DEFS: Omit<Badge, "unlocked" | "unlockedAt">[] = [
  {
    id: "first_quiz",
    label: "First Steps",
    description: "Complete your first quiz",
    icon: "🎯",
    color: "text-blue-400 bg-blue-500/10 border-blue-500/30",
  },
  {
    id: "perfect_score",
    label: "Perfect Score",
    description: "Get 100% on any quiz",
    icon: "🏆",
    color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
  },
  {
    id: "questions_100",
    label: "100 Questions",
    description: "Answer 100 questions total",
    icon: "📚",
    color: "text-amber-400 bg-amber-500/10 border-amber-500/30",
  },
  {
    id: "questions_500",
    label: "500 Questions",
    description: "Answer 500 questions total",
    icon: "📖",
    color: "text-red-400 bg-red-500/10 border-red-500/30",
  },
  {
    id: "passing_streak_3",
    label: "3-Quiz Streak",
    description: "Pass 3 quizzes in a row",
    icon: "🔥",
    color: "text-orange-400 bg-orange-500/10 border-orange-500/30",
  },
  {
    id: "passing_streak_5",
    label: "5-Quiz Streak",
    description: "Pass 5 quizzes in a row",
    icon: "🔥🔥",
    color: "text-red-500 bg-red-500/15 border-red-500/40",
  },
  {
    id: "daily_streak_7",
    label: "7-Day Streak",
    description: "Study 7 days in a row",
    icon: "📅",
    color: "text-purple-400 bg-purple-500/10 border-purple-500/30",
  },
  {
    id: "all_exams",
    label: "Trifecta Explorer",
    description: "Take quizzes in all 3 exams (A+, Network+, Security+)",
    icon: "🎓",
    color: "text-sky-400 bg-sky-500/10 border-sky-500/30",
  },
  {
    id: "master_domain",
    label: "Domain Master",
    description: "Reach Expert mastery in any A+ domain",
    icon: "⭐",
    color: "text-yellow-400 bg-yellow-500/10 border-yellow-500/30",
  },
  {
    id: "night_owl",
    label: "Night Owl",
    description: "Complete a quiz after 10 PM",
    icon: "🌙",
    color: "text-indigo-400 bg-indigo-500/10 border-indigo-500/30",
  },
];

function getLocalStreak(): { streak: number; lastDate: string | null } {
  try {
    const raw = localStorage.getItem("comptia_streak");
    if (raw) return JSON.parse(raw);
  } catch { /* noop */ }
  return { streak: 0, lastDate: null };
}

function saveLocalStreak(streak: number, lastDate: string) {
  try {
    localStorage.setItem("comptia_streak", JSON.stringify({ streak, lastDate }));
  } catch { /* noop */ }
}

function computeDailyStreak(history: QuizResult[]): { streak: number; longest: number; lastDate: string | null } {
  const local = getLocalStreak();
  if (history.length === 0) return { streak: local.streak, longest: local.streak, lastDate: local.lastDate };

  const dates = [...new Set(history.map((h) => h.completedAt.split("T")[0]))].sort();
  if (dates.length === 0) return { streak: local.streak, longest: local.streak, lastDate: local.lastDate };

  let streak = 1;
  let longest = 1;
  for (let i = 1; i < dates.length; i++) {
    const prev = new Date(dates[i - 1]);
    const curr = new Date(dates[i]);
    const diff = (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24);
    if (diff === 1) {
      streak++;
      longest = Math.max(longest, streak);
    } else if (diff > 1) {
      streak = 1;
    }
  }

  // Check if streak is still alive today
  const today = new Date().toISOString().split("T")[0];
  const lastDate = dates[dates.length - 1];
  const last = new Date(lastDate);
  const todayObj = new Date(today);
  const daysSince = (todayObj.getTime() - last.getTime()) / (1000 * 60 * 60 * 24);
  if (daysSince > 1) {
    streak = 0;
  }

  return { streak, longest, lastDate };
}

export function computeGamification(history: QuizResult[]): GamificationState {
  const { streak, longest, lastDate } = computeDailyStreak(history);

  // Total questions answered
  const totalQuestionsAnswered = history.reduce((sum, h) => sum + h.totalQuestions, 0);

  // Exam categories touched
  const categories = new Set<ExamCategory | "all">();
  for (const h of history) {
    const cat = h.category === "Trifecta" ? "all" : (h.category as ExamCategory);
    if (cat === "all") {
      categories.add("A+");
      categories.add("Network+");
      categories.add("Security+");
    } else {
      categories.add(cat);
    }
  }

  // Perfect scores
  const perfectScores = history.filter((h) => h.score === 100);
  const passingStreak = history.reduce((max, h, i, arr) => {
    let curr = 0;
    for (let j = arr.length - 1; j >= 0; j--) {
      if (arr[j].scaledScore >= 750) {
        curr++;
      } else {
        break;
      }
    }
    return Math.max(max, curr);
  }, 0);

  // Night owl
  const nightOwl = history.some((h) => {
    const hour = new Date(h.completedAt).getHours();
    return hour >= 22;
  });

  // Mastery analysis for domain master + road to cert
  const progress = analyzeProgress(history);
  const aPlus = progress.categories.find((c) => c.category === "A+");
  const hasDomainMaster = aPlus?.topicBreakdown?.some((t) => t.mastery === "expert") ?? false;

  // Road to Certification: weighted average of category mastery scores
  const examScores = progress.categories.map((c) => {
    const pct = c.totalQuestions > 0 ? (c.correctQuestions / c.totalQuestions) * 100 : 0;
    return Math.min(pct, 100);
  });
  const roadToCertPct = examScores.length > 0
    ? Math.round(examScores.reduce((a, b) => a + b, 0) / examScores.length)
    : 0;

  // Build badges
  const badges: Badge[] = BADGE_DEFS.map((def) => {
    let unlocked = false;
    let unlockedAt: string | undefined;

    switch (def.id) {
      case "first_quiz":
        unlocked = history.length > 0;
        if (unlocked) unlockedAt = history[0].completedAt;
        break;
      case "perfect_score":
        unlocked = perfectScores.length > 0;
        if (unlocked) unlockedAt = perfectScores[0].completedAt;
        break;
      case "questions_100":
        unlocked = totalQuestionsAnswered >= 100;
        break;
      case "questions_500":
        unlocked = totalQuestionsAnswered >= 500;
        break;
      case "passing_streak_3":
        unlocked = passingStreak >= 3;
        break;
      case "passing_streak_5":
        unlocked = passingStreak >= 5;
        break;
      case "daily_streak_7":
        unlocked = streak >= 7;
        break;
      case "all_exams":
        unlocked = categories.has("A+") && categories.has("Network+") && categories.has("Security+");
        break;
      case "master_domain":
        unlocked = hasDomainMaster;
        break;
      case "night_owl":
        unlocked = nightOwl;
        break;
    }

    return { ...def, unlocked, unlockedAt };
  });

  return {
    streak,
    longestStreak: longest,
    lastStudyDate: lastDate,
    badges,
    totalQuestionsAnswered,
    roadToCertPct,
  };
}

export function getUnlockedBadges(state: GamificationState): Badge[] {
  return state.badges.filter((b) => b.unlocked);
}

export function getLockedBadges(state: GamificationState): Badge[] {
  return state.badges.filter((b) => !b.unlocked);
}

export function getNextBadgeGoal(state: GamificationState): { label: string; progress: number; target: number } | null {
  const locked = getLockedBadges(state);
  if (locked.length === 0) return null;
  const next = locked[0];

  switch (next.id) {
    case "questions_100":
      return { label: next.label, progress: state.totalQuestionsAnswered, target: 100 };
    case "questions_500":
      return { label: next.label, progress: state.totalQuestionsAnswered, target: 500 };
    case "daily_streak_7":
      return { label: next.label, progress: state.streak, target: 7 };
    default:
      return { label: next.label, progress: 0, target: 1 };
  }
}

import { QuizResult } from "@workspace/api-client-react";
import type { ExamCategory, Difficulty } from "@/lib/scoring";
import type { DomainTopic } from "@/data/topics";
import { DOMAIN_METADATA, getDomainColor } from "@/data/topics";

/**
 * Optional per-question metadata for resolving weak-question ids to
 * their category/topic/text. The browser no longer ships the question
 * bank (P0-4), so callers that have server-provided metadata pass it
 * in; when omitted, weak-question detail is skipped gracefully and
 * everything else (scores, streaks, categories, recommendations)
 * still works from the QuizResult rows alone.
 */
export interface QuestionMeta {
  category: ExamCategory;
  topic?: DomainTopic;
  question: string;
}

export type QuestionMetaLookup = Map<number | string, QuestionMeta>;

export interface SubjectMastery {
  category: ExamCategory;
  totalAttempts: number;
  avgScore: number;
  bestScore: number;
  latestScore: number;
  passingRate: number;
  totalQuestions: number;
  correctQuestions: number;
  mastery: "weak" | "developing" | "strong" | "expert";
  weakTopicIds: number[];
  streak: number;
  lastTaken: string | null;
  topicBreakdown?: TopicMastery[];
}

export interface TopicMastery {
  topic: DomainTopic;
  label: string;
  color: string;
  totalAttempts: number;
  avgScore: number;
  bestScore: number;
  totalQuestions: number;
  correctQuestions: number;
  weakQuestionIds: number[];
  mastery: "weak" | "developing" | "strong" | "expert";
}

export interface StudyRecommendation {
  type: "flashcard" | "quiz" | "subject" | "difficulty";
  title: string;
  description: string;
  priority: "high" | "medium" | "low";
  category: ExamCategory | "all";
  action: string;
}

export interface OverallProgress {
  totalQuizzes: number;
  totalQuestions: number;
  avgScore: number;
  bestScore: number;
  passingQuizzes: number;
  streak: number;
  longestStreak: number;
  totalStudyTime: number;
  categories: SubjectMastery[];
  recommendations: StudyRecommendation[];
  weakAreas: { id: number; category: ExamCategory; question: string; failCount: number }[];
  progressHistory: { date: string; score: number; category: string }[];
}

export const MASTERY_THRESHOLDS = {
  weak: { max: 60, label: "Needs Focus" },
  developing: { max: 75, label: "Developing" },
  strong: { max: 85, label: "Strong" },
  expert: { max: 100, label: "Expert" },
};

export function getMasteryLevel(pct: number): SubjectMastery["mastery"] {
  if (pct < 60) return "weak";
  if (pct < 75) return "developing";
  if (pct < 85) return "strong";
  return "expert";
}

export function getMasteryLabel(m: SubjectMastery["mastery"]): string {
  return MASTERY_THRESHOLDS[m].label;
}

export function getMasteryColor(m: SubjectMastery["mastery"]): string {
  switch (m) {
    case "weak": return "text-red-400 bg-red-500/10 border-red-500/30";
    case "developing": return "text-amber-400 bg-amber-500/10 border-amber-500/30";
    case "strong": return "text-blue-400 bg-blue-500/10 border-blue-500/30";
    case "expert": return "text-emerald-400 bg-emerald-500/10 border-emerald-500/30";
  }
}

export function getMasteryBarColor(m: SubjectMastery["mastery"]): string {
  switch (m) {
    case "weak": return "bg-red-500";
    case "developing": return "bg-amber-500";
    case "strong": return "bg-blue-500";
    case "expert": return "bg-emerald-500";
  }
}

export function analyzeProgress(history: QuizResult[], questionMeta?: QuestionMetaLookup): OverallProgress {
  if (history.length === 0) {
    return {
      totalQuizzes: 0,
      totalQuestions: 0,
      avgScore: 0,
      bestScore: 0,
      passingQuizzes: 0,
      streak: 0,
      longestStreak: 0,
      totalStudyTime: 0,
      categories: [],
      recommendations: [],
      weakAreas: [],
      progressHistory: [],
    };
  }

  // Sort by date
  const sorted = [...history].sort(
    (a, b) => new Date(a.completedAt).getTime() - new Date(b.completedAt).getTime()
  );

  const totalQuizzes = sorted.length;
  const totalQuestions = sorted.reduce((sum, h) => sum + h.totalQuestions, 0);
  const scores = sorted.map((h) => h.score);
  const avgScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  const bestScore = Math.max(...scores);
  const passingQuizzes = sorted.filter((h) => h.scaledScore >= 750).length;

  // Streak calculation
  let streak = 0;
  let longestStreak = 0;
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (sorted[i].scaledScore >= 750) {
      streak++;
      longestStreak = Math.max(longestStreak, streak);
    } else {
      if (i === sorted.length - 1) streak = 0;
      break;
    }
  }
  if (streak === 0 && sorted.length > 0) {
    // recompute longest streak from the whole history
    let current = 0;
    longestStreak = 0;
    for (const h of sorted) {
      if (h.scaledScore >= 750) {
        current++;
        longestStreak = Math.max(longestStreak, current);
      } else {
        current = 0;
      }
    }
  }

  // Total study time (estimate ~1 min per question)
  const totalStudyTime = totalQuestions * 60;

  // Progress history
  const progressHistory = sorted.map((h) => ({
    date: new Date(h.completedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    score: h.score,
    category: h.category,
  }));

  // Category analysis
  const catData: Record<string, {
    attempts: number;
    scores: number[];
    totalQuestions: number;
    correctQuestions: number;
    weakIds: Set<number>;
    lastTaken: string | null;
  }> = {};

  // Topic analysis (A+ domain subtopics)
  const topicData: Record<DomainTopic, {
    attempts: number;
    scores: number[];
    totalQuestions: number;
    correctQuestions: number;
    weakIds: Set<number>;
    lastTaken: string | null;
  }> = {} as Record<DomainTopic, typeof catData["A+"]>;

  // All valid topic keys for quick lookup
  const topicKeys = new Set<string>(Object.keys(DOMAIN_METADATA));

  for (const h of sorted) {
    const cat = h.category === "Trifecta" ? "all" : h.category;

    // If category is a DomainTopic, accumulate directly into topicData
    if (topicKeys.has(cat)) {
      const topic = cat as DomainTopic;
      if (!topicData[topic]) {
        topicData[topic] = { attempts: 0, scores: [], totalQuestions: 0, correctQuestions: 0, weakIds: new Set(), lastTaken: null };
      }
      topicData[topic].attempts++;
      topicData[topic].scores.push(h.score);
      topicData[topic].totalQuestions += h.totalQuestions;
      topicData[topic].correctQuestions += h.correctCount;
      h.weakAreaIds.forEach((id) => {
        const meta = questionMeta?.get(id);
        if (meta && meta.topic === topic) topicData[topic].weakIds.add(id);
      });
      topicData[topic].lastTaken = h.completedAt;
    }

    // Also accumulate into category data (normal exam-level analysis)
    const cats = cat === "all" ? (["A+", "Network+", "Security+"] as ExamCategory[]) : [cat as ExamCategory];
    for (const c of cats) {
      if (!catData[c]) {
        catData[c] = {
          attempts: 0,
          scores: [],
          totalQuestions: 0,
          correctQuestions: 0,
          weakIds: new Set(),
          lastTaken: null,
        };
      }
      catData[c].attempts++;
      catData[c].scores.push(h.score);
      catData[c].totalQuestions += h.totalQuestions;
      catData[c].correctQuestions += h.correctCount;
      h.weakAreaIds.forEach((id) => {
        const meta = questionMeta?.get(id);
        if (meta && meta.category === c) catData[c].weakIds.add(id);
      });
      catData[c].lastTaken = h.completedAt;
    }
  }

  const categories: SubjectMastery[] = (Object.keys(catData) as ExamCategory[]).map((cat) => {
    const d = catData[cat];
    const avg = Math.round(d.scores.reduce((a, b) => a + b, 0) / d.scores.length);
    const best = Math.max(...d.scores);
    const latest = d.scores[d.scores.length - 1];
    const passRate = Math.round((d.scores.filter((s) => s >= 82).length / d.scores.length) * 100);
    const totalCorrect = d.correctQuestions;
    const total = d.totalQuestions;
    const pct = total > 0 ? Math.round((totalCorrect / total) * 100) : 0;

    // Build topic breakdown for A+ category
    const topicBreakdown: TopicMastery[] | undefined = cat === "A+"
      ? (Object.keys(topicData) as DomainTopic[]).map((topic) => {
          const t = topicData[topic];
          if (!t) return null;
          const tAvg = Math.round(t.scores.reduce((a, b) => a + b, 0) / t.scores.length);
          const tBest = Math.max(...t.scores);
          const tPct = t.totalQuestions > 0 ? Math.round((t.correctQuestions / t.totalQuestions) * 100) : 0;
          const meta = DOMAIN_METADATA[topic];
          return {
            topic,
            label: meta.label || topic,
            color: getDomainColor(topic),
            totalAttempts: t.attempts,
            avgScore: tAvg,
            bestScore: tBest,
            totalQuestions: t.totalQuestions,
            correctQuestions: t.correctQuestions,
            weakQuestionIds: Array.from(t.weakIds),
            mastery: getMasteryLevel(tPct),
          };
        }).filter(Boolean) as TopicMastery[]
      : undefined;

    return {
      category: cat,
      totalAttempts: d.attempts,
      avgScore: avg,
      bestScore: best,
      latestScore: latest,
      passingRate: passRate,
      totalQuestions: total,
      correctQuestions: totalCorrect,
      mastery: getMasteryLevel(pct),
      weakTopicIds: Array.from(d.weakIds),
      streak: 0,
      lastTaken: d.lastTaken,
      topicBreakdown,
    };
  });

  // Weak areas across all quizzes
  const weakAreaCounts: Record<number, { id: number; category: ExamCategory; question: string; failCount: number }> = {};
  for (const h of sorted) {
    for (const id of h.weakAreaIds) {
      const meta = questionMeta?.get(id);
      if (meta) {
        if (!weakAreaCounts[id]) {
          weakAreaCounts[id] = { id, category: meta.category, question: meta.question, failCount: 0 };
        }
        weakAreaCounts[id].failCount++;
      }
    }
  }
  const weakAreas = Object.values(weakAreaCounts).sort((a, b) => b.failCount - a.failCount).slice(0, 10);

  // Generate recommendations
  const recommendations: StudyRecommendation[] = [];

  // Find weakest category
  const weakest = categories
    .filter((c) => c.mastery === "weak" || c.mastery === "developing")
    .sort((a, b) => a.avgScore - b.avgScore)[0];

  if (weakest) {
    recommendations.push({
      type: "subject",
      title: `Focus on ${weakest.category}`,
      description: `Your ${weakest.category} score is ${weakest.avgScore}%. Review fundamentals and practice more ${weakest.category} questions.`,
      priority: "high",
      category: weakest.category,
      action: `Start ${weakest.category} Quiz`,
    });
  }

  // Find weakest difficulty
  const easyCount = sorted.filter((h) => h.mode === "easy").length;
  const mediumCount = sorted.filter((h) => h.mode === "medium").length;
  const hardCount = sorted.filter((h) => h.mode === "hard").length;
  if (hardCount < mediumCount && hardCount < 2) {
    recommendations.push({
      type: "difficulty",
      title: "Try Hard Mode",
      description: "You're building confidence. Push yourself with harder questions under more pressure.",
      priority: "medium",
      category: "all",
      action: "Start Hard Quiz",
    });
  } else if (mediumCount < 2) {
    recommendations.push({
      type: "difficulty",
      title: "Try Medium Mode",
      description: "Standard difficulty with real exam timing. A great baseline before tackling harder questions.",
      priority: "medium",
      category: "all",
      action: "Start Medium Quiz",
    });
  }

  // Flash card recommendations for weak topics
  if (weakAreas.length > 0) {
    const topWeak = weakAreas[0];
    recommendations.push({
      type: "flashcard",
      title: "Flash Card Review",
      description: `You've missed "${topWeak.question.substring(0, 50)}..." ${topWeak.failCount} times. Create a flash card for this topic.`,
      priority: "high",
      category: topWeak.category,
      action: "Study Weak Areas",
    });
  }

  // Topic-specific recommendation for weakest A+ domain
  const aPlus = categories.find((c) => c.category === "A+");
  if (aPlus && aPlus.topicBreakdown && aPlus.topicBreakdown.length > 0) {
    const weakestTopic = aPlus.topicBreakdown
      .filter((t) => t.mastery === "weak" || t.mastery === "developing")
      .sort((a, b) => a.avgScore - b.avgScore)[0];
    if (weakestTopic) {
      recommendations.push({
        type: "subject",
        title: `Study ${weakestTopic.label}`,
        description: `Your ${weakestTopic.label} domain is at ${weakestTopic.avgScore}% (${weakestTopic.mastery}). Focus on this A+ objective area for a targeted boost.`,
        priority: "high",
        category: "A+",
        action: `Study ${weakestTopic.label}`,
      });
    }
  }

  // Quiz recommendation if doing well
  if (streak >= 2) {
    recommendations.push({
      type: "quiz",
      title: "Keep the Momentum",
      description: `${streak} passing quizzes in a row! Try the full Trifecta exam to test across all subjects.`,
      priority: "low",
      category: "all",
      action: "Start Full Trifecta",
    });
  }

  return {
    totalQuizzes,
    totalQuestions,
    avgScore,
    bestScore,
    passingQuizzes,
    streak,
    longestStreak,
    totalStudyTime,
    categories,
    recommendations,
    weakAreas,
    progressHistory,
  };
}

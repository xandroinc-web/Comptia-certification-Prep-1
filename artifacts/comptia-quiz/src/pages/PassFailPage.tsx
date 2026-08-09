import { useEffect, useRef, useState } from "react";
import { Question, ExamCategory, Difficulty, comptiaScaledScore, isCompTiaPass, COMPTIA_PASS_SCORE, weightedScore, DIFFICULTY_LABELS } from "@/data/questions";
import { DOMAIN_METADATA } from "@/data/topics";
import { playPassSound, playFailSound } from "@/lib/sound-effects";

interface PassFailPageProps {
  questions: Question[];
  answers: (number | null)[];
  mode: string;
  difficulty: Difficulty;
  isWeakMode?: boolean;
  questionTimes: number[];
  completionTimestamp: string;
  onViewResults: () => void;
  onRetry: () => void;
  onHome: () => void;
}

export default function PassFailPage({ questions, answers, mode, difficulty, isWeakMode, questionTimes, completionTimestamp, onViewResults, onRetry, onHome }: PassFailPageProps) {
  const totalCorrect = questions.filter((q, i) => answers[i] === q.correctIndex).length;
  const rawPct = Math.round((totalCorrect / questions.length) * 100);
  const wPct = weightedScore(questions, answers);
  const scaled = comptiaScaledScore(wPct);
  const passed = isCompTiaPass(scaled);

  const totalTime = questionTimes.reduce((a, b) => a + b, 0);
  const avgTime = Math.round(totalTime / questions.length);

  // Save weak areas to localStorage
  const wrongIds = questions.filter((q, i) => answers[i] !== q.correctIndex).map((q) => q.id);
  const existing = JSON.parse(localStorage.getItem("comptia_weak_areas") || "[]") as number[];
  const merged = Array.from(new Set([...existing, ...wrongIds]));
  localStorage.setItem("comptia_weak_areas", JSON.stringify(merged));

  const [phase, setPhase] = useState<"burst" | "settle" | "detail">("burst");
  const soundPlayed = useRef(false);

  useEffect(() => {
    if (!soundPlayed.current) {
      soundPlayed.current = true;
      if (passed) {
        playPassSound();
      } else {
        playFailSound();
      }
    }
    const t1 = setTimeout(() => setPhase("settle"), 800);
    const t2 = setTimeout(() => setPhase("detail"), 1800);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [passed]);

  const particles = Array.from({ length: 24 }, (_, i) => ({
    id: i,
    angle: (i / 24) * 360,
    delay: (i % 6) * 80,
    size: 6 + (i % 3) * 4,
  }));

  return (
    <div
      className={`min-h-screen flex flex-col items-center justify-center p-6 transition-colors duration-1000 relative overflow-hidden ${
        passed ? "" : ""
      }`}
    >
      {/* Animated background glow */}
      <div
        className={`absolute inset-0 transition-opacity duration-1000 ${
          phase === "burst" ? "opacity-100" : "opacity-30"
        }`}
        style={{
          background: passed
            ? "radial-gradient(ellipse 60% 50% at 50% 50%, rgba(34,197,94,0.25) 0%, transparent 70%)"
            : "radial-gradient(ellipse 60% 50% at 50% 50%, rgba(239,68,68,0.25) 0%, transparent 70%)",
        }}
      />

      {/* Burst particles */}
      {phase === "burst" && (
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
          {particles.map((p) => (
            <div
              key={p.id}
              className="absolute rounded-full animate-ping"
              style={{
                width: p.size,
                height: p.size,
                backgroundColor: passed ? "#22c55e" : "#ef4444",
                opacity: 0.7,
                transform: `rotate(${p.angle}deg) translateX(${80 + p.size * 3}px)`,
                animationDelay: `${p.delay}ms`,
                animationDuration: "600ms",
              }}
            />
          ))}
        </div>
      )}

      {/* Main verdict */}
      <div
        className={`relative z-10 text-center transition-all duration-700 ${
          phase === "burst"
            ? "scale-125 opacity-100"
            : phase === "settle"
            ? "scale-110 opacity-100"
            : "scale-100 opacity-100"
        }`}
      >
        {/* Icon */}
        <div
          className={`mx-auto mb-4 w-28 h-28 rounded-full flex items-center justify-center border-4 transition-all duration-700 ${
            passed
              ? "bg-emerald-500/20 border-emerald-500 shadow-[0_0_60px_rgba(34,197,94,0.5)]"
              : "bg-red-500/20 border-red-500 shadow-[0_0_60px_rgba(239,68,68,0.5)]"
          }`}
        >
          {passed ? (
            <svg className="w-14 h-14 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          ) : (
            <svg className="w-14 h-14 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          )}
        </div>

        {/* Verdict word */}
        <h1
          className={`font-black tracking-tight leading-none mb-2 transition-all duration-700 ${
            phase === "burst" ? "text-8xl" : "text-7xl"
          } ${passed ? "text-emerald-400" : "text-red-400"}`}
          style={{
            textShadow: passed
              ? "0 0 40px rgba(34,197,94,0.8), 0 0 80px rgba(34,197,94,0.4)"
              : "0 0 40px rgba(239,68,68,0.8), 0 0 80px rgba(239,68,68,0.4)",
          }}
        >
          {passed ? "PASSED!" : "FAILED!"}
        </h1>

        {/* Exam label */}
        <p className="text-gray-400 text-lg font-medium mb-1">
          {mode === "all" ? "CompTIA Trifecta" : ["A+", "Network+", "Security+"].includes(mode) ? `CompTIA ${mode}` : DOMAIN_METADATA[mode as keyof typeof DOMAIN_METADATA]?.label || mode}
        </p>
        <div className="inline-flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/30 rounded-full px-3 py-1 text-emerald-400 text-xs font-bold uppercase tracking-wider mt-2">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
          100% Free
        </div>
      </div>

      {/* Score detail — fades in after settle */}
      <div
        className={`relative z-10 mt-8 w-full max-w-sm transition-all duration-700 ${
          phase === "detail" ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
        }`}
      >
        {/* CompTIA Score card */}
        <div
          className={`rounded-2xl border p-6 mb-4 text-center ${
            passed
              ? "bg-emerald-500/10 border-emerald-500/30"
              : "bg-red-500/10 border-red-500/30"
          }`}
        >
          <p className="text-gray-400 text-sm font-medium uppercase tracking-widest mb-1">
            CompTIA Score
          </p>
          <p
            className={`text-6xl font-black mb-1 ${passed ? "text-emerald-300" : "text-red-300"}`}
          >
            {scaled}
          </p>
          <p className="text-gray-300 text-lg font-semibold">
            {totalCorrect} / {questions.length} correct ({rawPct}%)
          </p>
          <p className={`text-sm mt-1 font-semibold ${passed ? "text-emerald-400" : "text-red-400"}`}>
            Pass: {COMPTIA_PASS_SCORE} — {passed ? "You passed!" : "Below passing"}
          </p>
        </div>

        {/* Timing info */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-4 text-center">
          <div className="flex items-center justify-center gap-4 text-sm">
            <div>
              <p className="text-gray-500 text-xs uppercase tracking-wider">Total Time</p>
              <p className="text-white font-semibold">{Math.floor(totalTime / 60)}m {totalTime % 60}s</p>
            </div>
            <div className="w-px h-8 bg-gray-700" />
            <div>
              <p className="text-gray-500 text-xs uppercase tracking-wider">Per Question</p>
              <p className="text-white font-semibold">{avgTime}s avg</p>
            </div>
          </div>
          {completionTimestamp && (
            <p className="text-gray-500 text-xs mt-2">
              Completed: {completionTimestamp}
            </p>
          )}
        </div>

        {/* Motivational message */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-6 text-center">
          <p className="text-gray-300 text-sm leading-relaxed">
            {passed
              ? "Outstanding work! Review the answer breakdown to reinforce concepts before your exam day."
              : "Not there yet — but every wrong answer is a lesson locked in. Study the review below, retry, and watch that score climb."}
          </p>
        </div>

        {/* Buttons */}
        <div className="space-y-3">
          <button
            onClick={onViewResults}
            className={`w-full py-3.5 rounded-xl font-semibold text-white transition-colors shadow-lg ${
              passed
                ? "bg-emerald-600 hover:bg-emerald-500 shadow-emerald-900/30"
                : "bg-red-600 hover:bg-red-500 shadow-red-900/30"
            }`}
          >
            View Answer Review
          </button>
          <div className="flex gap-3">
            <button
              onClick={onRetry}
              className="flex-1 py-3 rounded-xl border border-gray-700 text-gray-300 hover:text-white hover:border-gray-500 font-medium text-sm transition-colors"
            >
              Try Again
            </button>
            <button
              onClick={onHome}
              className="flex-1 py-3 rounded-xl border border-gray-700 text-gray-300 hover:text-white hover:border-gray-500 font-medium text-sm transition-colors"
            >
              Home
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

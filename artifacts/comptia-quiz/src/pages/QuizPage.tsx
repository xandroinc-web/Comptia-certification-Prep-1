import { useState, useEffect, useRef } from "react";
import { Question, ExamCategory, Difficulty, getTimeLimitSeconds, SECONDS_PER_QUESTION, DIFFICULTY_LABELS } from "@/data/questions";
import { DOMAIN_METADATA, getDomainColor } from "@/data/topics";
import { playWinnerSound, playHeartbreakSound } from "@/lib/sound-effects";

interface QuizPageProps {
  questions: Question[];
  mode: string;
  difficulty: Difficulty;
  isWeakMode?: boolean;
  isExamMode?: boolean;
  tierSecondsPerQuestion?: number;
  timeLimitSeconds: number;
  onFinish: (answers: (number | null)[], questionTimes: number[]) => void;
  onHome: () => void;
}

const CATEGORY_COLOR: Record<string, string> = {
  "A+": "bg-blue-500/10 text-blue-400 border-blue-500/30",
  "Network+": "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  "Security+": "bg-purple-500/10 text-purple-400 border-purple-500/30",
};

function formatTimer(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function QuizPage({ questions, mode, difficulty, isWeakMode, isExamMode, tierSecondsPerQuestion, timeLimitSeconds, onFinish, onHome }: QuizPageProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<(number | null)[]>(Array(questions.length).fill(null));
  const [showWarning, setShowWarning] = useState(false);
  const [slideDir, setSlideDir] = useState<"left" | "right">("right");

  // Timer
  const [secondsLeft, setSecondsLeft] = useState(timeLimitSeconds);
  const [isExpired, setIsExpired] = useState(false);

  // Per-question timing
  const questionStartTime = useRef(Date.now());
  const [questionTimes, setQuestionTimes] = useState<number[]>(Array(questions.length).fill(0));
  const answersRef = useRef<(number | null)[]>(Array(questions.length).fill(null));
  const questionTimesRef = useRef<number[]>(Array(questions.length).fill(0));
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setCurrentIndex(0);
    setAnswers(Array(questions.length).fill(null));
    answersRef.current = Array(questions.length).fill(null);
    setShowWarning(false);
    setSecondsLeft(timeLimitSeconds);
    setIsExpired(false);
    setQuestionTimes(Array(questions.length).fill(0));
    questionTimesRef.current = Array(questions.length).fill(0);
    questionStartTime.current = Date.now();
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
  }, [questions, timeLimitSeconds]);

  useEffect(() => {
    return () => {
      if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    };
  }, []);

  // Countdown tick
  useEffect(() => {
    if (isExpired) return;
    const timer = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setIsExpired(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [isExpired, questions.length]);

  // Auto-submit when expired
  useEffect(() => {
    if (!isExpired) return;
    // Record time for current question before finishing
    const now = Date.now();
    const elapsed = Math.round((now - questionStartTime.current) / 1000);
    const updatedTimes = [...questionTimesRef.current];
    updatedTimes[currentIndex] = (updatedTimes[currentIndex] || 0) + elapsed;
    questionTimesRef.current = updatedTimes;
    setQuestionTimes(updatedTimes);
    // Small delay so user sees the "Time's Up" state
    const t = setTimeout(() => onFinish(answersRef.current, questionTimesRef.current), 800);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isExpired]);

  const current = questions[currentIndex];
  const isLast = currentIndex === questions.length - 1;
  const selectedAnswer = answers[currentIndex];
  const hasAnswered = selectedAnswer !== null;
  const isCorrect = hasAnswered && selectedAnswer === current.correctIndex;
  const progress = ((currentIndex + 1) / questions.length) * 100;

  const timerWarn = secondsLeft <= 60;
  const timerDanger = secondsLeft <= 30;

  // Gamification feedback copy
  const reinforcement = isCorrect
    ? ["Nice!", "Solid!", "Correct!", "Great recall!", "That's it!", "Winner's circle!"][currentIndex % 6]
    : null;
  const correction = !isCorrect && hasAnswered
    ? `The correct answer is ${String.fromCharCode(65 + current.correctIndex)}. ${current.options[current.correctIndex]}. ${current.explanation}`
    : null;

  function recordQuestionTime(idx: number) {
    const now = Date.now();
    const elapsed = Math.round((now - questionStartTime.current) / 1000);
    const updatedTimes = [...questionTimesRef.current];
    updatedTimes[idx] = (updatedTimes[idx] || 0) + elapsed;
    questionTimesRef.current = updatedTimes;
    setQuestionTimes(updatedTimes);
    questionStartTime.current = now;
  }

  function advance() {
    if (feedbackTimer.current) {
      clearTimeout(feedbackTimer.current);
      feedbackTimer.current = null;
    }
    recordQuestionTime(currentIndex);
    if (isLast) {
      onFinish(answersRef.current, questionTimesRef.current);
    } else {
      setSlideDir("right");
      setCurrentIndex((i) => i + 1);
      setShowWarning(false);
      questionStartTime.current = Date.now();
    }
  }

  function selectAnswer(index: number) {
    if (hasAnswered) return; // lock after first click
    const updated = [...answers];
    updated[currentIndex] = index;
    answersRef.current = updated;
    setAnswers(updated);
    setShowWarning(false);
    // Gamification SFX
    if (index === current.correctIndex) {
      playWinnerSound();
    } else {
      playHeartbreakSound();
    }
    // Auto-advance after delay so user sees feedback
    const feedbackDelay = difficulty === "hard" ? 2800 : 2200;
    feedbackTimer.current = setTimeout(() => {
      feedbackTimer.current = null;
      advance();
    }, feedbackDelay);
  }

  function handleDotClick(i: number) {
    if (hasAnswered) return;
    recordQuestionTime(currentIndex);
    setCurrentIndex(i);
    setShowWarning(false);
    questionStartTime.current = Date.now();
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top bar */}
      <div className="border-b border-gray-800 bg-gray-900/80 backdrop-blur px-4 py-3 flex items-center justify-between">
        <button
          onClick={onHome}
          className="text-gray-500 hover:text-gray-300 text-sm transition-colors flex items-center gap-1.5"
        >
          ← Home
        </button>
        <span className="text-gray-400 text-sm font-medium">
          {isWeakMode ? "Weak Area " : "Question "}{currentIndex + 1} of {questions.length}
          {difficulty !== "medium" && (
            <span className="ml-1 text-[10px] uppercase tracking-wider font-bold text-gray-500">{DIFFICULTY_LABELS[difficulty]}</span>
          )}
        </span>
        {/* Timer */}
        <div className={`flex items-center gap-1.5 text-sm font-bold tabular-nums ${
          isExpired
            ? "text-red-400"
            : timerDanger
            ? "text-red-400 animate-pulse"
            : timerWarn
            ? "text-amber-400"
            : "text-gray-300"
        }`}>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {isExpired ? "Time's Up!" : formatTimer(secondsLeft)}
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-gray-800">
        <div
          className="h-1 bg-red-500 transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Content */}
      <div className="flex-1 flex items-start justify-center p-4 pt-8">
        <div className="w-full max-w-2xl">
          {/* Weak mode badge */}
          {isWeakMode && (
            <div className="mb-4 flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 bg-amber-500/10 border border-amber-500/30 rounded-full px-3 py-1 text-amber-400 text-xs font-bold uppercase tracking-wider">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
                Study Mode — Focused on weak areas
              </span>
            </div>
          )}

          {isExamMode && difficulty === "hard" && (
            <div className="mb-4 flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 bg-red-500/10 border border-red-500/40 rounded-full px-3 py-1 text-red-300 text-xs font-black uppercase tracking-wider shadow-[0_0_18px_rgba(239,68,68,0.12)]">
                <span aria-hidden="true">☠</span>
                HellMode — no free points
              </span>
              <span className="text-red-300/60 text-xs">{tierSecondsPerQuestion ?? SECONDS_PER_QUESTION.hard} seconds per question</span>
            </div>
          )}

          {/* Time's up overlay */}
          {isExpired && (
            <div className="mb-6 bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-center animate-pulse">
              <p className="text-red-400 font-bold text-lg">Time's Up! Submitting your answers...</p>
              <p className="text-red-300/70 text-sm mt-1">
                Unanswered questions will be marked incorrect
              </p>
            </div>
          )}

          {/* Animated question card */}
          <div
            key={currentIndex}
            className={`transition-all duration-300 ${
              slideDir === "right" ? "animate-[slideInRight_0.3s_ease-out]" : "animate-[slideInLeft_0.3s_ease-out]"
            }`}
          >
          {/* Category + topic badge */}
          <div className="mb-5 flex items-center gap-2 flex-wrap">
            <span
              className={`inline-flex items-center text-xs font-semibold uppercase tracking-widest px-3 py-1 rounded-full border ${
                CATEGORY_COLOR[current.category]
              }`}
            >
              CompTIA {current.category}
            </span>
            {current.topic && (
              <span
                className="inline-flex items-center text-xs font-semibold uppercase tracking-widest px-3 py-1 rounded-full border"
                style={{
                  backgroundColor: getDomainColor(current.topic) + "18",
                  color: getDomainColor(current.topic),
                  borderColor: getDomainColor(current.topic) + "40",
                }}
              >
                {DOMAIN_METADATA[current.topic]?.label || current.topic}
              </span>
            )}
          </div>

          {/* Question */}
          <h2 className="text-white text-xl font-semibold leading-snug mb-8">
            {current.question}
          </h2>

          {/* Options */}
          <div className="space-y-3 mb-6">
            {current.options.map((option, i) => {
              const letter = String.fromCharCode(65 + i);
              const isSelected = selectedAnswer === i;
              const isCorrectChoice = i === current.correctIndex;

              let btnClass = "border-gray-700 bg-gray-900 text-gray-300 hover:border-gray-500 hover:bg-gray-800";
              let letterClass = "bg-gray-800 text-gray-400 border border-gray-700";
              let icon = null;

              if (hasAnswered) {
                if (isCorrectChoice) {
                  btnClass = "border-emerald-500 bg-emerald-500/10 text-white";
                  letterClass = "bg-emerald-500 text-white";
                  icon = (
                    <svg className="w-4 h-4 text-emerald-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                  );
                } else if (isSelected) {
                  btnClass = "border-red-500 bg-red-500/10 text-white";
                  letterClass = "bg-red-500 text-white";
                  icon = (
                    <svg className="w-4 h-4 text-red-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  );
                } else {
                  btnClass = "border-gray-800 bg-gray-900/50 text-gray-600 opacity-60";
                  letterClass = "bg-gray-800 text-gray-600 border border-gray-700";
                }
              } else if (isSelected) {
                btnClass = "border-red-500 bg-red-500/10 text-white";
                letterClass = "bg-red-500 text-white";
              }

              return (
                <button
                  key={i}
                  onClick={() => selectAnswer(i)}
                  disabled={hasAnswered}
                  className={`w-full text-left flex items-start gap-4 p-4 rounded-xl border transition-all duration-150 ${btnClass}`}
                >
                  <span
                    className={`flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-sm font-bold transition-colors ${letterClass}`}
                  >
                    {letter}
                  </span>
                  <span className="pt-0.5 leading-snug flex-1">{option}</span>
                  {icon}
                </button>
              );
            })}
          </div>

          {/* Immediate feedback banner with gamification */}
          {hasAnswered && (
            <div className={`mb-5 rounded-xl p-4 border text-center transition-all ${
              isCorrect
                ? "bg-emerald-500/10 border-emerald-500/30"
                : "bg-red-500/10 border-red-500/30"
            }`}>
              <p className={`font-bold text-lg mb-1 ${isCorrect ? "text-emerald-400" : "text-red-400"}`}>
                {isCorrect ? reinforcement : "Incorrect"}
              </p>
              {!isCorrect && correction && (
                <p className="text-gray-300 text-sm leading-relaxed">
                  {correction}
                </p>
              )}
              {isCorrect && isExamMode && (
                <p className="text-emerald-300/80 text-sm">That answer keeps you in the winner's circle.</p>
              )}
              <p className="text-gray-500 text-xs mt-2">Moving to next question...</p>
            </div>
          )}

          {/* Navigation — only Back (disabled during feedback) */}
          <div className="flex gap-3">
            <button
              onClick={() => {
                if (currentIndex > 0) {
                  recordQuestionTime(currentIndex);
                  setSlideDir("left");
                  setCurrentIndex((i) => i - 1);
                  setShowWarning(false);
                  questionStartTime.current = Date.now();
                }
              }}
              disabled={currentIndex === 0 || hasAnswered}
              className="px-5 py-3 rounded-xl border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors font-medium text-sm"
            >
              Back
            </button>

            {isLast ? (
              <button
                onClick={() => {
                  recordQuestionTime(currentIndex);
                  onFinish(answers, questionTimes);
                }}
                disabled={!hasAnswered}
                className="flex-1 bg-red-600 hover:bg-red-500 active:bg-red-700 text-white font-semibold py-3 rounded-xl transition-colors shadow-lg shadow-red-900/30 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Submit & Grade
              </button>
            ) : (
              <button
                onClick={() => advance()}
                disabled={!hasAnswered}
                className="flex-1 bg-gray-700 hover:bg-gray-600 active:bg-gray-800 text-white font-semibold py-3 rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next
              </button>
            )}
          </div>

          {/* Time info */}
          <div className="mt-4 flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-2.5 py-0.5 text-emerald-400/70 text-[10px] font-bold uppercase tracking-wider">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
              100% Free
            </span>
            <span className="text-gray-600 text-xs">
              ~{SECONDS_PER_QUESTION[difficulty]}s per question
            </span>
          </div>

          {/* Question dots */}
          <div className="mt-3 flex flex-wrap gap-1.5 justify-center">
            {questions.map((_, i) => (
              <button
                key={i}
                onClick={() => handleDotClick(i)}
                disabled={hasAnswered && i !== currentIndex}
                className={`w-6 h-6 rounded text-xs font-medium transition-colors ${
                  i === currentIndex
                    ? "bg-red-500 text-white"
                    : answers[i] !== null
                    ? "bg-gray-600 text-gray-300"
                    : "bg-gray-800 text-gray-600 hover:bg-gray-700"
                }`}
              >
                {i + 1}
              </button>
            ))}
          </div>
          </div>
        </div>
      </div>
    </div>
  );
}

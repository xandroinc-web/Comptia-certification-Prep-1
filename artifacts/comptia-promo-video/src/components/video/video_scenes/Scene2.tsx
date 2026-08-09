import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

export function Scene2() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 100),
      setTimeout(() => setPhase(2), 600),
      setTimeout(() => setPhase(3), 1800),
      setTimeout(() => setPhase(4), 3800),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex items-center justify-center z-10"
      initial={{ opacity: 0, x: '100%' }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: '-100%', filter: 'blur(10px)' }}
      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="w-full max-w-6xl flex items-center justify-between px-12">
        <div className="w-1/2">
          <motion.h2 
            className="text-[5vw] font-black leading-none font-display uppercase tracking-tight"
            initial={{ opacity: 0, x: -50 }}
            animate={phase >= 1 ? { opacity: 1, x: 0 } : { opacity: 0, x: -50 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
          >
            270+ <br/>
            <span className="text-primary">QUESTIONS</span>
          </motion.h2>
          <motion.div 
            className="mt-6 text-2xl text-text-secondary font-body max-w-md"
            initial={{ opacity: 0, filter: 'blur(10px)' }}
            animate={phase >= 2 ? { opacity: 1, filter: 'blur(0px)' } : { opacity: 0, filter: 'blur(10px)' }}
            transition={{ duration: 0.6 }}
          >
            Timed quizzes. Pass/Fail scoring. Answer randomization prevents "Always B" bugs.
          </motion.div>
        </div>

        <div className="w-1/2 relative h-[60vh] flex flex-col gap-4 justify-center">
          {[
            { q: "What port does HTTPS use?", a: "443", correct: true },
            { q: "Which protocol is connectionless?", a: "UDP", correct: true },
            { q: "What topology uses a central hub?", a: "Star", correct: true }
          ].map((item, i) => (
            <motion.div
              key={i}
              className="bg-bg-light/80 backdrop-blur-md p-6 rounded-xl border border-white/10 shadow-2xl"
              initial={{ opacity: 0, x: 50, scale: 0.9 }}
              animate={phase >= 3 ? { opacity: 1, x: 0, scale: 1 } : { opacity: 0, x: 50, scale: 0.9 }}
              transition={{ type: 'spring', stiffness: 300, damping: 20, delay: phase >= 3 ? i * 0.2 : 0 }}
            >
              <div className="text-sm text-text-muted mb-2 font-mono">Question {i+1}</div>
              <div className="text-xl font-bold mb-4">{item.q}</div>
              <div className="flex justify-between items-center bg-primary/20 border border-primary/50 text-primary px-4 py-2 rounded">
                <span className="font-medium">{item.a}</span>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

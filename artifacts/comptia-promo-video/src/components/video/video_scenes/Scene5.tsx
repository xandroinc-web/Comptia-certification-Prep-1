import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

export function Scene5() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 300),
      setTimeout(() => setPhase(2), 1000),
      setTimeout(() => setPhase(3), 1800),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex flex-col items-center justify-center z-10 bg-bg-dark"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, filter: 'blur(20px)' }}
      transition={{ duration: 1 }}
    >
      <div className="text-center">
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={phase >= 1 ? { scale: 1, opacity: 1 } : { scale: 0, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 20 }}
          className="mb-8"
        >
          <div className="w-24 h-24 mx-auto bg-primary rounded-2xl rotate-45 flex items-center justify-center shadow-[0_0_30px_rgba(220,38,38,0.5)]">
            <div className="w-12 h-12 bg-white rounded-lg -rotate-45" />
          </div>
        </motion.div>

        <motion.h1 
          className="text-[5vw] font-black tracking-tighter text-white leading-none font-display uppercase"
          initial={{ opacity: 0, y: 20 }}
          animate={phase >= 2 ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          transition={{ duration: 0.6 }}
        >
          START PRACTICING<br/>TODAY
        </motion.h1>
        
        <motion.div 
          className="mt-8 text-2xl text-text-secondary font-mono tracking-widest"
          initial={{ opacity: 0 }}
          animate={phase >= 3 ? { opacity: 1 } : { opacity: 0 }}
          transition={{ duration: 0.8 }}
        >
          COMPTIA-QUIZ.REPLIT.APP
        </motion.div>
      </div>
    </motion.div>
  );
}

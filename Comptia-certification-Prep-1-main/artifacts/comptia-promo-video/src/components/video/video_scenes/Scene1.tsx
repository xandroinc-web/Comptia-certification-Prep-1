import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

export function Scene1() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 200),
      setTimeout(() => setPhase(2), 800),
      setTimeout(() => setPhase(3), 1500),
      setTimeout(() => setPhase(4), 3200),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex flex-col items-center justify-center z-10"
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 1.1, filter: 'blur(10px)' }}
      transition={{ duration: 0.8 }}
    >
      <div className="text-center px-12">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: -20 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="inline-block px-4 py-1 mb-6 rounded-full border border-primary/30 bg-primary/10 text-primary font-mono text-sm tracking-wider uppercase"
        >
          CompTIA Trifecta Quiz
        </motion.div>
        
        <motion.h1 
          className="text-[6vw] font-black tracking-tighter text-text-primary leading-tight uppercase font-display"
        >
          {'MASTER THE'.split('').map((char, i) => (
            <motion.span key={i} className="inline-block"
              initial={{ opacity: 0, y: 40, rotateX: -40 }}
              animate={phase >= 2 ? { opacity: 1, y: 0, rotateX: 0 } : { opacity: 0, y: 40, rotateX: -40 }}
              transition={{ type: 'spring', stiffness: 400, damping: 25, delay: phase >= 2 ? i * 0.03 : 0 }}>
              {char === ' ' ? '\u00A0' : char}
            </motion.span>
          ))}
          <br />
          {'TRIFECTA'.split('').map((char, i) => (
            <motion.span key={`b-${i}`} className="inline-block text-primary"
              initial={{ opacity: 0, y: 40, rotateX: -40 }}
              animate={phase >= 2 ? { opacity: 1, y: 0, rotateX: 0 } : { opacity: 0, y: 40, rotateX: -40 }}
              transition={{ type: 'spring', stiffness: 400, damping: 25, delay: phase >= 2 ? 0.2 + (i * 0.05) : 0 }}>
              {char}
            </motion.span>
          ))}
        </motion.h1>
        
        <div className="mt-8 flex gap-6 justify-center">
          {['A+', 'Network+', 'Security+'].map((cert, i) => (
            <motion.div
              key={cert}
              className="px-6 py-3 rounded-lg bg-secondary/80 border border-white/10 font-bold text-xl"
              initial={{ opacity: 0, scale: 0.8, y: 20 }}
              animate={phase >= 3 ? { opacity: 1, scale: 1, y: 0 } : { opacity: 0, scale: 0.8, y: 20 }}
              transition={{ type: 'spring', stiffness: 300, damping: 20, delay: phase >= 3 ? i * 0.15 : 0 }}
            >
              {cert}
            </motion.div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

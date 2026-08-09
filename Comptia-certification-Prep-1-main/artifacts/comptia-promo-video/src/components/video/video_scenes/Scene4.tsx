import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

export function Scene4() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 100),
      setTimeout(() => setPhase(2), 800),
      setTimeout(() => setPhase(3), 3200),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex items-center justify-center z-10"
      initial={{ opacity: 0, rotateY: -90 }}
      animate={{ opacity: 1, rotateY: 0 }}
      exit={{ opacity: 0, rotateY: 90, filter: 'blur(10px)' }}
      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
      style={{ perspective: 1000 }}
    >
      <div className="w-full max-w-5xl flex items-center gap-16 px-12">
        <div className="flex-1">
          <motion.h2 
            className="text-[4.5vw] font-black leading-none font-display uppercase tracking-tight text-white mb-6"
            initial={{ opacity: 0, x: -30 }}
            animate={phase >= 1 ? { opacity: 1, x: 0 } : { opacity: 0, x: -30 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
          >
            GO PRO. <br/>
            <span className="text-primary">PASS FASTER.</span>
          </motion.h2>
        </div>

        <motion.div 
          className="flex-1 bg-gradient-to-br from-bg-light to-bg-dark p-1 border border-primary/50 rounded-2xl shadow-[0_0_50px_rgba(220,38,38,0.2)]"
          initial={{ opacity: 0, y: 50, scale: 0.9 }}
          animate={phase >= 2 ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: 50, scale: 0.9 }}
          transition={{ type: 'spring', stiffness: 300, damping: 20 }}
        >
          <div className="bg-bg-dark rounded-xl p-8 h-full">
            <div className="uppercase tracking-widest text-primary font-bold text-sm mb-2">Pro Tier</div>
            <div className="text-5xl font-black mb-6 font-display">$9.99<span className="text-xl text-text-secondary font-medium">/mo</span></div>
            
            <ul className="space-y-4 mb-8">
              {[
                'Full 270+ Question Bank',
                'Advanced Performance Tracking',
                'Priority Support',
                'Cancel Anytime via Stripe'
              ].map((feature, i) => (
                <motion.li 
                  key={i} 
                  className="flex items-center text-lg text-text-primary"
                  initial={{ opacity: 0, x: 20 }}
                  animate={phase >= 2 ? { opacity: 1, x: 0 } : { opacity: 0, x: 20 }}
                  transition={{ delay: phase >= 2 ? 0.4 + (i * 0.1) : 0 }}
                >
                  <svg className="w-5 h-5 text-primary mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                  {feature}
                </motion.li>
              ))}
            </ul>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}

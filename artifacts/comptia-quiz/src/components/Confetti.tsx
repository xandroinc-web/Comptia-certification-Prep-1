/**
 * Confetti / fireworks celebration overlay.
 *
 * Canvas-free: pure DOM + framer-motion (already a dependency — no new
 * packages). Renders a set of firework bursts (particles flying out
 * from a few launch points) plus a rain of confetti pieces, then
 * unmounts itself after ~4.5s so nothing lingers in the DOM.
 *
 * Safe for the Vite production build: all randomness is computed
 * inside `useMemo` at render time (client only) — no `window` access
 * at import time and no SSR assumptions.
 */
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";

const BURST_COLORS = ["#f43f5e", "#f59e0b", "#22c55e", "#38bdf8", "#a78bfa", "#facc15", "#ffffff"];
const CONFETTI_COLORS = ["#ef4444", "#f59e0b", "#22c55e", "#3b82f6", "#a855f7", "#ec4899", "#facc15"];

interface BurstParticle {
  id: string;
  angle: number;
  distance: number;
  size: number;
  color: string;
  duration: number;
  delay: number;
}

interface Burst {
  id: number;
  x: number; // vw
  y: number; // vh
  delay: number;
  particles: BurstParticle[];
}

interface RainPiece {
  id: number;
  x: number; // vw
  delay: number;
  duration: number;
  size: number;
  color: string;
  drift: number;
  rotate: number;
}

function randomBursts(count: number): Burst[] {
  return Array.from({ length: count }, (_, b) => {
    const particles: BurstParticle[] = Array.from({ length: 16 }, (_, i) => {
      const angle = (i / 16) * Math.PI * 2 + Math.random() * 0.5;
      return {
        id: `b${b}p${i}`,
        angle,
        distance: 60 + Math.random() * 110,
        size: 4 + Math.random() * 6,
        color: BURST_COLORS[Math.floor(Math.random() * BURST_COLORS.length)],
        duration: 0.9 + Math.random() * 0.7,
        delay: Math.random() * 0.15,
      };
    });
    return {
      id: b,
      x: 12 + Math.random() * 76,
      y: 10 + Math.random() * 38,
      delay: b * 0.35 + Math.random() * 0.2,
      particles,
    };
  });
}

function randomRain(count: number): RainPiece[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    delay: Math.random() * 1.6,
    duration: 2.2 + Math.random() * 1.4,
    size: 6 + Math.random() * 6,
    color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
    drift: (Math.random() - 0.5) * 120,
    rotate: Math.random() * 720 - 360,
  }));
}

export function Confetti({ bursts = 6, rainPieces = 70 }: { bursts?: number; rainPieces?: number }) {
  const [visible, setVisible] = useState(true);
  const burstList = useMemo(() => randomBursts(bursts), [bursts]);
  const rain = useMemo(() => randomRain(rainPieces), [rainPieces]);

  // Fire once, then leave the DOM (particles end at opacity 0 anyway).
  useEffect(() => {
    const t = setTimeout(() => setVisible(false), 4500);
    return () => clearTimeout(t);
  }, []);

  if (!visible) return null;

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
      {/* Firework bursts */}
      {burstList.map((burst) => (
        <div
          key={burst.id}
          className="absolute"
          style={{ left: `${burst.x}vw`, top: `${burst.y}vh` }}
        >
          {burst.particles.map((p) => (
            <motion.span
              key={p.id}
              className="absolute rounded-full"
              style={{
                width: p.size,
                height: p.size,
                backgroundColor: p.color,
                boxShadow: `0 0 ${p.size * 2}px ${p.color}`,
              }}
              initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
              animate={{
                x: Math.cos(p.angle) * p.distance,
                y: Math.sin(p.angle) * p.distance + p.distance * 0.35,
                opacity: [1, 1, 0],
                scale: [1, 0.9, 0.4],
              }}
              transition={{ duration: p.duration, delay: burst.delay + p.delay, ease: "easeOut" }}
            />
          ))}
          {/* Flash at the burst centre */}
          <motion.span
            className="absolute rounded-full bg-white"
            style={{ width: 10, height: 10, marginLeft: -5, marginTop: -5 }}
            initial={{ opacity: 0.9, scale: 1 }}
            animate={{ opacity: 0, scale: 3 }}
            transition={{ duration: 0.5, delay: burst.delay, ease: "easeOut" }}
          />
        </div>
      ))}

      {/* Falling confetti rain */}
      {rain.map((piece) => (
        <motion.span
          key={piece.id}
          className="absolute rounded-[2px]"
          style={{
            left: `${piece.x}vw`,
            top: "-3vh",
            width: piece.size,
            height: piece.size * 0.6,
            backgroundColor: piece.color,
          }}
          initial={{ y: "-3vh", opacity: 1, rotate: 0 }}
          animate={{ y: "108vh", x: [0, piece.drift, piece.drift * 0.4], opacity: [1, 1, 0.9, 0], rotate: piece.rotate }}
          transition={{ duration: piece.duration, delay: piece.delay, ease: "easeIn" }}
        />
      ))}
    </div>
  );
}

export default Confetti;

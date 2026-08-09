import { motion } from "framer-motion";

/** Floating hexagonal nodes — tech network visualization */
function NodeGrid() {
  const nodes = Array.from({ length: 20 }, (_, i) => ({
    id: i,
    x: Math.random() * 90 + 5,
    y: Math.random() * 90 + 5,
    size: Math.random() * 4 + 2,
    pulseDuration: Math.random() * 4 + 3,
    delay: Math.random() * 3,
  }));

  return (
    <div className="absolute inset-0 overflow-hidden">
      {nodes.map((n) => (
        <motion.div
          key={n.id}
          className="absolute rounded-full"
          style={{
            left: `${n.x}%`,
            top: `${n.y}%`,
            width: n.size,
            height: n.size,
            background: 'radial-gradient(circle, rgba(220,38,38,0.9) 0%, rgba(220,38,38,0.3) 40%, transparent 70%)',
            boxShadow: '0 0 12px 2px rgba(220,38,38,0.5), 0 0 24px 6px rgba(220,38,38,0.2)',
          }}
          animate={{
            opacity: [0.3, 1, 0.3],
            scale: [0.8, 1.3, 0.8],
          }}
          transition={{
            duration: n.pulseDuration,
            repeat: Infinity,
            ease: 'easeInOut',
            delay: n.delay,
          }}
        />
      ))}

      {/* Connection lines between nearby nodes */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none" xmlns="http://www.w3.org/2000/svg">
        {nodes.map((a, i) =>
          nodes.slice(i + 1).map((b, j) => {
            const dx = Math.abs(a.x - b.x);
            const dy = Math.abs(a.y - b.y);
            if (dx > 25 || dy > 25) return null;
            return (
              <motion.line
                key={`${a.id}-${b.id}`}
                x1={`${a.x}%`}
                y1={`${a.y}%`}
                x2={`${b.x}%`}
                y2={`${b.y}%`}
                stroke="rgba(220,38,38,0.25)"
                strokeWidth="0.8"
                animate={{ opacity: [0.1, 0.4, 0.1] }}
                transition={{
                  duration: Math.random() * 4 + 3,
                  repeat: Infinity,
                  ease: 'easeInOut',
                  delay: Math.random() * 2,
                }}
              />
            );
          })
        )}
      </svg>
    </div>
  );
}

/** Perspective grid — angled 3D floor effect */
function PerspectiveGrid() {
  return (
    <div className="absolute inset-0 overflow-hidden" style={{ perspective: '600px' }}>
      <motion.div
        className="absolute inset-0"
        style={{
          transformOrigin: '50% 100%',
          transform: 'rotateX(60deg)',
          backgroundImage: `
            linear-gradient(rgba(220,38,38,0.15) 1px, transparent 1px),
            linear-gradient(90deg, rgba(220,38,38,0.15) 1px, transparent 1px)
          `,
          backgroundSize: '60px 60px',
          maskImage: 'linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.6) 40%, black 60%, transparent 100%)',
          WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.6) 40%, black 60%, transparent 100%)',
        }}
        animate={{ backgroundPositionY: ['0px', '60px'] }}
        transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
      />
    </div>
  );
}

/** Horizontal data streams — like Matrix but horizontal and red */
function DataStreams() {
  const streams = Array.from({ length: 8 }, (_, i) => ({
    id: i,
    y: Math.random() * 100,
    speed: Math.random() * 10 + 8,
    length: Math.random() * 40 + 20,
    delay: Math.random() * 5,
    opacity: Math.random() * 0.3 + 0.15,
  }));

  return (
    <div className="absolute inset-0 overflow-hidden">
      {streams.map((s) => (
        <motion.div
          key={s.id}
          className="absolute h-[2px]"
          style={{
            top: `${s.y}%`,
            left: 0,
            right: 0,
            background: `linear-gradient(90deg, transparent 0%, rgba(220,38,38,${s.opacity}) 20%, rgba(220,38,38,${s.opacity * 1.5}) 50%, rgba(220,38,38,${s.opacity}) 80%, transparent 100%)`,
            boxShadow: `0 0 8px rgba(220,38,38,${s.opacity * 0.8})`,
          }}
          animate={{ x: ['-100%', '100%'] }}
          transition={{
            duration: s.speed,
            repeat: Infinity,
            ease: 'linear',
            delay: s.delay,
          }}
        />
      ))}
    </div>
  );
}

/** Concentric rings that pulse outward */
function PulseRings() {
  const rings = [150, 300, 500, 700, 900];
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      {rings.map((size, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full"
          style={{
            width: size,
            height: size,
            border: '1px solid rgba(220,38,38,0.3)',
            boxShadow: `0 0 ${size / 8}px rgba(220,38,38,0.15), inset 0 0 ${size / 8}px rgba(220,38,38,0.1)`,
          }}
          animate={{
            scale: [1, 1.15, 1],
            opacity: [0.2, 0.6, 0.2],
            borderColor: [
              'rgba(220,38,38,0.2)',
              'rgba(220,38,38,0.5)',
              'rgba(220,38,38,0.2)',
            ],
          }}
          transition={{
            duration: 6,
            repeat: Infinity,
            ease: 'easeInOut',
            delay: i * 1.2,
          }}
        />
      ))}
    </div>
  );
}

/** Diagonal scan beams */
function ScanBeams() {
  return (
    <div className="absolute inset-0 overflow-hidden">
      <motion.div
        className="absolute h-[120%] w-[2px]"
        style={{
          left: '20%',
          top: '-10%',
          background: 'linear-gradient(to bottom, transparent, rgba(220,38,38,0.4), transparent)',
          boxShadow: '0 0 20px rgba(220,38,38,0.3)',
        }}
        animate={{ x: [0, 200, 0], opacity: [0, 0.8, 0] }}
        transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute h-[120%] w-[2px]"
        style={{
          left: '70%',
          top: '-10%',
          background: 'linear-gradient(to bottom, transparent, rgba(220,38,38,0.3), transparent)',
          boxShadow: '0 0 20px rgba(220,38,38,0.2)',
        }}
        animate={{ x: [0, -150, 0], opacity: [0, 0.6, 0] }}
        transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut', delay: 3 }}
      />
    </div>
  );
}

/** Corner accent brackets — tech HUD feel */
function CornerBrackets() {
  const corners = [
    { top: 0, left: 0, rotate: 0 },
    { top: 0, right: 0, rotate: 90 },
    { bottom: 0, left: 0, rotate: -90 },
    { bottom: 0, right: 0, rotate: 180 },
  ];

  return (
    <div className="absolute inset-0 pointer-events-none">
      {corners.map((c, i) => (
        <motion.div
          key={i}
          className="absolute w-12 h-12"
          style={{
            top: c.top === 0 ? '24px' : undefined,
            bottom: c.bottom === 0 ? '24px' : undefined,
            left: c.left === 0 ? '24px' : undefined,
            right: c.right === 0 ? '24px' : undefined,
            transform: `rotate(${c.rotate}deg)`,
          }}
        >
          <div className="absolute top-0 left-0 w-full h-[2px] bg-red-500/60" />
          <div className="absolute top-0 left-0 w-[2px] h-full bg-red-500/60" />
        </motion.div>
      ))}
    </div>
  );
}

/** Floating data fragments — numbers and hex codes drifting */
function DataFragments() {
  const fragments = Array.from({ length: 12 }, (_, i) => ({
    id: i,
    text: ['0x7A', '0xF3', '01', 'FF', 'A+', 'NET', 'SEC', '750', 'PASS', '0x1B', 'OK', 'DONE'][i],
    x: Math.random() * 80 + 10,
    y: Math.random() * 80 + 10,
    drift: Math.random() * 30 - 15,
    duration: Math.random() * 8 + 10,
    delay: Math.random() * 5,
  }));

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none font-mono text-[10px] text-red-500/30">
      {fragments.map((f) => (
        <motion.div
          key={f.id}
          className="absolute"
          style={{ left: `${f.x}%`, top: `${f.y}%` }}
          animate={{
            y: [0, f.drift, 0],
            opacity: [0.1, 0.35, 0.1],
          }}
          transition={{
            duration: f.duration,
            repeat: Infinity,
            ease: 'easeInOut',
            delay: f.delay,
          }}
        >
          {f.text}
        </motion.div>
      ))}
    </div>
  );
}

export default function TechBackground() {
  return (
    <div className="absolute inset-0">
      {/* Base */}
      <div className="absolute inset-0 bg-[#020617]" />

      {/* Layered effects */}
      <PerspectiveGrid />
      <DataStreams />
      <PulseRings />
      <NodeGrid />
      <ScanBeams />
      <DataFragments />
      <CornerBrackets />

      {/* Center glow */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(220,38,38,0.08)_0%,transparent_60%)]" />

      {/* Vignette */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_30%,rgba(2,6,23,0.7)_80%,rgba(2,6,23,0.95)_100%)]" />
    </div>
  );
}

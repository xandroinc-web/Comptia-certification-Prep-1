import { useEffect, useRef } from "react";

export default function TechBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let w: number, h: number;
    const dpr = window.devicePixelRatio || 1;

    function resize() {
      w = canvas!.width = canvas!.offsetWidth * dpr;
      h = canvas!.height = canvas!.offsetHeight * dpr;
      ctx!.scale(dpr, dpr);
    }

    resize();
    window.addEventListener("resize", resize);

    const cw = () => canvas!.offsetWidth;
    const ch = () => canvas!.offsetHeight;

    interface Node {
      x: number;
      y: number;
      vx: number;
      vy: number;
      radius: number;
      pulse: number;
      pulseSpeed: number;
      brightness: number;
    }

    interface DataPacket {
      from: number;
      to: number;
      progress: number;
      speed: number;
      alpha: number;
    }

    const nodes: Node[] = [];
    const nodeCount = 60;

    for (let i = 0; i < nodeCount; i++) {
      nodes.push({
        x: Math.random() * cw(),
        y: Math.random() * ch(),
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        radius: Math.random() * 2 + 1,
        pulse: Math.random() * Math.PI * 2,
        pulseSpeed: Math.random() * 0.02 + 0.01,
        brightness: Math.random() * 0.3 + 0.5,
      });
    }

    let packets: DataPacket[] = [];

    function spawnPacket() {
      const i = Math.floor(Math.random() * nodes.length);
      const j = Math.floor(Math.random() * nodes.length);
      if (i === j) return;
      const dx = nodes[i].x - nodes[j].x;
      const dy = nodes[i].y - nodes[j].y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 280) {
        packets.push({
          from: i,
          to: j,
          progress: 0,
          speed: Math.random() * 0.012 + 0.006,
          alpha: Math.random() * 0.5 + 0.5,
        });
      }
    }

    let frame = 0;
    let animId: number;

    function draw() {
      const cw2 = cw();
      const ch2 = ch();
      ctx!.clearRect(0, 0, cw2, ch2);

      // 1. Central pulsing energy core
      const centerX = cw2 / 2;
      const centerY = ch2 / 2;
      const corePulse = Math.sin(frame * 0.02) * 0.3 + 0.7;
      const coreRadius = 120 * corePulse;

      // Outer aura
      const auraGrad = ctx!.createRadialGradient(centerX, centerY, 0, centerX, centerY, coreRadius * 2);
      auraGrad.addColorStop(0, "rgba(220, 38, 38, 0.08)");
      auraGrad.addColorStop(0.5, "rgba(220, 38, 38, 0.03)");
      auraGrad.addColorStop(1, "rgba(220, 38, 38, 0)");
      ctx!.fillStyle = auraGrad;
      ctx!.fillRect(0, 0, cw2, ch2);

      // Inner core glow
      const coreGrad = ctx!.createRadialGradient(centerX, centerY, 0, centerX, centerY, coreRadius);
      coreGrad.addColorStop(0, "rgba(255, 60, 60, 0.15)");
      coreGrad.addColorStop(0.5, "rgba(220, 38, 38, 0.08)");
      coreGrad.addColorStop(1, "rgba(220, 38, 38, 0)");
      ctx!.fillStyle = coreGrad;
      ctx!.fillRect(0, 0, cw2, ch2);

      // Concentric rings
      for (let ring = 1; ring <= 3; ring++) {
        const ringRadius = coreRadius * ring * 1.8 + Math.sin(frame * 0.015 + ring) * 15;
        const ringAlpha = 0.06 * (1 - ring * 0.2) * (0.5 + Math.sin(frame * 0.02 + ring * 1.5) * 0.5);
        ctx!.beginPath();
        ctx!.arc(centerX, centerY, ringRadius, 0, Math.PI * 2);
        ctx!.strokeStyle = `rgba(220, 38, 38, ${ringAlpha})`;
        ctx!.lineWidth = 1;
        ctx!.stroke();
      }

      // 2. Hexagonal tech grid
      const hexSize = 55;
      const hexWidth = hexSize * Math.sqrt(3);
      const hexHeight = hexSize * 2;
      const rowHeight = hexHeight * 0.75;

      ctx!.strokeStyle = "rgba(220, 38, 38, 0.07)";
      ctx!.lineWidth = 0.6;

      for (let row = -1; row < ch2 / rowHeight + 1; row++) {
        for (let col = -1; col < cw2 / hexWidth + 1; col++) {
          const x = col * hexWidth + (row % 2) * (hexWidth / 2);
          const y = row * rowHeight;
          ctx!.beginPath();
          for (let i = 0; i < 6; i++) {
            const angle = (Math.PI / 3) * i - Math.PI / 6;
            const hx = x + hexSize * Math.cos(angle);
            const hy = y + hexSize * Math.sin(angle);
            if (i === 0) ctx!.moveTo(hx, hy);
            else ctx!.lineTo(hx, hy);
          }
          ctx!.closePath();
          ctx!.stroke();
        }
      }

      // 3. Neural connections
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[i].x - nodes[j].x;
          const dy = nodes[i].y - nodes[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 250) {
            const alpha = (1 - dist / 250) * 0.25;
            ctx!.strokeStyle = `rgba(220, 38, 38, ${alpha})`;
            ctx!.lineWidth = 0.7;
            ctx!.beginPath();
            ctx!.moveTo(nodes[i].x, nodes[i].y);
            ctx!.lineTo(nodes[j].x, nodes[j].y);
            ctx!.stroke();
          }
        }
      }

      // 4. Data packets
      packets = packets.filter((p) => {
        p.progress += p.speed;
        if (p.progress >= 1) return false;

        const from = nodes[p.from];
        const to = nodes[p.to];
        const x = from.x + (to.x - from.x) * p.progress;
        const y = from.y + (to.y - from.y) * p.progress;
        const alpha = p.alpha * (1 - Math.abs(p.progress - 0.5) * 1.5);

        if (alpha > 0) {
          // Trail
          const trailLen = 15;
          const angle = Math.atan2(to.y - from.y, to.x - from.x);
          const tx = x - Math.cos(angle) * trailLen;
          const ty = y - Math.sin(angle) * trailLen;
          const trailGrad = ctx!.createLinearGradient(tx, ty, x, y);
          trailGrad.addColorStop(0, `rgba(220, 38, 38, 0)`);
          trailGrad.addColorStop(1, `rgba(255, 100, 100, ${alpha * 0.6})`);
          ctx!.strokeStyle = trailGrad;
          ctx!.lineWidth = 2;
          ctx!.beginPath();
          ctx!.moveTo(tx, ty);
          ctx!.lineTo(x, y);
          ctx!.stroke();

          // Glow
          ctx!.beginPath();
          ctx!.arc(x, y, 8, 0, Math.PI * 2);
          ctx!.fillStyle = `rgba(220, 38, 38, ${alpha * 0.25})`;
          ctx!.fill();

          // Core
          ctx!.beginPath();
          ctx!.arc(x, y, 3, 0, Math.PI * 2);
          ctx!.fillStyle = `rgba(255, 120, 120, ${alpha})`;
          ctx!.fill();
        }

        return true;
      });

      if (frame % 6 === 0 && packets.length < 20) {
        spawnPacket();
      }

      // 5. Glowing network nodes
      for (const n of nodes) {
        n.x += n.vx;
        n.y += n.vy;
        n.pulse += n.pulseSpeed;

        if (n.x < -30 || n.x > cw2 + 30) n.vx *= -1;
        if (n.y < -30 || n.y > ch2 + 30) n.vy *= -1;

        const pulseR = Math.max(0.5, n.radius + Math.sin(n.pulse) * 1);
        const alpha = n.brightness * (0.6 + Math.sin(n.pulse) * 0.4);

        // Large outer glow
        ctx!.beginPath();
        ctx!.arc(n.x, n.y, pulseR * 6, 0, Math.PI * 2);
        const glowGrad = ctx!.createRadialGradient(n.x, n.y, 0, n.x, n.y, pulseR * 6);
        glowGrad.addColorStop(0, `rgba(220, 38, 38, ${alpha * 0.2})`);
        glowGrad.addColorStop(1, `rgba(220, 38, 38, 0)`);
        ctx!.fillStyle = glowGrad;
        ctx!.fill();

        // Medium glow ring
        ctx!.beginPath();
        ctx!.arc(n.x, n.y, pulseR * 2.5, 0, Math.PI * 2);
        ctx!.fillStyle = `rgba(220, 38, 38, ${alpha * 0.15})`;
        ctx!.fill();

        // Core bright dot
        ctx!.beginPath();
        ctx!.arc(n.x, n.y, pulseR * 0.8, 0, Math.PI * 2);
        ctx!.fillStyle = `rgba(255, 100, 100, ${alpha})`;
        ctx!.fill();
      }

      // 6. Scanning beam
      const scanY = ((frame * 0.35) % (ch2 + 80)) - 40;
      const scanGrad = ctx!.createLinearGradient(0, scanY - 20, 0, scanY + 20);
      scanGrad.addColorStop(0, "rgba(220, 38, 38, 0)");
      scanGrad.addColorStop(0.5, "rgba(220, 38, 38, 0.08)");
      scanGrad.addColorStop(1, "rgba(220, 38, 38, 0)");
      ctx!.fillStyle = scanGrad;
      ctx!.fillRect(0, scanY - 20, cw2, 40);

      // 7. Corner brackets
      const cornerSize = 30;
      const cornerAlpha = 0.15;
      ctx!.strokeStyle = `rgba(220, 38, 38, ${cornerAlpha})`;
      ctx!.lineWidth = 1.5;

      // Top-left
      ctx!.beginPath();
      ctx!.moveTo(20, 20 + cornerSize);
      ctx!.lineTo(20, 20);
      ctx!.lineTo(20 + cornerSize, 20);
      ctx!.stroke();

      // Top-right
      ctx!.beginPath();
      ctx!.moveTo(cw2 - 20, 20 + cornerSize);
      ctx!.lineTo(cw2 - 20, 20);
      ctx!.lineTo(cw2 - 20 - cornerSize, 20);
      ctx!.stroke();

      // Bottom-left
      ctx!.beginPath();
      ctx!.moveTo(20, ch2 - 20 - cornerSize);
      ctx!.lineTo(20, ch2 - 20);
      ctx!.lineTo(20 + cornerSize, ch2 - 20);
      ctx!.stroke();

      // Bottom-right
      ctx!.beginPath();
      ctx!.moveTo(cw2 - 20, ch2 - 20 - cornerSize);
      ctx!.lineTo(cw2 - 20, ch2 - 20);
      ctx!.lineTo(cw2 - 20 - cornerSize, ch2 - 20);
      ctx!.stroke();

      frame++;
      animId = requestAnimationFrame(draw);
    }

    draw();
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 w-full h-full pointer-events-none"
      style={{ zIndex: 0, opacity: 1 }}
    />
  );
}

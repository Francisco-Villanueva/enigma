import { useEffect, useRef } from 'react';

const COLORS = ['#e0a84b', '#f6eedc', '#4ade80', '#38bdf8', '#ef4444', '#a78bfa'];

interface Piece {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  rot: number;
  vr: number;
  color: string;
  shape: 'rect' | 'circle';
  life: number;
}

/** Two cannons from the bottom corners, then a light rain. Runs a few seconds and stops by itself. */
export function Confetti({ durationMs = 6000 }: { durationMs?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    const pieces: Piece[] = [];
    const rnd = (a: number, b: number) => a + Math.random() * (b - a);
    const spawn = (x: number, y: number, angle: number, speed: number, spread: number): Piece => {
      const a = angle + rnd(-spread, spread);
      const v = speed * rnd(0.5, 1);
      return {
        x,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        size: rnd(6, 12),
        rot: rnd(0, Math.PI * 2),
        vr: rnd(-0.3, 0.3),
        color: COLORS[Math.floor(Math.random() * COLORS.length)] as string,
        shape: Math.random() < 0.7 ? 'rect' : 'circle',
        life: 0,
      };
    };

    const w = () => window.innerWidth;
    const h = () => window.innerHeight;
    const burst = () => {
      for (let i = 0; i < 70; i++) {
        pieces.push(spawn(0, h(), -Math.PI / 3, 26, 0.35));
        pieces.push(spawn(w(), h(), (-2 * Math.PI) / 3, 26, 0.35));
      }
    };
    burst();
    const again = setTimeout(burst, 900);

    const start = performance.now();
    let last = start;
    let raf = 0;
    const frame = (now: number) => {
      const dt = Math.min(2, (now - last) / 16.67);
      last = now;
      const elapsed = now - start;
      if (elapsed < durationMs - 2000 && Math.random() < 0.5) {
        pieces.push(spawn(rnd(0, w()), -10, Math.PI / 2, 4, 0.5));
      }
      ctx.clearRect(0, 0, w(), h());
      for (let i = pieces.length - 1; i >= 0; i--) {
        const p = pieces[i] as Piece;
        p.vy += 0.35 * dt;
        p.vx *= 0.992;
        p.vy *= 0.992;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rot += p.vr * dt;
        p.life += dt;
        if (p.y > h() + 20) {
          pieces.splice(i, 1);
          continue;
        }
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        // flutter: squash the piece as it spins
        const flutter = Math.abs(Math.cos(p.life * 0.15));
        if (p.shape === 'rect') ctx.fillRect(-p.size / 2, (-p.size / 3) * flutter, p.size, (p.size * 0.66) * flutter + 1);
        else {
          ctx.beginPath();
          ctx.arc(0, 0, p.size / 3, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
      if (elapsed < durationMs || pieces.length > 0) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(again);
      window.removeEventListener('resize', resize);
    };
  }, [durationMs]);

  return <canvas ref={ref} aria-hidden="true" data-confetti className="pointer-events-none fixed inset-0 z-[80] h-full w-full" />;
}

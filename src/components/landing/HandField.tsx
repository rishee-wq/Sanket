import React, { useEffect, useRef } from 'react';
import { HAND_CONNECTIONS } from '../../lib/handDrawing';
import { ArtPose, artPoints } from '../../lib/signArt';

const POSES: ArtPose[] = ['Hello', 'Yes', '2', 'Help', 'Water', 'Doctor', 'Thank you', '3', 'SOS', 'O'];
const COLORS = ['255,154,60', '180,192,255', '244,242,239'];

interface Drifter {
  pose: ArtPose;
  x: number;
  y: number;
  size: number;
  angle: number;
  spin: number;
  vx: number;
  vy: number;
  color: string;
  phase: number;
}

/**
 * Background layer: faint hand-landmark skeletons drifting through the dark, standing in
 * for a video. Static on prefers-reduced-motion; pauses when off screen.
 */
export const HandField: React.FC<{ className?: string; density?: number }> = ({ className = '', density = 1 }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const shapes = new Map(POSES.map((p) => [p, artPoints(p).map(([x, y]) => [x - 0.5, y - 0.56] as const)]));
    let drifters: Drifter[] = [];
    let width = 0;
    let height = 0;
    let frame = 0;
    let visible = true;

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.round(Math.min(14, Math.max(6, (width * height) / 110000)) * density);
      drifters = Array.from({ length: count }, (_, i) => ({
        pose: POSES[i % POSES.length],
        x: Math.random() * width,
        y: Math.random() * height,
        size: 140 + Math.random() * 260,
        angle: (Math.random() - 0.5) * 0.9,
        spin: (Math.random() - 0.5) * 0.0006,
        vx: (Math.random() - 0.5) * 0.12,
        vy: -0.05 - Math.random() * 0.12,
        color: COLORS[i % COLORS.length],
        phase: Math.random() * Math.PI * 2,
      }));
    };

    const draw = (t: number) => {
      ctx.clearRect(0, 0, width, height);
      for (const d of drifters) {
        const pts = shapes.get(d.pose)!;
        const cos = Math.cos(d.angle);
        const sin = Math.sin(d.angle);
        const xy = pts.map(([x, y]) => [d.x + (x * cos - y * sin) * d.size, d.y + (x * sin + y * cos) * d.size]);
        const alpha = 0.16 + 0.12 * Math.sin(t / 2400 + d.phase);

        ctx.strokeStyle = `rgba(${d.color},${alpha})`;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        for (const [a, b] of HAND_CONNECTIONS) {
          ctx.moveTo(xy[a][0], xy[a][1]);
          ctx.lineTo(xy[b][0], xy[b][1]);
        }
        ctx.stroke();
        ctx.fillStyle = `rgba(${d.color},${Math.min(1, alpha * 2.4)})`;
        for (const [x, y] of xy) {
          ctx.beginPath();
          ctx.arc(x, y, 1.8, 0, Math.PI * 2);
          ctx.fill();
        }

        if (!reduced) {
          d.x += d.vx;
          d.y += d.vy;
          d.angle += d.spin;
          const m = d.size * 0.6;
          if (d.y < -m) d.y = height + m;
          if (d.x < -m) d.x = width + m;
          if (d.x > width + m) d.x = -m;
        }
      }
    };

    const loop = (t: number) => {
      if (visible) draw(t);
      if (!reduced) frame = requestAnimationFrame(loop);
    };

    resize();
    frame = requestAnimationFrame(loop);
    const ro = new ResizeObserver(() => {
      resize();
      if (reduced) draw(0);
    });
    ro.observe(canvas);
    const io = new IntersectionObserver(([entry]) => (visible = entry.isIntersecting));
    io.observe(canvas);
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      io.disconnect();
    };
  }, [density]);

  return <canvas ref={canvasRef} className={`h-full w-full ${className}`} aria-hidden="true" />;
};

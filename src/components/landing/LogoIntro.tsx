import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { MARK_DOT, MARK_PATH, MARK_STROKE, MarkGradient } from '../Logo';

/**
 * Startup animation. A point of light appears and sends out signal ripples, then sweeps
 * along the "S" like a comet, drawing the stroke with a trail of sparks. At the end it
 * blooms into the anusvara dot, a glint runs along the finished stroke and the wordmark
 * rises. When the page is ready the mark flies into the navbar logo (#nav-logo).
 */

const T = {
  spark: 250, // the point of light appears
  travel: 1050, // it moves to the start of the S
  drawStart: 1350,
  drawEnd: 2450,
  bloom: 2450, // the dot lands
  words: 2600,
  formed: 3500, // everything is complete by now
};
const MAX_MS = 9000;
const EXIT_MS = 900;
const EASE = [0.22, 0.61, 0.36, 1] as const;
const CENTER = { x: 16, y: 16.5 };
const SPARKS = 26;

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));

interface Props {
  progress: number;
  ready: boolean;
  onReveal: () => void;
}

export const LogoIntro: React.FC<Props> = ({ progress, ready, onReveal }) => {
  const born = useRef(performance.now());
  const markRef = useRef<HTMLDivElement>(null);
  const pathRef = useRef<SVGPathElement>(null);
  const strokeRef = useRef<SVGPathElement>(null);
  const headRef = useRef<SVGGElement>(null);
  const sparkRefs = useRef<(SVGCircleElement | null)[]>([]);
  const [stage, setStage] = useState<'dark' | 'spark' | 'drawn' | 'words'>('dark');
  const [leaving, setLeaving] = useState(false);
  const [flight, setFlight] = useState<{ x: number; y: number; scale: number } | null>(null);
  const [gone, setGone] = useState(false);
  const revealRef = useRef(onReveal);
  revealRef.current = onReveal;

  // Comet: one rAF loop drives the head, the drawn length and the sparks so they stay in sync.
  useEffect(() => {
    const path = pathRef.current;
    const stroke = strokeRef.current;
    const head = headRef.current;
    if (!path || !stroke || !head) return;
    const len = path.getTotalLength();
    stroke.style.strokeDasharray = `${len}`;
    stroke.style.strokeDashoffset = `${len}`;
    const start = path.getPointAtLength(0);
    const sparks = Array.from({ length: SPARKS }, () => ({ x: 0, y: 0, vx: 0, vy: 0, born: -1e9 }));
    let next = 0;
    let lastSpawn = 0;
    let frame = 0;
    const t0 = performance.now();

    const tick = (now: number) => {
      const t = now - t0;
      let x = CENTER.x;
      let y = CENTER.y;
      let headOpacity = 0;
      let drawn = 0;

      if (t >= T.spark && t < T.travel) {
        headOpacity = clamp01((t - T.spark) / 250);
      } else if (t >= T.travel && t < T.drawStart) {
        const k = easeInOut((t - T.travel) / (T.drawStart - T.travel));
        x = CENTER.x + (start.x - CENTER.x) * k;
        y = CENTER.y + (start.y - CENTER.y) * k;
        headOpacity = 1;
      } else if (t >= T.drawStart && t < T.drawEnd) {
        drawn = easeInOut((t - T.drawStart) / (T.drawEnd - T.drawStart));
        const p = path.getPointAtLength(drawn * len);
        x = p.x;
        y = p.y;
        headOpacity = 1;
        // Shed a spark every ~28 ms while drawing.
        if (now - lastSpawn > 28) {
          lastSpawn = now;
          const s = sparks[next++ % SPARKS];
          const a = Math.random() * Math.PI * 2;
          const v = 0.004 + Math.random() * 0.01;
          Object.assign(s, { x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v + 0.004, born: now });
        }
      } else if (t >= T.drawEnd) {
        drawn = 1;
        const end = path.getPointAtLength(len);
        x = end.x;
        y = end.y;
        headOpacity = 1 - clamp01((t - T.drawEnd) / 180);
      }

      head.setAttribute('transform', `translate(${x} ${y})`);
      head.style.opacity = String(headOpacity);
      stroke.style.strokeDashoffset = String(len * (1 - drawn));

      sparks.forEach((s, i) => {
        const el = sparkRefs.current[i];
        if (!el) return;
        const age = now - s.born;
        const life = 650;
        if (age > life) {
          el.style.opacity = '0';
          return;
        }
        el.setAttribute('cx', (s.x + s.vx * age).toFixed(2));
        el.setAttribute('cy', (s.y + s.vy * age).toFixed(2));
        el.setAttribute('r', (0.5 * (1 - age / life) + 0.1).toFixed(2));
        el.style.opacity = String(1 - age / life);
      });

      if (t < T.drawEnd + 900) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    const timers = [
      setTimeout(() => setStage('spark'), T.spark),
      setTimeout(() => setStage('drawn'), T.bloom),
      setTimeout(() => setStage('words'), T.words),
    ];
    return () => {
      cancelAnimationFrame(frame);
      timers.forEach(clearTimeout);
    };
  }, []);

  // Leave once the mark is formed and the page is ready (with a backstop).
  useEffect(() => {
    if (leaving) return;
    const elapsed = performance.now() - born.current;
    const wait = ready ? Math.max(0, T.formed - elapsed) : Math.max(0, MAX_MS - elapsed);
    const t = setTimeout(() => setLeaving(true), wait);
    return () => clearTimeout(t);
  }, [ready, leaving]);

  useEffect(() => {
    if (!leaving) return;
    const from = markRef.current?.getBoundingClientRect();
    const to = document.getElementById('nav-logo')?.getBoundingClientRect();
    setFlight(
      from && to && to.width > 0
        ? {
            x: to.left + to.width / 2 - (from.left + from.width / 2),
            y: to.top + to.height / 2 - (from.top + from.height / 2),
            scale: to.width / from.width,
          }
        : { x: 0, y: -40, scale: 0.6 }
    );
    revealRef.current();
    const t = setTimeout(() => setGone(true), EXIT_MS + 150);
    return () => clearTimeout(t);
  }, [leaving]);

  useEffect(() => {
    const skip = (e: KeyboardEvent) => ['Escape', 'Enter', ' '].includes(e.key) && setLeaving(true);
    window.addEventListener('keydown', skip);
    return () => window.removeEventListener('keydown', skip);
  }, []);

  if (gone) return null;
  const drawn = stage === 'drawn' || stage === 'words';

  return (
    <div className="pointer-events-none fixed inset-0 z-[250]" role="status" aria-label="Loading Sanket">
      <motion.div
        className="pointer-events-auto absolute inset-0 bg-black"
        animate={{ opacity: leaving ? 0 : 1 }}
        transition={{ duration: 0.7, delay: leaving ? 0.25 : 0, ease: EASE }}
        onClick={() => setLeaving(true)}
      />
      {/* Slow warm aurora behind everything */}
      <motion.div
        className="absolute left-1/2 top-1/2 h-[90vmin] w-[90vmin] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[conic-gradient(from_0deg,rgba(255,154,60,.18),rgba(180,192,255,.10),rgba(232,97,26,.16),rgba(255,154,60,.18))] blur-[90px]"
        initial={{ opacity: 0, rotate: 0 }}
        animate={{ opacity: leaving ? 0 : drawn ? 1 : 0.35, rotate: 120 }}
        transition={{ opacity: { duration: 1.2 }, rotate: { duration: 9, ease: 'linear' } }}
      />

      <div className="absolute inset-0 grid place-items-center">
        <div className="flex flex-col items-center">
          <motion.div
            ref={markRef}
            className="relative h-[clamp(130px,20vmin,200px)] w-[clamp(130px,20vmin,200px)]"
            animate={flight ? { x: flight.x, y: flight.y, scale: flight.scale } : undefined}
            transition={{ duration: EXIT_MS / 1000, ease: EASE }}
          >
            <svg viewBox="0 0 32 32" className="h-full w-full overflow-visible" aria-hidden="true">
              <defs>
                <MarkGradient id="intro-mark" />
                <radialGradient id="intro-glow">
                  <stop offset="0" stopColor="#fff" stopOpacity="1" />
                  <stop offset=".35" stopColor="#ffd2a8" stopOpacity=".8" />
                  <stop offset="1" stopColor="#ff9a3c" stopOpacity="0" />
                </radialGradient>
                <filter id="intro-soft" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="0.7" result="b" />
                  <feMerge>
                    <feMergeNode in="b" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>

              {/* Signal ripples from the first point of light */}
              {[0, 1, 2].map((i) => (
                <motion.circle
                  key={i}
                  cx={CENTER.x}
                  cy={CENTER.y}
                  r={2}
                  fill="none"
                  stroke="#ffd2a8"
                  strokeWidth={0.25}
                  initial={{ scale: 0.4, opacity: 0 }}
                  animate={stage === 'dark' ? undefined : { scale: [0.4, 6], opacity: [0.7, 0] }}
                  style={{ transformOrigin: `${CENTER.x}px ${CENTER.y}px` }}
                  transition={{ duration: 1.1, delay: 0.1 + i * 0.22, ease: 'easeOut' }}
                />
              ))}

              {/* Path used for geometry, and the stroke the comet draws */}
              <path ref={pathRef} d={MARK_PATH} fill="none" stroke="none" />
              <path
                ref={strokeRef}
                d={MARK_PATH}
                fill="none"
                stroke="url(#intro-mark)"
                strokeWidth={MARK_STROKE}
                strokeLinecap="round"
                filter="url(#intro-soft)"
              />
              {/* Glint that runs along the finished stroke */}
              {drawn && (
                <motion.path
                  d={MARK_PATH}
                  fill="none"
                  stroke="#ffffff"
                  strokeWidth={MARK_STROKE * 0.45}
                  strokeLinecap="round"
                  initial={{ pathLength: 0.08, pathOffset: 0, opacity: 0 }}
                  animate={{ pathOffset: 1, opacity: [0, 0.85, 0.85, 0] }}
                  transition={{ duration: 0.9, delay: 0.25, ease: 'easeInOut' }}
                />
              )}

              {/* Sparks */}
              {Array.from({ length: SPARKS }, (_, i) => (
                <circle key={i} ref={(el) => void (sparkRefs.current[i] = el)} r={0} fill="#ffe2c4" style={{ opacity: 0 }} />
              ))}

              {/* Comet head */}
              <g ref={headRef} style={{ opacity: 0 }}>
                <circle r={3.2} fill="url(#intro-glow)" />
                <circle r={0.9} fill="#fff" />
              </g>

              {/* Anusvara dot blooms in */}
              {drawn && (
                <>
                  <motion.circle
                    cx={MARK_DOT.cx}
                    cy={MARK_DOT.cy}
                    r={MARK_DOT.r}
                    fill="url(#intro-glow)"
                    initial={{ scale: 0.5, opacity: 1 }}
                    animate={{ scale: 4, opacity: 0 }}
                    style={{ transformOrigin: `${MARK_DOT.cx}px ${MARK_DOT.cy}px` }}
                    transition={{ duration: 0.7, ease: 'easeOut' }}
                  />
                  <motion.circle
                    {...MARK_DOT}
                    fill="#ffffff"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    style={{ transformOrigin: `${MARK_DOT.cx}px ${MARK_DOT.cy}px` }}
                    transition={{ type: 'spring', stiffness: 420, damping: 14 }}
                  />
                </>
              )}
            </svg>
          </motion.div>

          {/* Wordmark */}
          <motion.div
            className="mt-8 flex flex-col items-center"
            animate={{ opacity: leaving ? 0 : 1, y: leaving ? -8 : 0 }}
            transition={{ duration: 0.35 }}
          >
            <div className="flex overflow-hidden font-serif text-[clamp(44px,6.4vw,72px)] leading-[1.05]" aria-label="Sanket">
              {'Sanket'.split('').map((ch, i) => (
                <motion.span
                  key={i}
                  className={i >= 3 ? 'text-saffron' : 'text-ink'}
                  initial={{ y: '110%', rotate: 8 }}
                  animate={stage === 'words' ? { y: 0, rotate: 0 } : undefined}
                  transition={{ delay: i * 0.05, duration: 0.75, ease: EASE }}
                  aria-hidden="true"
                >
                  {ch}
                </motion.span>
              ))}
            </div>
            <motion.p
              className="mt-3 flex items-center gap-3 text-[11px] uppercase tracking-[.28em] text-white/45"
              initial={{ opacity: 0, letterSpacing: '0.6em', filter: 'blur(6px)' }}
              animate={stage === 'words' ? { opacity: 1, letterSpacing: '0.28em', filter: 'blur(0px)' } : undefined}
              transition={{ delay: 0.35, duration: 0.9, ease: EASE }}
            >
              <span className="font-deva text-sm normal-case tracking-normal text-white/65">संकेत</span>
              <span className="h-px w-6 bg-white/25" />
              Where hands speak
            </motion.p>
            <div className="mt-7 h-px w-[clamp(120px,16vw,200px)] overflow-hidden bg-white/10">
              <div
                className="h-full origin-left bg-gradient-to-r from-glow to-saffron"
                style={{ transform: `scaleX(${leaving ? 1 : progress})`, transition: 'transform .5s ease' }}
              />
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
};

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';

/**
 * Startup animation: the Sanket mark forms itself. Twenty-one hand-landmark points drift
 * in and converge (five become fingertips, the rest the palm), the five finger rays draw
 * out of the palm, the wordmark rises, and a hairline shows loading. When the page is
 * ready the mark flies into the navbar logo (#nav-logo) while the page fades in.
 */

const PALM = { x: 16, y: 22 };
const TIPS = [
  { x: 9, y: 9.5 },
  { x: 13.5, y: 6 },
  { x: 18.5, y: 5.5 },
  { x: 23, y: 8 },
  { x: 26.5, y: 15 },
];
const FORM_MS = 2700; // the mark and wordmark are complete by now
const MAX_MS = 9000; // never hold the page longer than this
const EXIT_MS = 900;
const EASE = [0.22, 0.61, 0.36, 1] as const;

interface Props {
  /** 0..1 loading progress of the page assets. */
  progress: number;
  ready: boolean;
  /** Called when the exit starts, so the page can begin its own entrance underneath. */
  onReveal: () => void;
}

export const LogoIntro: React.FC<Props> = ({ progress, ready, onReveal }) => {
  const born = useRef(performance.now());
  const markRef = useRef<HTMLDivElement>(null);
  const [leaving, setLeaving] = useState(false);
  const [flight, setFlight] = useState<{ x: number; y: number; scale: number } | null>(null);
  const [gone, setGone] = useState(false);
  const revealRef = useRef(onReveal);
  revealRef.current = onReveal;

  // Scattered start positions for the 21 points, stable for this mount.
  const particles = useMemo(
    () =>
      Array.from({ length: 21 }, (_, i) => {
        const angle = (i / 21) * Math.PI * 2 + Math.random() * 0.6;
        const r = 26 + Math.random() * 22;
        const target = i < 5 ? TIPS[i] : PALM;
        return { i, fromX: 16 + Math.cos(angle) * r, fromY: 16 + Math.sin(angle) * r, target, tip: i < 5 };
      }),
    []
  );

  useEffect(() => {
    if (leaving) return;
    const elapsed = performance.now() - born.current;
    const wait = ready ? Math.max(0, FORM_MS - elapsed) : Math.max(0, MAX_MS - elapsed);
    const t = setTimeout(() => setLeaving(true), wait);
    return () => clearTimeout(t);
  }, [ready, leaving]);

  useEffect(() => {
    if (!leaving) return;
    // Fly the mark onto the navbar logo if it is on screen; otherwise just shrink away.
    const from = markRef.current?.getBoundingClientRect();
    const to = document.getElementById('nav-logo')?.getBoundingClientRect();
    if (from && to && to.width > 0) {
      setFlight({
        x: to.left + to.width / 2 - (from.left + from.width / 2),
        y: to.top + to.height / 2 - (from.top + from.height / 2),
        scale: to.width / from.width,
      });
    } else {
      setFlight({ x: 0, y: -40, scale: 0.6 });
    }
    revealRef.current();
    const t = setTimeout(() => setGone(true), EXIT_MS + 150);
    return () => clearTimeout(t);
  }, [leaving]);

  useEffect(() => {
    const skip = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') setLeaving(true);
    };
    window.addEventListener('keydown', skip);
    return () => window.removeEventListener('keydown', skip);
  }, []);

  if (gone) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[250]" role="status" aria-label="Loading Sanket">
      <motion.div
        className="pointer-events-auto absolute inset-0 bg-black"
        animate={{ opacity: leaving ? 0 : 1 }}
        transition={{ duration: 0.7, delay: leaving ? 0.25 : 0, ease: EASE }}
        onClick={() => setLeaving(true)}
      />

      <div className="absolute inset-0 grid place-items-center">
        <div className="flex flex-col items-center">
          {/* The mark */}
          <motion.div
            ref={markRef}
            className="relative h-[clamp(120px,18vmin,180px)] w-[clamp(120px,18vmin,180px)]"
            animate={flight ? { x: flight.x, y: flight.y, scale: flight.scale } : undefined}
            transition={{ duration: EXIT_MS / 1000, ease: EASE }}
          >
            <motion.div
              className="absolute inset-[-60%] rounded-full bg-[radial-gradient(circle,rgba(255,140,40,.28),transparent_62%)]"
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: leaving ? 0 : 1, scale: 1 }}
              transition={{ delay: leaving ? 0 : 0.9, duration: leaving ? 0.3 : 1.2, ease: EASE }}
            />
            <svg viewBox="0 0 32 32" className="relative h-full w-full overflow-visible" aria-hidden="true">
              <defs>
                <filter id="mark-glow" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="0.6" result="b" />
                  <feMerge>
                    <feMergeNode in="b" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>

              {/* Landmarks converging */}
              {particles.map((p) => (
                <motion.circle
                  key={p.i}
                  r={p.tip ? 0.75 : 0.5}
                  fill={p.tip ? '#ffffff' : '#ffb877'}
                  initial={{ cx: p.fromX, cy: p.fromY, opacity: 0 }}
                  animate={{
                    cx: p.target.x,
                    cy: p.target.y,
                    opacity: p.tip ? [0, 1, 1, leaving ? 0 : 1] : [0, 0.9, 0.9, 0],
                  }}
                  transition={{
                    cx: { delay: 0.15 + p.i * 0.018, duration: 0.95, ease: EASE },
                    cy: { delay: 0.15 + p.i * 0.018, duration: 0.95, ease: EASE },
                    opacity: { delay: p.i * 0.018, duration: 1.4, times: [0, 0.25, 0.75, 1] },
                  }}
                />
              ))}

              {/* Finger rays drawing out of the palm */}
              <g filter="url(#mark-glow)" stroke="#ff9a3c" strokeWidth="2.2" strokeLinecap="round" fill="none">
                {TIPS.map((t, i) => (
                  <motion.path
                    key={i}
                    d={`M16 21 L${t.x} ${t.y}`}
                    initial={{ pathLength: 0, opacity: 0 }}
                    animate={{ pathLength: 1, opacity: 1 }}
                    transition={{ delay: 1.05 + i * 0.07, duration: 0.55, ease: EASE }}
                  />
                ))}
              </g>

              {/* Palm */}
              <motion.circle
                cx={PALM.x}
                cy={PALM.y}
                r={3.4}
                fill="#f4f2ef"
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                style={{ transformOrigin: '16px 22px' }}
                transition={{ delay: 0.95, type: 'spring', stiffness: 260, damping: 16 }}
              />
            </svg>
          </motion.div>

          {/* Wordmark, tagline and loading hairline */}
          <motion.div
            className="mt-7 flex flex-col items-center"
            animate={{ opacity: leaving ? 0 : 1, y: leaving ? -8 : 0 }}
            transition={{ duration: 0.35 }}
          >
            <div className="flex overflow-hidden font-serif text-[clamp(40px,6vw,68px)] leading-[1.05] tracking-[.005em]" aria-label="Sanket">
              {'Sanket'.split('').map((ch, i) => (
                <motion.span
                  key={i}
                  className={i >= 3 ? 'text-saffron' : 'text-ink'}
                  initial={{ y: '105%' }}
                  animate={{ y: 0 }}
                  transition={{ delay: 1.45 + i * 0.055, duration: 0.7, ease: EASE }}
                  aria-hidden="true"
                >
                  {ch}
                </motion.span>
              ))}
            </div>
            <motion.p
              className="mt-3 flex items-center gap-3 text-[11px] uppercase tracking-[.28em] text-white/45"
              initial={{ opacity: 0, filter: 'blur(6px)' }}
              animate={{ opacity: 1, filter: 'blur(0px)' }}
              transition={{ delay: 1.95, duration: 0.8 }}
            >
              <span className="font-deva text-sm normal-case tracking-normal text-white/60">संकेत</span>
              <span className="h-px w-6 bg-white/25" />
              Where hands speak
            </motion.p>
            <div className="mt-7 h-px w-[clamp(120px,16vw,200px)] overflow-hidden bg-white/10">
              <div
                className="h-full origin-left bg-ink"
                style={{ transform: `scaleX(${leaving ? 1 : progress})`, transition: 'transform .5s ease' }}
              />
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
};

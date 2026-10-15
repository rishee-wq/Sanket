import React, { useEffect, useRef, useState } from 'react';
import { HAND_CONNECTIONS } from '../../lib/handDrawing';
import { artPoints } from '../../lib/signArt';

/**
 * Startup animation: 21 landmarks appear, the bones draw in, the fist opens into
 * "Hello", and नमस्ते rises underneath. Then a black veil closes and the page appears.
 */

const VIEW = 400;
const TIMELINE = {
  pointsIn: [0, 800],
  bonesIn: [550, 1350],
  open: [1500, 2300],
  wordsIn: 2000,
  close: 3150,
} as const;
const VEIL_MS = 1000;
const GONE_MS = 700;
const FINGERTIPS = new Set([4, 8, 12, 16, 20]);

const ease = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
const span = (now: number, [a, b]: readonly [number, number]) => ease((now - a) / (b - a));

/** Pose points mapped into the SVG view box, centred, with the same scale for both poses. */
function toView(pose: Parameters<typeof artPoints>[0]): [number, number][] {
  return artPoints(pose).map(([x, y]) => [(x - 0.5) * 760 + VIEW / 2, (y - 0.56) * 760 + VIEW / 2]);
}

export const IntroAnimation: React.FC<{ onReveal: () => void }> = ({ onReveal }) => {
  const [closing, setClosing] = useState(false);
  const [gone, setGone] = useState(false);
  const [removed, setRemoved] = useState(false);
  const [wordsIn, setWordsIn] = useState(false);
  const dots = useRef<(SVGCircleElement | null)[]>([]);
  const bones = useRef<(SVGLineElement | null)[]>([]);
  const revealRef = useRef(onReveal);
  revealRef.current = onReveal;
  const closingRef = useRef(false);

  const close = () => {
    if (closingRef.current) return;
    closingRef.current = true;
    setClosing(true);
    setTimeout(() => {
      revealRef.current();
      setGone(true);
      setTimeout(() => setRemoved(true), GONE_MS);
    }, VEIL_MS);
  };

  useEffect(() => {
    const fist = toView('No');
    const open = toView('Hello');
    const start = performance.now();
    let frame = 0;

    const tick = () => {
      const now = performance.now() - start;
      const m = span(now, TIMELINE.open);
      const pts = fist.map(([x, y], i) => [x + (open[i][0] - x) * m, y + (open[i][1] - y) * m] as const);

      pts.forEach(([x, y], i) => {
        const el = dots.current[i];
        if (!el) return;
        // Points appear from the wrist outward.
        const appear = span(now, [TIMELINE.pointsIn[0] + i * 28, TIMELINE.pointsIn[0] + i * 28 + 380]);
        el.setAttribute('cx', x.toFixed(2));
        el.setAttribute('cy', y.toFixed(2));
        el.setAttribute('r', ((FINGERTIPS.has(i) ? 6 : i === 0 ? 7 : 3.6) * appear).toFixed(2));
      });

      HAND_CONNECTIONS.forEach(([a, b], k) => {
        const el = bones.current[k];
        if (!el) return;
        const grow = span(now, [TIMELINE.bonesIn[0] + k * 22, TIMELINE.bonesIn[0] + k * 22 + 420]);
        const [x1, y1] = pts[a];
        const [x2, y2] = pts[b];
        el.setAttribute('x1', x1.toFixed(2));
        el.setAttribute('y1', y1.toFixed(2));
        el.setAttribute('x2', (x1 + (x2 - x1) * grow).toFixed(2));
        el.setAttribute('y2', (y1 + (y2 - y1) * grow).toFixed(2));
        el.style.opacity = grow > 0 ? '1' : '0';
      });

      if (now >= TIMELINE.wordsIn) setWordsIn(true);
      if (now >= TIMELINE.close) close();
      if (now < TIMELINE.close + VEIL_MS) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    // rAF pauses in background tabs; never let the intro hold the page hostage.
    const backstop = setTimeout(close, TIMELINE.close + 1500);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') close();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(backstop);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  if (removed) return null;

  return (
    <div
      className="fixed inset-0 z-[200] grid place-items-center overflow-hidden bg-black"
      style={{ opacity: gone ? 0 : 1, pointerEvents: gone ? 'none' : 'auto', transition: 'opacity .5s linear' }}
      aria-hidden={gone}
    >
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 h-[70vmin] w-[70vmin] -translate-x-1/2 -translate-y-1/2 rounded-full bg-saffron/15 blur-[90px] transition-opacity duration-1000"
        style={{ opacity: wordsIn ? 1 : 0.35 }}
      />

      <div className="relative flex flex-col items-center">
        <svg viewBox={`0 0 ${VIEW} ${VIEW}`} className="w-[min(62vmin,420px)] h-[min(62vmin,420px)]" aria-hidden="true">
          <defs>
            <filter id="intro-glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="5" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <g filter="url(#intro-glow)" stroke="#ff9a3c" strokeWidth="3.2" strokeLinecap="round">
            {HAND_CONNECTIONS.map((_, k) => (
              <line key={k} ref={(el) => void (bones.current[k] = el)} style={{ opacity: 0 }} />
            ))}
          </g>
          <g filter="url(#intro-glow)">
            {Array.from({ length: 21 }, (_, i) => (
              <circle
                key={i}
                ref={(el) => void (dots.current[i] = el)}
                r={0}
                fill={FINGERTIPS.has(i) || i === 0 ? '#ffffff' : '#ffb877'}
              />
            ))}
          </g>
        </svg>

        <div
          className="-mt-2 text-center transition-all duration-[1100ms] ease-[cubic-bezier(.22,.61,.36,1)]"
          style={{ opacity: wordsIn ? 1 : 0, transform: wordsIn ? 'none' : 'translateY(12px)', filter: wordsIn ? 'none' : 'blur(6px)' }}
        >
          <div className="font-deva text-[clamp(34px,6vw,58px)] leading-tight text-ink">नमस्ते</div>
          <div className="mt-1 font-serif italic text-[clamp(16px,2vw,22px)] text-[rgba(244,242,239,.6)]">Hello.</div>
        </div>
      </div>

      {/* Black veil the page is laid out under before it is revealed */}
      <div
        className="pointer-events-none absolute inset-0 bg-black"
        style={{ opacity: closing ? 1 : 0, transition: `opacity ${VEIL_MS + 150}ms ease` }}
      />

      <button
        onClick={close}
        className="absolute right-[calc(var(--pad)+var(--safe-right))] bottom-[calc(var(--pad)+var(--safe-bottom))] min-h-11 rounded-full border border-[rgba(244,242,239,.25)] px-[18px] py-[10px] text-[11px] uppercase tracking-[.18em] text-[rgba(244,242,239,.6)] backdrop-blur-[6px] transition-colors hover:border-[rgba(255,255,255,.7)] hover:text-white"
        style={{ opacity: closing ? 0 : 1 }}
      >
        Skip
      </button>
    </div>
  );
};

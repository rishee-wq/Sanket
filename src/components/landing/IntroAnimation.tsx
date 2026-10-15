import React, { useEffect, useRef, useState } from 'react';
import type { HandPose } from '../../lib/hand3d';
import type { ShapeName, Vec3 } from '../../lib/handModel';

/**
 * Startup animation: two 3D hands rise from rest, turn inwards and meet in नमस्ते while
 * the word appears underneath. Then a black veil closes and the page is revealed.
 */

const TIMELINE = { wordsIn: 2150, close: 3400 } as const;
const VEIL_MS = 1000;
const GONE_MS = 700;

interface Key {
  t: number;
  shape: ShapeName;
  at: Vec3;
  rot: Vec3;
}

// Right hand keys (the left hand mirrors them).
const KEYS: Key[] = [
  { t: 0, shape: 'rest', at: [-17, -22, 2], rot: [-20, 15, 0] },
  { t: 900, shape: 'rest', at: [-13, -8, 4], rot: [-10, 20, 0] },
  { t: 1700, shape: 'flat', at: [-8, 0, 6], rot: [-6, 55, 0] },
  { t: 2350, shape: 'flat', at: [-2.3, 2, 6], rot: [-6, 84, -8] },
];

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export const IntroAnimation: React.FC<{ onReveal: () => void }> = ({ onReveal }) => {
  const [closing, setClosing] = useState(false);
  const [gone, setGone] = useState(false);
  const [removed, setRemoved] = useState(false);
  const [wordsIn, setWordsIn] = useState(false);
  const [handsIn, setHandsIn] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
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
    let frame = 0;
    let disposed = false;
    let dispose = () => {};
    const start = performance.now();

    (async () => {
      try {
        const [{ HandStage }, { SHAPES, blendShapes }] = await Promise.all([
          import('../../lib/hand3d'),
          import('../../lib/handModel'),
        ]);
        if (disposed || !canvasRef.current || !wrapRef.current) return;
        const stage = new HandStage(canvasRef.current, {});
        dispose = () => stage.dispose();
        const { width, height } = wrapRef.current.getBoundingClientRect();
        stage.resize(width, height);
        stage.frame([0, 6, 4], 94, 0, 4);
        setHandsIn(true);

        const sample = (ms: number): HandPose => {
          const next = KEYS.findIndex((k) => k.t > ms);
          const b = KEYS[next === -1 ? KEYS.length - 1 : next];
          const a = KEYS[next === -1 ? KEYS.length - 1 : Math.max(0, next - 1)];
          const t = a === b ? 1 : ease((ms - a.t) / (b.t - a.t));
          const mix = (x: Vec3, y: Vec3): Vec3 => [x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t];
          return { shape: blendShapes(SHAPES[a.shape], SHAPES[b.shape], t), position: mix(a.at, b.at), rotation: mix(a.rot, b.rot) };
        };

        const loop = () => {
          if (disposed) return;
          frame = requestAnimationFrame(loop);
          const ms = Math.min(performance.now() - start, KEYS[KEYS.length - 1].t);
          const right = sample(ms);
          const left: HandPose = {
            ...right,
            position: [-right.position[0], right.position[1], right.position[2]],
            rotation: [right.rotation[0], -right.rotation[1], -right.rotation[2]],
          };
          stage.setPoses(right, left);
          stage.render();
        };
        loop();
      } catch {
        // No WebGL: the intro still shows the words.
      }
    })();

    const wordsTimer = setTimeout(() => setWordsIn(true), TIMELINE.wordsIn);
    const closeTimer = setTimeout(close, TIMELINE.close);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') close();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      clearTimeout(wordsTimer);
      clearTimeout(closeTimer);
      window.removeEventListener('keydown', onKey);
      dispose();
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
        <div
          ref={wrapRef}
          className="h-[min(56vmin,440px)] w-[min(80vmin,620px)] transition-opacity duration-700"
          style={{ opacity: handsIn ? 1 : 0 }}
        >
          <canvas ref={canvasRef} className="h-full w-full" aria-hidden="true" />
        </div>

        <div
          className="-mt-4 text-center transition-all duration-[1100ms] ease-[cubic-bezier(.22,.61,.36,1)]"
          style={{ opacity: wordsIn ? 1 : 0, transform: wordsIn ? 'none' : 'translateY(12px)', filter: wordsIn ? 'none' : 'blur(6px)' }}
        >
          <div className="font-deva text-[clamp(34px,6vw,58px)] leading-tight text-ink">नमस्ते</div>
          <div className="mt-1 font-serif text-[clamp(16px,2vw,22px)] italic text-[rgba(244,242,239,.6)]">Hello.</div>
        </div>
      </div>

      {/* Black veil the page is laid out under before it is revealed */}
      <div
        className="pointer-events-none absolute inset-0 bg-black"
        style={{ opacity: closing ? 1 : 0, transition: `opacity ${VEIL_MS + 150}ms ease` }}
      />

      <button
        onClick={close}
        className="absolute bottom-[calc(var(--pad)+var(--safe-bottom))] right-[calc(var(--pad)+var(--safe-right))] min-h-11 rounded-full border border-[rgba(244,242,239,.25)] px-[18px] py-[10px] text-[11px] uppercase tracking-[.18em] text-[rgba(244,242,239,.6)] backdrop-blur-[6px] transition-colors hover:border-[rgba(255,255,255,.7)] hover:text-white"
        style={{ opacity: closing ? 0 : 1 }}
      >
        Skip
      </button>
    </div>
  );
};

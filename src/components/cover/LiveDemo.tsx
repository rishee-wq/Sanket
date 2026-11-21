import React, { useEffect, useRef, useState } from 'react';
import { vocab } from '../../data/vocabulary';
import { type Exemplar, type ExemplarSet, type View, exemplarFrame, exemplarView, loadExemplars } from '../../lib/exemplars';
import { drawHands3D } from '../../lib/hand3d';

/** A short clinic conversation, signed one word at a time. */
const SCRIPT = ['hello', 'i', 'sick', 'doctor', 'thank you'];
const GAP_MS = 650;
const WINDOW = 32;

interface Slot {
  item: Exemplar;
  view: View;
}

/**
 * The cover's hero: real INCLUDE landmark recordings replayed as the skeleton
 * the model sees, inside a round terracotta "stage", with the per-frame input
 * tensor as a heat strip, the 32-frame window filling, and the words joining
 * into a sentence. Nothing is faked: these are the same test-set recordings the
 * demo stream uses.
 */
export const LiveDemo: React.FC = () => {
  const canvas = useRef<HTMLCanvasElement>(null);
  const strip = useRef<HTMLCanvasElement>(null);
  const [set, setSet] = useState<ExemplarSet | null>(null);
  const [step, setStep] = useState(0);
  const [said, setSaid] = useState(0);
  const [fill, setFill] = useState(0);

  useEffect(() => {
    loadExemplars().then(setSet, () => setSet(null));
  }, []);

  useEffect(() => {
    const c = canvas.current;
    const s = strip.current;
    if (!set || !c || !s) return;
    const ctx = c.getContext('2d');
    const sctx = s.getContext('2d');
    if (!ctx || !sctx) return;
    const slots: Slot[] = SCRIPT.flatMap((label) => {
      const item = set.byLabel.get(label);
      return item ? [{ item, view: exemplarView(set, item, 1, item.active[0], item.active[1]) }] : [];
    });
    if (!slots.length) return;

    // One fixed timeline for the whole script, so the loop has no state to drift:
    // each sign plays from just before it starts to just after it ends, then a short gap.
    const spans = slots.map(({ item }) => {
      const from = Math.max(0, item.active[0] - 6);
      const to = Math.min(item.frames - 1, item.active[1] + 4);
      return { from, to, play: ((to - from + 1) / item.fps) * 1000 };
    });
    const total = spans.reduce((t, s) => t + s.play + GAP_MS, 0);
    const t0 = performance.now();
    let raf = 0;
    let shown = -1;
    let lastFill = -1;

    const tick = (now: number) => {
      let t = (now - t0) % total;
      let index = 0;
      while (t >= spans[index].play + GAP_MS) t -= spans[index++].play + GAP_MS;
      const { item, view } = slots[index];
      const { from, to, play } = spans[index];
      if (index !== shown) {
        shown = index;
        setStep(index);
        setSaid(index);
      }
      if (t < play) {
        const frame = Math.min(to, from + Math.floor((t / 1000) * item.fps));
        const hands = exemplarFrame(set, item, frame);
        const done = frame >= item.active[1] - 2;
        // The camera orbits slowly, so the hand's real 3-D shape (MediaPipe's z) shows.
        const time = now / 1000;
        drawHands3D(
          ctx,
          hands,
          {
            cx: ((view.x0 + view.x1) / 2) * item.aspect,
            cy: (view.y0 + view.y1) / 2,
            radius: ((view.y1 - view.y0) / 2) * 1.05,
            yaw: 0.6 * Math.sin(time * 0.45),
            pitch: -0.12 + 0.1 * Math.sin(time * 0.31),
            mirror: true,
            aspect: item.aspect,
          },
          done
        );
        paintTensor(sctx, hands);
        if (done) setSaid(index + 1);
        const f = Math.round((Math.min(frame - from, WINDOW) / WINDOW) * 100);
        if (f !== lastFill) setFill((lastFill = f));
      } else {
        ctx.clearRect(0, 0, c.width, c.height);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [set]);

  const current = vocab(SCRIPT[step]);

  return (
    <figure className="relative mx-auto w-full max-w-[520px]">
      {/* The stage */}
      <div className="relative aspect-square">
        <div className="stage-ring absolute inset-0 rounded-full" aria-hidden="true" />
        <div className="absolute inset-[7%] overflow-hidden rounded-full bg-signal">
          <div className="stage-rays absolute inset-0" aria-hidden="true" />
          <canvas ref={canvas} width={560} height={560} className="relative block h-full w-full" />
          {!set && <p className="tag absolute inset-0 grid place-items-center text-ink/60">Loading recordings…</p>}
        </div>

        {/* Floating label: what the model is reading */}
        <div className="absolute left-0 top-[8%] rotate-[-4deg] rounded-[14px] border-2 border-ink bg-card px-3.5 py-2 shadow-[5px_5px_0_var(--color-ink)]">
          <p className="tag text-mute">Now reading</p>
          <p className="display text-[30px] leading-none">{current.text}</p>
          <p className="deva text-[15px] font-semibold text-signal-deep">{current.hindi}</p>
        </div>

        {/* Floating label: the honest source */}
        <div className="absolute bottom-[10%] right-0 rotate-[3deg] rounded-full border-2 border-ink bg-rail px-3 py-1.5 text-[13px] font-semibold text-white shadow-[4px_4px_0_var(--color-ink)]">
          Real INCLUDE test recording
        </div>
      </div>

      {/* What the model sees */}
      <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_150px]">
        <div>
          <p className="tag mb-1.5 text-mute">Input tensor · 2 hands × 21 points × (x, y, z)</p>
          <canvas ref={strip} width={42 * 6} height={3 * 6} className="block h-[18px] w-full rounded-[4px] border-2 border-ink [image-rendering:pixelated]" />
        </div>
        <div>
          <p className="tag mb-1.5 text-mute">Window {Math.round((fill / 100) * WINDOW)}/32 frames</p>
          <div className="h-[18px] overflow-hidden rounded-[4px] border-2 border-ink bg-card">
            <div className="h-full bg-rail transition-[width] duration-75" style={{ width: `${fill}%` }} />
          </div>
        </div>
      </div>

      <div className="mt-3 flex min-h-[50px] flex-wrap items-center gap-1.5 rounded-[14px] border-2 border-ink bg-card px-3 py-2">
        <span className="tag mr-1 text-mute">Sentence</span>
        {SCRIPT.slice(0, said).map((label) => (
          <span key={label} className="flap rounded-[6px] bg-ink px-2 py-1 text-[14px] font-bold uppercase text-paper">
            {vocab(label).text}
          </span>
        ))}
        <span className="caret ml-0.5 h-5 w-[2px] bg-ink" />
      </div>
    </figure>
  );
};

/** Each landmark relative to its wrist, scaled to the hand's size: green below zero, terracotta above. */
function paintTensor(ctx: CanvasRenderingContext2D, hands: ReturnType<typeof exemplarFrame>) {
  const cell = 6;
  ctx.fillStyle = '#fffaf3';
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  hands.slice(0, 2).forEach((hand, h) => {
    const w = hand.landmarks[0];
    let size = 1e-6;
    for (const p of hand.landmarks) size = Math.max(size, Math.hypot(p.x - w.x, p.y - w.y));
    hand.landmarks.forEach((p, i) => {
      [(p.x - w.x) / size, (p.y - w.y) / size, (p.z - w.z) / size / 0.5].forEach((v, axis) => {
        const t = Math.max(-1, Math.min(1, v));
        ctx.fillStyle = t >= 0 ? `rgba(242,107,58,${0.15 + 0.85 * t})` : `rgba(46,125,79,${0.15 + 0.85 * -t})`;
        ctx.fillRect((h * 21 + i) * cell, axis * cell, cell - 1, cell - 1);
      });
    });
  });
}

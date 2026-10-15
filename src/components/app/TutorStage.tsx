import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FlipHorizontal2, Pause, PersonStanding, Play, RotateCcw, Rotate3d } from 'lucide-react';
import { SIGN_ANIMATIONS } from '../../data/signAnimations';
import { HandStage, SKIN_TONES } from '../../lib/hand3d';
import { buildTimeline, mirrorPose, sampleTimeline } from '../../lib/signTimeline';

const LOOP_PAUSE_MS = 700;

interface Props {
  label: string;
  /** Reports the active step and the list of step captions. */
  onStep?: (index: number, captions: string[]) => void;
  className?: string;
}

/** The 3D demonstration of one sign, with floating playback controls. */
export default function TutorStage({ label, onStep, className = '' }: Props) {
  const anim = SIGN_ANIMATIONS[label];
  const timeline = useMemo(() => (anim ? buildTimeline(anim) : null), [anim]);
  const reduced = useMemo(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches, []);

  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HandStage | null>(null);
  const timeRef = useRef(0);
  const [playing, setPlaying] = useState(!reduced);
  const [slow, setSlow] = useState(false);
  const [mirrored, setMirrored] = useState(false);
  const [body, setBody] = useState(true);
  const [skin, setSkin] = useState(1);
  const [progress, setProgress] = useState(0);
  const [noGl, setNoGl] = useState(false);

  const live = useRef({ playing, slow, mirrored });
  live.current = { playing, slow, mirrored };
  const stepRef = useRef(onStep);
  stepRef.current = onStep;

  useEffect(() => {
    if (!timeline) return;
    const main = timeline.segments.reduce((b, s) => (s.end - s.moveEnd > b.end - b.moveEnd ? s : b));
    timeRef.current = reduced ? main.moveEnd : 0;
    stepRef.current?.(0, timeline.captions);
  }, [timeline, reduced]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap || !timeline) return;
    let stage: HandStage;
    try {
      stage = new HandStage(canvas, { body: true, interactive: true, skin: SKIN_TONES[skin].color });
    } catch {
      setNoGl(true);
      return;
    }
    stageRef.current = stage;
    const fit = () => {
      const { width, height } = wrap.getBoundingClientRect();
      if (width && height) stage.resize(width, height);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(wrap);

    let frame = 0;
    let last = performance.now();
    let lastStep = -1;
    let lastProgress = 0;
    const loop = (now: number) => {
      frame = requestAnimationFrame(loop);
      const dt = Math.min(64, now - last);
      last = now;
      const s = live.current;
      if (s.playing) {
        timeRef.current += dt * (s.slow ? 0.5 : 1);
        if (timeRef.current > timeline.duration + LOOP_PAUSE_MS) timeRef.current = 0;
      }
      const sample = sampleTimeline(timeline, timeRef.current);
      if (s.mirrored) stage.setPoses(mirrorPose(sample.left), mirrorPose(sample.right));
      else stage.setPoses(sample.right, sample.left);
      stage.render();
      if (sample.captionIndex !== lastStep) {
        lastStep = sample.captionIndex;
        stepRef.current?.(sample.captionIndex, timeline.captions);
      }
      if (now - lastProgress > 80) {
        lastProgress = now;
        setProgress(sample.progress);
      }
    };
    frame = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      stage.dispose();
      stageRef.current = null;
    };
  }, [timeline]);

  useEffect(() => stageRef.current?.setSkin(SKIN_TONES[skin].color), [skin]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    stage.setBodyVisible(body);
    if (body) stage.frame([-2, 8, 0], 165, 0, 6);
    else stage.frame([mirrored ? 8 : -8, 6, 10], 105, 0, 4);
  }, [body, mirrored, timeline]);

  const btn = (on: boolean) =>
    `grid h-9 w-9 place-items-center rounded-full transition-colors ${on ? 'bg-white text-black' : 'text-white/75 hover:bg-white/10 hover:text-white'}`;

  return (
    <div className={`surface relative overflow-hidden rounded-[28px] ${className}`}>
      <div ref={wrapRef} className="absolute inset-0 cursor-grab bg-[radial-gradient(ellipse_at_50%_38%,#21170f_0%,#0b0907_55%,#050505_100%)] active:cursor-grabbing">
        {noGl || !timeline ? (
          <div className="grid h-full place-items-center p-8 text-center text-sm text-white/50">
            {timeline ? '3D needs WebGL, which this browser has turned off.' : `No 3D guide for “${label}” yet.`}
          </div>
        ) : (
          <canvas ref={canvasRef} className="h-full w-full touch-none" role="img" aria-label={`3D demonstration of the sign ${label}. Drag to rotate.`} />
        )}
      </div>

      <span className="surface-glass pointer-events-none absolute left-4 top-4 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs text-white/70">
        <Rotate3d className="h-3.5 w-3.5" /> Drag to turn
      </span>

      {/* Floating controls */}
      <div className="absolute inset-x-4 bottom-4 flex flex-wrap items-center justify-between gap-3">
        <div className="surface-glass flex items-center gap-1 rounded-full p-1">
          <button onClick={() => setPlaying((p) => !p)} className={btn(false)} aria-label={playing ? 'Pause' : 'Play'}>
            {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </button>
          <button
            onClick={() => {
              timeRef.current = 0;
              setPlaying(true);
            }}
            className={btn(false)}
            aria-label="Replay"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
          <button onClick={() => setSlow((s) => !s)} className={`${btn(slow)} w-auto px-3 font-mono text-xs`} aria-pressed={slow} title="Slow motion">
            {slow ? '0.5×' : '1×'}
          </button>
          <span className="mx-1 h-5 w-px bg-white/15" />
          <button onClick={() => setMirrored((m) => !m)} className={btn(mirrored)} aria-pressed={mirrored} title="Left-handed view" aria-label="Left-handed view">
            <FlipHorizontal2 className="h-4 w-4" />
          </button>
          <button onClick={() => setBody((b) => !b)} className={btn(body)} aria-pressed={body} title="Show body for location" aria-label="Show body">
            <PersonStanding className="h-4 w-4" />
          </button>
          <button onClick={() => stageRef.current?.resetView()} className={btn(false)} title="Reset view" aria-label="Reset view">
            <Rotate3d className="h-4 w-4" />
          </button>
        </div>
        <div className="surface-glass flex items-center gap-1.5 rounded-full px-2.5 py-2" role="radiogroup" aria-label="Skin tone">
          {SKIN_TONES.map((t, i) => (
            <button
              key={t.name}
              role="radio"
              aria-checked={skin === i}
              aria-label={`${t.name} skin tone`}
              onClick={() => setSkin(i)}
              className={`h-5 w-5 rounded-full ring-2 ring-offset-2 ring-offset-black/60 transition ${skin === i ? 'ring-white' : 'ring-transparent'}`}
              style={{ background: t.color }}
            />
          ))}
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-0 h-[3px] bg-white/[.04]">
        <div className="h-full bg-saffron" style={{ width: `${progress * 100}%` }} />
      </div>
    </div>
  );
}

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pause, Play, RotateCcw, Rotate3d, FlipHorizontal2, PersonStanding, Video, Box, Info } from 'lucide-react';
import { SIGN_ANIMATIONS } from '../data/signAnimations';
import { HandStage, SKIN_TONES } from '../lib/hand3d';
import { buildTimeline, mirrorPose, sampleTimeline } from '../lib/signTimeline';

const SPEEDS = [1, 0.5] as const;
const LOOP_PAUSE_MS = 700;

/** 3D animated guide for one sign: drag to orbit, step captions, slow motion, left-hand mirror. */
export default function SignTutor({ label }: { label: string }) {
  const anim = SIGN_ANIMATIONS[label];
  const timeline = useMemo(() => (anim ? buildTimeline(anim) : null), [anim]);
  const reducedMotion = useMemo(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches, []);

  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HandStage | null>(null);
  const timeRef = useRef(0);

  const [playing, setPlaying] = useState(!reducedMotion);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const [mirrored, setMirrored] = useState(false);
  const [showBody, setShowBody] = useState(true);
  const [skin, setSkin] = useState(1);
  const [captionIndex, setCaptionIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [view, setView] = useState<'3d' | 'video'>('3d');
  const [webglError, setWebglError] = useState(false);

  // Latest settings for the render loop.
  const settings = useRef({ playing, speed, mirrored });
  settings.current = { playing, speed, mirrored };

  // Restart when the sign changes; with reduced motion, show the main pose instead.
  useEffect(() => {
    if (!timeline) return;
    const main = timeline.segments.reduce((best, s) => (s.end - s.moveEnd > best.end - best.moveEnd ? s : best));
    timeRef.current = reducedMotion ? main.moveEnd : 0;
    setView('3d');
  }, [timeline, reducedMotion]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap || !timeline || view !== '3d') return;

    let stage: HandStage;
    try {
      stage = new HandStage(canvas, { body: true, interactive: true, skin: SKIN_TONES[skin].color });
    } catch {
      setWebglError(true);
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
    let lastCaption = -1;
    let lastProgressAt = 0;
    const loop = (now: number) => {
      frame = requestAnimationFrame(loop);
      const dt = Math.min(64, now - last);
      last = now;
      const s = settings.current;
      if (s.playing) {
        timeRef.current += dt * s.speed;
        if (timeRef.current > timeline.duration + LOOP_PAUSE_MS) timeRef.current = 0;
      }
      const sample = sampleTimeline(timeline, timeRef.current);
      if (s.mirrored) stage.setPoses(mirrorPose(sample.left), mirrorPose(sample.right));
      else stage.setPoses(sample.right, sample.left);
      stage.render();

      if (sample.captionIndex !== lastCaption) {
        lastCaption = sample.captionIndex;
        setCaptionIndex(sample.captionIndex);
      }
      if (now - lastProgressAt > 80) {
        lastProgressAt = now;
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
  }, [timeline, view]);

  useEffect(() => stageRef.current?.setSkin(SKIN_TONES[skin].color), [skin]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    stage.setBodyVisible(showBody);
    // Whole signer in view with the body; a closer look at the hand without it.
    if (showBody) stage.frame([-2, 8, 0], 165, 0, 6);
    else stage.frame([mirrored ? 8 : -8, 6, 10], 105, 0, 4);
  }, [showBody, mirrored, view, timeline]);

  if (!anim || !timeline) {
    return (
      <div className="grid aspect-[4/3] place-items-center rounded-2xl border border-white/[.08] bg-black/60 p-6 text-center text-sm text-white/50">
        No 3D guide for “{label}” yet.
      </div>
    );
  }

  const replay = () => {
    timeRef.current = 0;
    setPlaying(true);
  };

  const iconBtn =
    'flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition-colors border';
  const off = 'border-white/[.08] bg-white/[.03] text-white/70 hover:text-white hover:bg-white/[.06]';
  const on = 'border-indigo-400/50 bg-indigo-500/15 text-indigo-200';

  return (
    <div className="overflow-hidden rounded-2xl border border-white/[.08] bg-black/60">
      <div
        ref={wrapRef}
        className="relative aspect-[4/3] w-full cursor-grab active:cursor-grabbing bg-[radial-gradient(ellipse_at_50%_35%,#1d1510_0%,#0a0806_55%,#020617_100%)]"
      >
        {view === '3d' ? (
          webglError ? (
            <div className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-white/50">
              3D needs WebGL, which this browser has turned off.
            </div>
          ) : (
            <canvas
              ref={canvasRef}
              className="absolute inset-0 h-full w-full touch-none"
              aria-label={`3D animation of the sign ${label}. Drag to rotate.`}
              role="img"
            />
          )
        ) : (
          <video
            key={anim.videoUrl}
            src={anim.videoUrl}
            className="absolute inset-0 h-full w-full object-contain"
            autoPlay={!reducedMotion}
            loop
            muted
            playsInline
            controls
          />
        )}

        <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-2">
          <span className="rounded-full border border-white/10 bg-black/50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-white/85 backdrop-blur">
            {view === '3d' ? '3D guide' : 'Reference video'}
          </span>
          {view === '3d' && (
            <span className="flex items-center gap-1 rounded-full bg-black/40 px-2 py-1 text-[11px] text-white/50 backdrop-blur">
              <Rotate3d className="h-3 w-3" /> Drag to turn
            </span>
          )}
        </div>

        {anim.videoUrl && (
          <div className="absolute right-3 top-3 flex rounded-lg border border-white/10 bg-black/50 p-0.5 backdrop-blur">
            {(['3d', 'video'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                aria-pressed={view === v}
                className={`flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold ${view === v ? 'bg-white text-black' : 'text-white/70'}`}
              >
                {v === '3d' ? <Box className="h-3 w-3" /> : <Video className="h-3 w-3" />}
                {v === '3d' ? '3D' : 'Video'}
              </button>
            ))}
          </div>
        )}

        {/* Progress */}
        {view === '3d' && (
          <div className="absolute inset-x-0 bottom-0 h-1 bg-white/5">
            <div className="h-full bg-indigo-400/80" style={{ width: `${progress * 100}%` }} />
          </div>
        )}
      </div>

      {view === '3d' && (
        <>
          {/* Steps */}
          <ol className="space-y-1.5 border-t border-white/[.08] px-4 py-3" aria-live="polite">
            {timeline.captions.map((c, i) => (
              <li
                key={c}
                className={`flex gap-2.5 text-[13px] leading-snug transition-colors ${
                  i === captionIndex ? 'text-white' : 'text-white/40'
                }`}
              >
                <span
                  className={`mt-px grid h-5 w-5 shrink-0 place-items-center rounded-full font-mono text-[10px] ${
                    i === captionIndex ? 'bg-indigo-400 text-black' : 'bg-white/[.06] text-white/50'
                  }`}
                >
                  {i + 1}
                </span>
                {c}
              </li>
            ))}
          </ol>

          {/* Controls */}
          <div className="flex flex-wrap items-center gap-1.5 border-t border-white/[.08] px-3 py-2.5">
            <button onClick={() => setPlaying((p) => !p)} className={`${iconBtn} ${off}`} aria-label={playing ? 'Pause' : 'Play'}>
              {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            </button>
            <button onClick={replay} className={`${iconBtn} ${off}`} aria-label="Replay from the start">
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setSpeed((s) => (s === 1 ? 0.5 : 1))}
              aria-pressed={speed === 0.5}
              className={`${iconBtn} ${speed === 0.5 ? on : off} font-mono`}
              title="Slow motion"
            >
              {speed === 0.5 ? '0.5×' : '1×'}
            </button>
            <button
              onClick={() => setMirrored((m) => !m)}
              aria-pressed={mirrored}
              className={`${iconBtn} ${mirrored ? on : off}`}
              title="Show the sign for a left-handed signer"
            >
              <FlipHorizontal2 className="h-3.5 w-3.5" /> Left-handed
            </button>
            <button
              onClick={() => setShowBody((b) => !b)}
              aria-pressed={showBody}
              className={`${iconBtn} ${showBody ? on : off}`}
              title="Show where the sign is made relative to the body"
            >
              <PersonStanding className="h-3.5 w-3.5" /> Body
            </button>
            <button onClick={() => stageRef.current?.resetView()} className={`${iconBtn} ${off}`} title="Reset the view">
              <Rotate3d className="h-3.5 w-3.5" />
            </button>
            <div className="ml-auto flex items-center gap-1.5" role="radiogroup" aria-label="Skin tone">
              {SKIN_TONES.map((t, i) => (
                <button
                  key={t.name}
                  role="radio"
                  aria-checked={skin === i}
                  aria-label={`${t.name} skin tone`}
                  onClick={() => setSkin(i)}
                  className={`h-5 w-5 rounded-full border-2 transition-transform ${skin === i ? 'scale-110 border-white' : 'border-transparent'}`}
                  style={{ background: t.color }}
                />
              ))}
            </div>
          </div>

          {!anim.reviewed && (
            <p className="flex gap-2 border-t border-white/[.08] px-4 py-2.5 text-[11px] leading-relaxed text-white/40">
              <Info className="mt-px h-3.5 w-3.5 shrink-0" />
              Shows the hand shape Sanket's demo recognises. Not yet reviewed by an ISL signer; check the ISLRTC dictionary for
              the full sign.
            </p>
          )}
        </>
      )}
    </div>
  );
}

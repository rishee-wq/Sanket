import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FlipHorizontal2, Gauge, Pause, Play, RotateCcw, ScanLine } from 'lucide-react';
import { CLIP_BASE, type Clip, loadClips } from '../../lib/clips';
import { type ExemplarSet, exemplarFrame, loadExemplars } from '../../lib/exemplars';
import { ON_VIDEO, drawHands } from '../../lib/handDrawing';
import { SKIN_TONES, drawFigure, handsBounds } from '../../lib/handIllustration';

export function useTeachingData() {
  const [clips, setClips] = useState<Record<string, Clip> | null>(null);
  const [exemplars, setExemplars] = useState<ExemplarSet | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    loadClips().then(setClips, () => setError(true));
    loadExemplars().then(setExemplars, () => setError(true));
  }, []);
  return { clips, exemplars, error };
}

const Toggle: React.FC<{ on: boolean; onClick: () => void; icon: React.FC<{ className?: string }>; label: string }> = ({
  on,
  onClick,
  icon: Icon,
  label,
}) => (
  <button className={`btn btn-sm ${on ? 'btn-ink' : ''}`} onClick={onClick} aria-pressed={on}>
    <Icon className="h-4 w-4" /> {label}
  </button>
);

interface WordProps {
  label: string;
  clip: Clip;
  exemplars: ExemplarSet | null;
  /** Called when the clip reaches its end (used to chain sentence clips). */
  onEnded?: () => void;
  loop?: boolean;
  autoPlay?: boolean;
  caption?: React.ReactNode;
}

/**
 * The real signer, cropped to the upper body and cut to the sign. Slow motion,
 * mirror, key frames, and an optional overlay of the 21 points per hand the
 * model reads, drawn in sync with the video.
 */
export const WordTeacher: React.FC<WordProps> = ({ label, clip, exemplars, onEnded, loop = true, autoPlay = true, caption }) => {
  const video = useRef<HTMLVideoElement>(null);
  const overlay = useRef<HTMLCanvasElement>(null);
  const [slow, setSlow] = useState(false);
  const [mirror, setMirror] = useState(false);
  const [points, setPoints] = useState(false);
  const [playing, setPlaying] = useState(autoPlay);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (video.current) video.current.playbackRate = slow ? 0.45 : 1;
  }, [slow, clip]);

  // Keep the progress bar and the landmark overlay in step with the video.
  useEffect(() => {
    let raf = 0;
    const item = exemplars?.byLabel.get(label);
    const tick = () => {
      const v = video.current;
      const canvas = overlay.current;
      if (v && v.duration) setProgress(v.currentTime / v.duration);
      if (v && canvas && points && item && exemplars) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const frame = clip.start + Math.round(v.currentTime * clip.fps);
          const [x0, y0, x1, y1] = clip.crop;
          drawHands(ctx, exemplarFrame(exemplars, item, frame), false, false, ON_VIDEO, { x0, y0, x1, y1 });
        }
      } else canvas?.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [clip, exemplars, label, points]);

  const seekTo = (k: number) => {
    const v = video.current;
    if (!v || !v.duration) return;
    v.pause();
    setPlaying(false);
    // Same moments as the stills (ml/export_clips.py): 15%, 50% and 85% through the sign.
    const item = exemplars?.byLabel.get(label);
    const [a0, a1] = item?.active ?? [clip.start, clip.end];
    const frame = a0 + [0.15, 0.5, 0.85][k] * (a1 - a0);
    v.currentTime = Math.max(0, Math.min(v.duration - 0.01, (frame - clip.start) / clip.fps));
  };

  const toggle = () => {
    const v = video.current;
    if (!v) return;
    if (v.paused) {
      v.play();
      setPlaying(true);
    } else {
      v.pause();
      setPlaying(false);
    }
  };

  return (
    <div>
      <div className="relative overflow-hidden rounded-md border-2 border-ink bg-night">
        <div className={`relative aspect-[3/4] max-h-[62vh] w-full ${mirror ? '-scale-x-100' : ''}`}>
          <video
            key={clip.video}
            ref={video}
            src={CLIP_BASE + clip.video}
            muted
            playsInline
            autoPlay={autoPlay}
            loop={loop}
            onEnded={onEnded}
            onClick={toggle}
            className="absolute inset-0 h-full w-full cursor-pointer object-contain"
            aria-label={`A signer demonstrating ${label}`}
          />
          <canvas ref={overlay} width={384} height={512} className="pointer-events-none absolute inset-0 h-full w-full object-contain" aria-hidden="true" />
        </div>
        <span className="chip absolute left-2.5 top-2.5 border-signal bg-night text-signal">Real signer{slow ? ' · slow motion' : ''}</span>
        {caption && <div className="absolute inset-x-2.5 bottom-3.5">{caption}</div>}
        <div className="absolute inset-x-0 bottom-0 h-1.5 bg-night/60">
          <div className="h-full bg-signal" style={{ width: `${progress * 100}%` }} />
        </div>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        <button className="btn btn-sm btn-signal" onClick={toggle}>
          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />} {playing ? 'Pause' : 'Play'}
        </button>
        <Toggle on={slow} onClick={() => setSlow((s) => !s)} icon={Gauge} label="Slow" />
        <Toggle on={mirror} onClick={() => setMirror((m) => !m)} icon={FlipHorizontal2} label="Mirror" />
        <Toggle on={points} onClick={() => setPoints((p) => !p)} icon={ScanLine} label="What the model sees" />
      </div>

      <div className="mt-3">
        <p className="tag mb-1.5 text-mute">Key moments · tap to pause there</p>
        <div className="grid grid-cols-3 gap-2">
          {clip.frames.map((f, k) => (
            <button key={f} onClick={() => seekTo(k)} className="overflow-hidden rounded border-2 border-ink bg-night text-left">
              <img src={CLIP_BASE + f} alt="" className={`aspect-[3/4] w-full object-cover ${mirror ? '-scale-x-100' : ''}`} loading="lazy" />
              <span className="tag block bg-card px-1.5 py-1">{['1 · Start', '2 · Middle', '3 · End'][k]}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

/**
 * A letter or digit as a solid hand. Drag to turn it; it sways gently on its
 * own so the depth is visible.
 */
export const LetterTeacher: React.FC<{ label: string; exemplars: ExemplarSet }> = ({ label, exemplars }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [mirror, setMirror] = useState(false);
  const [skin, setSkin] = useState(1);
  const angle = useRef({ yaw: 0, pitch: 0, dragging: false, x: 0, y: 0, touched: false });
  const item = exemplars.byLabel.get(label);
  const hands = useMemo(() => (item ? exemplarFrame(exemplars, item, 0) : []), [exemplars, item]);
  const bounds = useMemo(() => handsBounds([hands], item?.aspect ?? 1), [hands, item]);

  useEffect(() => {
    angle.current = { yaw: 0, pitch: 0, dragging: false, x: 0, y: 0, touched: false };
  }, [label]);

  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx || !item) return;
    let raf = 0;
    const start = performance.now();
    const tick = () => {
      const a = angle.current;
      const sway = a.touched ? 0 : Math.sin((performance.now() - start) / 1400) * 0.32;
      drawFigure(ctx, hands, bounds, { yaw: a.yaw + sway, pitch: a.pitch, mirror, skin: SKIN_TONES[skin], aspect: item.aspect });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [hands, bounds, mirror, skin, item]);

  if (!item) return <p className="plate p-4 text-[15px] text-mute">No recording for this sign.</p>;

  return (
    <div>
      <div
        className="dots relative aspect-[4/3] w-full touch-none overflow-hidden rounded-md border-2 border-ink bg-card"
        onPointerDown={(e) => {
          Object.assign(angle.current, { dragging: true, x: e.clientX, y: e.clientY, touched: true });
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const a = angle.current;
          if (!a.dragging) return;
          a.yaw += (e.clientX - a.x) * 0.012;
          a.pitch = Math.max(-1.2, Math.min(1.2, a.pitch + (e.clientY - a.y) * 0.012));
          a.x = e.clientX;
          a.y = e.clientY;
        }}
        onPointerUp={() => (angle.current.dragging = false)}
      >
        <canvas ref={canvasRef} width={900} height={675} className="absolute inset-0 h-full w-full cursor-grab active:cursor-grabbing" aria-label={`Hand shape for ${label}. Drag to turn it.`} />
        <span className="chip absolute left-2.5 top-2.5 bg-card">Drag to turn the hand</span>
        <span className="chip absolute right-2.5 top-2.5 bg-card">{hands.length === 2 ? 'Two hands' : 'One hand'}</span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <button className="btn btn-sm" onClick={() => Object.assign(angle.current, { yaw: 0, pitch: 0, touched: true })}>
          <RotateCcw className="h-4 w-4" /> Face on
        </button>
        <Toggle on={mirror} onClick={() => setMirror((m) => !m)} icon={FlipHorizontal2} label="Mirror" />
        <span className="ml-auto flex items-center gap-1" role="radiogroup" aria-label="Skin tone">
          {SKIN_TONES.map((tone, i) => (
            <button
              key={tone}
              role="radio"
              aria-checked={skin === i}
              aria-label={`Skin tone ${i + 1}`}
              onClick={() => setSkin(i)}
              className={`h-7 w-7 rounded border-2 border-ink ${skin === i ? 'ring-2 ring-ink ring-offset-2 ring-offset-paper' : ''}`}
              style={{ background: tone }}
            />
          ))}
        </span>
      </div>
    </div>
  );
};

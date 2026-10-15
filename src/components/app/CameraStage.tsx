import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Camera, Check, FlipHorizontal2, Hand, Pause, Play } from 'lucide-react';
import { useCamera } from '../../hooks/useCamera';
import { useHandLandmarker } from '../../hooks/useHandLandmarker';
import { LiveState, PipelineStats, useRecognition } from '../../hooks/useRecognition';
import type { Prediction, Predictor } from '../../lib/predictor';
import { SIMULATED_POSES, SimulatedPose } from '../../lib/simulatedPoses';
import { soundEffects } from '../../services/soundEffects';

interface Props {
  predictor: Predictor | null;
  onSignAccepted: (prediction: Prediction) => void;
  onLive?: (live: LiveState) => void;
  /** Show the sign capsule and metrics. Learn mode shows its own score instead. */
  hud?: 'full' | 'minimal';
  /** Urgent hint shown across the top of the stage. */
  notice?: string;
  className?: string;
}

const EASE = [0.22, 0.61, 0.36, 1] as const;

/** Circular hold-to-accept ring around a check mark. */
const HoldRing: React.FC<{ progress: number; done: boolean }> = ({ progress, done }) => {
  const R = 17;
  const C = 2 * Math.PI * R;
  return (
    <span className="relative grid h-11 w-11 shrink-0 place-items-center">
      <svg viewBox="0 0 40 40" className="absolute inset-0 -rotate-90" aria-hidden="true">
        <circle cx="20" cy="20" r={R} fill="none" stroke="rgba(255,255,255,.12)" strokeWidth="2.5" />
        <circle
          cx="20"
          cy="20"
          r={R}
          fill="none"
          stroke={done ? '#ffffff' : '#ff9a3c'}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={C * (1 - progress)}
          style={{ transition: 'stroke-dashoffset .12s linear' }}
        />
      </svg>
      <AnimatePresence>
        {done && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
            className="grid h-7 w-7 place-items-center rounded-full bg-white text-black"
          >
            <Check className="h-4 w-4" strokeWidth={3} />
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
};

export const CameraStage: React.FC<Props> = ({ predictor, onSignAccepted, onLive, hud = 'full', notice, className = '' }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [pose, setPose] = useState<SimulatedPose | null>(null);
  const [simOpen, setSimOpen] = useState(false);
  const [flash, setFlash] = useState(0);
  const camera = useCamera(videoRef);
  const landmarker = useHandLandmarker();

  const handleAccept = useCallback(
    (p: Prediction) => {
      soundEffects.playAccepted();
      navigator.vibrate?.(60);
      setFlash((n) => n + 1);
      onSignAccepted(p);
    },
    [onSignAccepted]
  );

  const { live, stats } = useRecognition({
    videoRef,
    canvasRef,
    cameraActive: camera.isActive,
    mirrored: camera.facingMode === 'user',
    detect: landmarker.detect,
    predictor,
    simulatedPose: pose,
    onAccept: handleAccept,
  });

  useEffect(() => {
    onLive?.(live);
  }, [live, onLive]);

  useEffect(() => {
    camera.start();
  }, []);

  const p = live.prediction;
  const holding = !!p && live.candidate === p.label;
  const done = holding && live.progress >= 1;
  const showFeed = camera.isActive || pose;
  const status =
    landmarker.status === 'loading'
      ? 'Starting hand tracking'
      : landmarker.status === 'error'
      ? 'Hand tracking unavailable'
      : live.handsCount > 0
      ? `${live.handsCount} hand${live.handsCount > 1 ? 's' : ''} in view`
      : showFeed
      ? 'Show your hand'
      : 'Camera off';

  return (
    <div className={`surface relative overflow-hidden rounded-[28px] bg-[#050505] ${className}`}>
      <video
        ref={videoRef}
        playsInline
        muted
        className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ${
          camera.facingMode === 'user' ? '-scale-x-100' : ''
        } ${camera.isActive && !pose ? 'opacity-100' : 'opacity-0'}`}
      />
      <canvas ref={canvasRef} width={640} height={480} className="pointer-events-none absolute inset-0 h-full w-full object-cover" />
      {/* Soft vignette so the HUD reads on any background */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_55%,rgba(0,0,0,.55))]" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-black/70 to-transparent" />

      {/* Accepted pulse */}
      <AnimatePresence>
        {flash > 0 && (
          <motion.div
            key={flash}
            initial={{ opacity: 0.9 }}
            animate={{ opacity: 0 }}
            transition={{ duration: 0.8 }}
            className="pointer-events-none absolute inset-0 rounded-[28px] shadow-[inset_0_0_0_3px_#ff9a3c,inset_0_0_80px_rgba(255,154,60,.35)]"
          />
        )}
      </AnimatePresence>

      {/* Urgent notice */}
      <AnimatePresence>
        {notice && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute inset-x-4 top-16 z-10 flex justify-center"
            role="alert"
          >
            <span className="flex items-center gap-2.5 rounded-full bg-rose-500/90 px-4 py-2 text-sm font-medium text-white shadow-[0_10px_40px_-10px_rgba(244,63,94,.8)] backdrop-blur">
              <span className="h-2 w-2 animate-pulse rounded-full bg-white" />
              {notice}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Camera off */}
      {!showFeed && (
        <div className="absolute inset-0 grid place-items-center p-8 text-center">
          <div className="max-w-sm">
            <div className="mx-auto mb-6 hidden h-16 w-16 place-items-center rounded-full border border-white/10 bg-white/[.03] sm:grid">
              <Camera className="h-6 w-6 text-white/60" />
            </div>
            <p className="font-serif text-3xl">Camera is off</p>
            <p className="mt-2 text-sm text-white/50">
              {camera.error ?? 'Sanket reads your hands on this device. Video never leaves your browser.'}
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <button onClick={() => camera.start()} className="rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-black">
                Turn on camera
              </button>
              <button onClick={() => setSimOpen(true)} className="rounded-full px-4 py-2.5 text-sm text-white/60 hover:text-white">
                Try the simulator
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Top HUD */}
      <div className="absolute inset-x-4 top-4 flex items-start justify-between gap-3">
        <span className="surface-glass flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs text-white/80" role="status">
          <span className={`live-dot ${live.handsCount > 0 ? 'on' : 'opacity-40 shadow-none'}`} />
          {status}
          {pose && <span className="text-saffron">· simulator</span>}
        </span>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => (camera.isActive ? camera.stop() : camera.start())}
            aria-label={camera.isActive ? 'Pause camera' : 'Start camera'}
            className="surface-glass grid h-9 w-9 place-items-center rounded-full text-white/80 hover:text-white"
          >
            {camera.isActive ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </button>
          <button onClick={camera.flip} aria-label="Flip camera" className="surface-glass grid h-9 w-9 place-items-center rounded-full text-white/80 hover:text-white">
            <FlipHorizontal2 className="h-4 w-4" />
          </button>
          <div className="relative">
            <button
              onClick={() => setSimOpen((o) => !o)}
              aria-expanded={simOpen}
              aria-label="Pose simulator"
              className={`surface-glass grid h-9 w-9 place-items-center rounded-full hover:text-white ${pose ? 'text-saffron' : 'text-white/80'}`}
            >
              <Hand className="h-4 w-4" />
            </button>
            <AnimatePresence>
              {simOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -6, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.18 }}
                  className="surface-glass absolute right-0 top-11 z-10 w-52 rounded-2xl p-1.5"
                >
                  <p className="px-3 pb-1 pt-2 text-[10px] uppercase tracking-[.2em] text-white/40">Simulate a hand</p>
                  {[{ pose: null, label: 'Off: use camera' }, ...SIMULATED_POSES].map((s) => (
                    <button
                      key={s.label}
                      onClick={() => {
                        setPose(s.pose);
                        setSimOpen(false);
                      }}
                      className={`w-full rounded-xl px-3 py-2 text-left text-sm transition-colors hover:bg-white/[.08] ${
                        pose === s.pose ? 'text-saffron' : 'text-white/80'
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Sign capsule */}
      {hud === 'full' && (
        <div className="absolute inset-x-4 bottom-4 flex items-end justify-between gap-3">
          <AnimatePresence mode="wait">
            {p ? (
              <motion.div
                key={p.label}
                initial={{ opacity: 0, y: 12, filter: 'blur(6px)' }}
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                exit={{ opacity: 0, y: -8, filter: 'blur(6px)' }}
                transition={{ duration: 0.35, ease: EASE }}
                className="surface-glass flex items-center gap-4 rounded-full py-2 pl-2 pr-6"
                aria-live="polite"
              >
                <HoldRing progress={holding ? live.progress : 0} done={done} />
                <div>
                  <p className="font-serif text-[30px] leading-none">{p.label}</p>
                  <p className="mt-1 text-[11px] text-white/55">
                    {Math.round(p.confidence * 100)}% {p.source === 'mock' ? 'simulated' : 'confidence'} ·{' '}
                    {p.label === 'SOS'
                      ? 'Signal for Help, step 1 of 2'
                      : done
                      ? 'added, lower your hand to repeat'
                      : holding
                      ? 'hold steady'
                      : 'hold for a second'}
                  </p>
                </div>
              </motion.div>
            ) : (
              <motion.p key="none" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="pb-2 pl-1 text-sm text-white/45">
                {showFeed ? 'Hold a sign steady for a second to add it.' : ''}
              </motion.p>
            )}
          </AnimatePresence>
          <Metrics stats={stats} />
        </div>
      )}
    </div>
  );
};

const Metrics: React.FC<{ stats: PipelineStats }> = ({ stats }) =>
  stats.fps > 0 ? (
    <span className="hidden shrink-0 pb-2 font-mono text-[11px] text-white/45 sm:block">
      {Math.round(stats.fps)} fps · {(stats.detectMs + stats.inferMs).toFixed(1)} ms
    </span>
  ) : null;

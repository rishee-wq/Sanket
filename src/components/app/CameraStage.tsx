import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, CameraOff, Play, Square, SwitchCamera } from 'lucide-react';
import type { SignEngine } from '../../engine/engine';
import type { DetectedHand } from '../../engine/features';
import { useCamera } from '../../hooks/useCamera';
import { useHandLandmarker } from '../../hooks/useHandLandmarker';
import { type LoopStats, useLiveLoop, useSnapshot } from '../../hooks/useLiveLoop';
import { type Exemplar, ReplayPlayer, loadExemplars } from '../../lib/exemplars';

interface StageOptions {
  engine: SignEngine | null;
  onHands?: (hands: DetectedHand[], now: number) => void;
}

/**
 * Everything behind a camera stage: the webcam, MediaPipe, the frame loop, and
 * the demo stream (recorded landmarks replayed through the same engine).
 */
export function useStage({ engine, onHands }: StageOptions) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const camera = useCamera(videoRef);
  const landmarker = useHandLandmarker();
  const [replay, setReplay] = useState<ReplayPlayer | null>(null);
  const [replayError, setReplayError] = useState<string | null>(null);

  const stats = useLiveLoop({
    videoRef,
    canvasRef,
    cameraActive: camera.isActive && landmarker.status === 'ready',
    mirrored: camera.facingMode === 'user',
    detect: landmarker.detect,
    engine,
    replay,
    onReplayEnd: () => setReplay(null),
    onHands,
  });

  /** Plays the given signs (labels) as a demo stream. */
  const playDemo = useCallback(
    async (labels: string[], loop = false) => {
      setReplayError(null);
      try {
        const set = await loadExemplars();
        const queue = labels.map((l) => set.byLabel.get(l)).filter((e): e is Exemplar => Boolean(e));
        if (!queue.length) throw new Error('No recordings for these signs.');
        camera.stop();
        setReplay(new ReplayPlayer(set, queue, loop));
      } catch (err) {
        setReplayError(err instanceof Error ? err.message : 'Could not load the demo recordings.');
      }
    },
    [camera.stop]
  );

  const stopDemo = useCallback(() => setReplay(null), []);
  const startCamera = useCallback(() => {
    setReplay(null);
    camera.start();
  }, [camera.start]);

  return { videoRef, canvasRef, camera, landmarker, replay, replayError, playDemo, stopDemo, startCamera, stats, engine };
}

export type Stage = ReturnType<typeof useStage>;

const Hud: React.FC<{ engine: SignEngine | null; stats: React.RefObject<LoopStats>; source: string }> = ({
  engine,
  stats,
  source,
}) => {
  const snap = useSnapshot(engine, stats, 4);
  if (!snap) return null;
  const model = Math.max(snap.staticMs, 0) + 0;
  return (
    <div className="pointer-events-none absolute inset-x-2.5 top-2.5 flex flex-wrap items-start justify-between gap-1.5">
      <div className="flex flex-wrap gap-1.5">
        <span className="chip border-signal bg-night text-signal">
          <span className="live-dot h-1.5 w-1.5 rounded-full bg-signal" />
          {source} · {Math.round(snap.fps)} fps
        </span>
        {snap.detectMs > 0 && <span className="chip border-white/40 bg-night text-white">hands {snap.detectMs.toFixed(0)} ms</span>}
        {model > 0 && <span className="chip border-white/40 bg-night text-white">letters {snap.staticMs.toFixed(0)} ms</span>}
        {snap.dynamicMs > 0 && <span className="chip border-white/40 bg-night text-white">words {snap.dynamicMs.toFixed(0)} ms</span>}
      </div>
      <span className={`chip bg-night ${snap.hands ? 'border-signal text-signal' : 'border-white/40 text-white/70'}`}>
        {snap.hands === 0 ? 'no hands' : snap.hands === 1 ? '1 hand' : '2 hands'}
      </span>
    </div>
  );
};

const CornerTicks: React.FC = () => (
  <>
    {['left-2 top-2 border-l-[3px] border-t-[3px]', 'right-2 top-2 border-r-[3px] border-t-[3px]', 'bottom-2 left-2 border-b-[3px] border-l-[3px]', 'bottom-2 right-2 border-b-[3px] border-r-[3px]'].map(
      (pos) => (
        <span key={pos} aria-hidden="true" className={`pointer-events-none absolute h-5 w-5 border-signal ${pos}`} />
      )
    )}
  </>
);

interface StageProps {
  stage: Stage;
  /** Signs played by the "demo stream" button. */
  demo: string[];
  demoLabel?: string;
  className?: string;
  children?: React.ReactNode;
}

/** The camera view with the landmark overlay, live timings and the camera/demo controls. */
export const CameraStage: React.FC<StageProps> = ({ stage, demo, demoLabel = 'Play demo stream', className = '', children }) => {
  const { videoRef, canvasRef, camera, landmarker, replay, replayError, playDemo, stopDemo, startCamera, stats, engine } = stage;
  const mirrored = camera.facingMode === 'user';
  const running = camera.isActive || replay !== null;
  const [demoItem, setDemoItem] = useState<string | null>(null);

  // Show which recording the demo stream is on.
  useEffect(() => {
    if (!replay) return setDemoItem(null);
    const id = window.setInterval(() => setDemoItem(replay.current?.label ?? null), 150);
    return () => window.clearInterval(id);
  }, [replay]);

  return (
    <div className={`relative overflow-hidden rounded-md border-2 border-ink bg-night ${className}`}>
      <div className="relative aspect-[4/3] w-full">
        <video
          ref={videoRef}
          playsInline
          muted
          aria-label="Camera preview"
          className={`absolute inset-0 h-full w-full object-cover ${mirrored ? '-scale-x-100' : ''} ${camera.isActive ? '' : 'invisible'}`}
        />
        {replay && <div className="dots absolute inset-0 opacity-25 [filter:invert(1)]" aria-hidden="true" />}
        <canvas ref={canvasRef} aria-hidden="true" className="absolute inset-0 h-full w-full object-cover" />
        {running && <CornerTicks />}
        {running && <Hud engine={engine} stats={stats} source={replay ? 'demo' : 'live'} />}

        {!running && (
          <div className="absolute inset-0 grid place-items-center p-6 text-center text-paper">
            <div className="max-w-sm">
              <CameraOff className="mx-auto h-9 w-9 text-signal" strokeWidth={1.75} />
              <p className="display mt-4 text-4xl">Camera is off</p>
              <p className="mt-2 text-[15px] text-paper/70">
                Video never leaves this device. Only 21 points per hand are read from each frame.
              </p>
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                <button className="btn btn-signal" onClick={startCamera} disabled={landmarker.status === 'error'}>
                  <Camera className="h-[18px] w-[18px]" /> Start camera
                </button>
                <button className="btn border-paper bg-transparent text-paper hover:!bg-white/10" onClick={() => playDemo(demo)}>
                  <Play className="h-[18px] w-[18px]" /> {demoLabel}
                </button>
              </div>
              {landmarker.status === 'loading' && <p className="tag mt-4 text-paper/60">Loading hand tracker…</p>}
              {(camera.error || landmarker.error || replayError) && (
                <p role="alert" className="mt-4 rounded border-2 border-alarm bg-alarm/20 px-3 py-2 text-sm text-white">
                  {camera.error ?? replayError ?? `Hand tracker failed to load: ${landmarker.error}`}
                </p>
              )}
            </div>
          </div>
        )}

        {running && (
          <div className="absolute inset-x-2.5 bottom-2.5 flex items-end justify-between gap-2">
            <div className="min-w-0">
              {replay && demoItem && (
                <span className="chip border-signal bg-signal text-ink">Recording: {demoItem}</span>
              )}
              {children}
            </div>
            <div className="flex shrink-0 gap-1.5">
              {camera.isActive && (
                <button className="btn btn-sm btn-icon !w-[34px] border-white/50 bg-night text-white hover:!bg-black" onClick={camera.flip} aria-label="Switch camera">
                  <SwitchCamera className="h-4 w-4" />
                </button>
              )}
              <button
                className="btn btn-sm border-white/50 bg-night text-white hover:!bg-black"
                onClick={() => (replay ? stopDemo() : camera.stop())}
              >
                <Square className="h-3.5 w-3.5" fill="currentColor" /> Stop
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

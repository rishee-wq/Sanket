import { type RefObject, useEffect, useRef, useState } from 'react';
import type { SignEngine, Telemetry } from '../engine/engine';
import type { DetectedHand } from '../engine/features';
import { type ReplayPlayer, type View, exemplarView } from '../lib/exemplars';
import { type HandStyle, ON_VIDEO, drawHands } from '../lib/handDrawing';

export interface LoopStats {
  /** MediaPipe hand detection time per frame, smoothed. */
  detectMs: number;
  /** Frames handed to the engine. */
  frames: number;
  /** performance.now() of the last accepted token, for the green flash. */
  acceptedAt: number;
}

interface Options {
  videoRef: RefObject<HTMLVideoElement | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  cameraActive: boolean;
  mirrored: boolean;
  detect: (video: HTMLVideoElement) => DetectedHand[];
  engine: SignEngine | null;
  /** When set, frames come from recorded landmarks instead of the camera. */
  replay: ReplayPlayer | null;
  onReplayEnd?: () => void;
  /** Called with every frame's hands (used for the Signal for Help check). */
  onHands?: (hands: DetectedHand[], now: number) => void;
  style?: HandStyle;
}

const ACCEPT_FLASH_MS = 320;

/**
 * The per-frame loop: camera frame -> MediaPipe -> engine -> overlay.
 *
 * With a camera it is driven by requestVideoFrameCallback, which fires exactly
 * once per NEW video frame. A plain requestAnimationFrame loop would run the
 * detector again on a frame it has already seen whenever the display refreshes
 * faster than the camera, wasting half the work.
 *
 * Nothing in here sets React state; per-frame values live in refs and in
 * engine.telemetry.
 */
export function useLiveLoop(options: Options) {
  const stats = useRef<LoopStats>({ detectMs: 0, frames: 0, acceptedAt: -Infinity });
  const opts = useRef(options);
  opts.current = options;
  const { cameraActive, engine, replay } = options;

  useEffect(() => {
    let stopped = false;
    let rafId = 0;
    let vfcId = 0;
    const video = options.videoRef.current;
    let view: View | undefined;
    let viewFor: unknown = null;

    const draw = (hands: DetectedHand[], mirrored: boolean, now: number, zoom?: View) => {
      const canvas = opts.current.canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx) return;
      const flash = now - stats.current.acceptedAt < ACCEPT_FLASH_MS;
      drawHands(ctx, hands, mirrored, flash, opts.current.style ?? ON_VIDEO, zoom);
    };

    const fromCamera = (now: number) => {
      const { detect, mirrored, canvasRef, onHands } = opts.current;
      if (!video) return;
      const canvas = canvasRef.current;
      if (canvas && video.videoWidth) {
        // Match the canvas to the video frame so the overlay lines up under object-cover.
        if (canvas.width !== video.videoWidth) canvas.width = video.videoWidth;
        if (canvas.height !== video.videoHeight) canvas.height = video.videoHeight;
      }
      const t0 = performance.now();
      const hands = detect(video);
      const ms = performance.now() - t0;
      const s = stats.current;
      s.detectMs = s.detectMs ? s.detectMs * 0.9 + ms * 0.1 : ms;
      s.frames++;
      opts.current.engine?.pushFrame(hands, video.videoWidth / Math.max(1, video.videoHeight), now);
      onHands?.(hands, now);
      draw(hands, mirrored, now);
    };

    const fromReplay = (now: number) => {
      const player = opts.current.replay;
      if (!player) return;
      const canvas = opts.current.canvasRef.current;
      for (const frame of player.due(now)) {
        stats.current.frames++;
        opts.current.engine?.pushFrame(frame.hands, frame.item?.aspect ?? 16 / 9, frame.time);
        if (frame.item && canvas) {
          if (viewFor !== frame.item) {
            viewFor = frame.item;
            // Frame the sign itself; the rest pose before and after may fall outside the view.
            view = exemplarView(player.set, frame.item, canvas.width / Math.max(1, canvas.height), ...frame.item.active);
          }
        }
        draw(frame.hands, false, now, view);
      }
      if (player.done) opts.current.onReplayEnd?.();
    };

    if (replay) {
      const canvas = options.canvasRef.current;
      if (canvas) {
        canvas.width = 960;
        canvas.height = 720;
      }
      const tick = () => {
        if (stopped) return;
        fromReplay(performance.now());
        rafId = requestAnimationFrame(tick);
      };
      rafId = requestAnimationFrame(tick);
    } else if (cameraActive && video) {
      if ('requestVideoFrameCallback' in video) {
        const onFrame = (now: number) => {
          if (stopped) return;
          fromCamera(now);
          vfcId = video.requestVideoFrameCallback(onFrame);
        };
        vfcId = video.requestVideoFrameCallback(onFrame);
      } else {
        const tick = () => {
          if (stopped) return;
          fromCamera(performance.now());
          rafId = requestAnimationFrame(tick);
        };
        rafId = requestAnimationFrame(tick);
      }
    } else {
      const canvas = options.canvasRef.current;
      canvas?.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
    }

    return () => {
      stopped = true;
      cancelAnimationFrame(rafId);
      if (vfcId && video && 'cancelVideoFrameCallback' in video) video.cancelVideoFrameCallback(vfcId);
      opts.current.engine?.reset();
    };
  }, [cameraActive, engine, replay]);

  return stats;
}

export interface Snapshot extends Telemetry {
  detectMs: number;
}

/**
 * Copies the engine's telemetry into React state a few times per second.
 * Only the small components that show live numbers call this, so the rest of
 * the page does not re-render while the camera runs.
 */
export function useSnapshot(engine: SignEngine | null, stats: RefObject<LoopStats>, hz = 12): Snapshot | null {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  useEffect(() => {
    if (!engine) return;
    const read = () =>
      setSnap({
        ...engine.telemetry,
        letter: { ...engine.telemetry.letter },
        word: { ...engine.telemetry.word },
        detectMs: stats.current?.detectMs ?? 0,
      });
    read();
    const id = window.setInterval(read, 1000 / hz);
    return () => window.clearInterval(id);
  }, [engine, hz, stats]);
  return snap;
}

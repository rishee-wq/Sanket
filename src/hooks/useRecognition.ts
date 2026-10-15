import { RefObject, useEffect, useRef, useState } from 'react';
import { drawHands } from '../lib/handDrawing';
import type { Prediction, Predictor } from '../lib/predictor';
import { SimulatedPose, simulatedHand } from '../lib/simulatedPoses';
import { StabilityGate } from '../lib/stability';
import type { DetectedHand } from '../types/isl';

export interface LiveState {
  prediction: Prediction | null;
  handsCount: number;
  /** Label being held towards acceptance, and progress 0..1. */
  candidate: string | null;
  progress: number;
}

export interface PipelineStats {
  fps: number;
  detectMs: number;
  inferMs: number;
}

interface Options {
  videoRef: RefObject<HTMLVideoElement | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  cameraActive: boolean;
  mirrored: boolean;
  detect: (video: HTMLVideoElement) => DetectedHand[];
  predictor: Predictor | null;
  simulatedPose: SimulatedPose | null;
  onAccept: (prediction: Prediction) => void;
}

/** UI state is published at most this often; the loop itself runs every animation frame. */
const PUBLISH_INTERVAL_MS = 100;
const STATS_INTERVAL_MS = 500;
const ACCEPT_HIGHLIGHT_MS = 500;

const EMPTY_LIVE: LiveState = { prediction: null, handsCount: 0, candidate: null, progress: 0 };

/**
 * Runs camera → landmarks → prediction → stability gate in a requestAnimationFrame loop.
 * Per-frame values live in refs; React state is only updated a few times per second.
 */
export function useRecognition(options: Options) {
  const [live, setLive] = useState<LiveState>(EMPTY_LIVE);
  const [stats, setStats] = useState<PipelineStats>({ fps: 0, detectMs: 0, inferMs: 0 });

  // Latest options, read by the loop without restarting it.
  const opts = useRef(options);
  opts.current = options;

  const gate = useRef(new StabilityGate());
  useEffect(() => {
    gate.current.reset();
    options.predictor?.reset();
  }, [options.predictor]);

  useEffect(() => {
    let frameId = 0;
    let lastFrame = performance.now();
    let lastPublish = 0;
    let lastStats = 0;
    let acceptedAt = -Infinity;
    let published = EMPTY_LIVE;
    const ema = { fps: 0, detectMs: 0, inferMs: 0 };
    const smooth = (key: keyof typeof ema, value: number) => {
      ema[key] = ema[key] === 0 ? value : ema[key] * 0.9 + value * 0.1;
    };

    const loop = () => {
      frameId = requestAnimationFrame(loop);
      const { videoRef, canvasRef, cameraActive, mirrored, detect, predictor, simulatedPose, onAccept } = opts.current;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const now = performance.now();

      const t0 = performance.now();
      let hands: DetectedHand[] = [];
      if (simulatedPose) hands = [simulatedHand(simulatedPose)];
      else if (cameraActive && video) hands = detect(video);
      const t1 = performance.now();
      const prediction = predictor ? predictor.predict(hands) : null;
      const t2 = performance.now();

      const result = gate.current.update(prediction, now);
      if (result.accepted && prediction) {
        acceptedAt = now;
        onAccept(prediction);
      }

      if (canvas) {
        // Match the canvas to the video frame so the overlay lines up under object-cover.
        if (video && video.videoWidth && !simulatedPose) {
          if (canvas.width !== video.videoWidth) canvas.width = video.videoWidth;
          if (canvas.height !== video.videoHeight) canvas.height = video.videoHeight;
        }
        const ctx = canvas.getContext('2d');
        if (ctx) drawHands(ctx, hands, mirrored && !simulatedPose, now - acceptedAt < ACCEPT_HIGHLIGHT_MS);
      }

      smooth('fps', 1000 / Math.max(1, now - lastFrame));
      lastFrame = now;
      if (hands.length > 0 || simulatedPose) smooth('detectMs', t1 - t0);
      if (prediction) smooth('inferMs', t2 - t1);

      const next: LiveState = {
        prediction,
        handsCount: hands.length,
        candidate: result.candidate,
        progress: result.progress,
      };
      const changed =
        next.prediction?.label !== published.prediction?.label ||
        next.handsCount !== published.handsCount ||
        next.candidate !== published.candidate ||
        result.accepted;
      if (changed || (now - lastPublish >= PUBLISH_INTERVAL_MS && (next.prediction || published.prediction))) {
        published = next;
        lastPublish = now;
        setLive(next);
      }
      if (now - lastStats >= STATS_INTERVAL_MS) {
        lastStats = now;
        setStats({ ...ema });
      }
    };

    frameId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frameId);
  }, []);

  return { live, stats };
}

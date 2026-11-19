import { HandLandmarker } from '@mediapipe/tasks-vision';
// WASM served from the installed package so it always matches the JS API version.
import wasmLoaderPath from '@mediapipe/tasks-vision/vision_wasm_internal.js?url';
import wasmBinaryPath from '@mediapipe/tasks-vision/vision_wasm_internal.wasm?url';
import { useCallback, useEffect, useState } from 'react';
import type { DetectedHand } from '../engine/features';

const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

// One HandLandmarker for the whole app, shared by every camera view.
let landmarkerPromise: Promise<HandLandmarker> | null = null;
let lastTimestamp = 0;

function loadLandmarker(): Promise<HandLandmarker> {
  if (!landmarkerPromise) {
    const create = (delegate: 'GPU' | 'CPU') =>
      HandLandmarker.createFromOptions(
        { wasmLoaderPath, wasmBinaryPath },
        {
          baseOptions: { modelAssetPath: MODEL_URL, delegate },
          runningMode: 'VIDEO',
          numHands: 2,
          // Lower than MediaPipe's 0.5 defaults so hands are still found in dim light and
          // motion blur. The smoother (engine/smoothing.ts) cleans up the extra jitter.
          minHandDetectionConfidence: 0.4,
          minHandPresenceConfidence: 0.4,
          minTrackingConfidence: 0.4,
        }
      );
    landmarkerPromise = create('GPU').catch((err) => {
      console.warn('HandLandmarker GPU delegate failed, falling back to CPU.', err);
      return create('CPU');
    });
    landmarkerPromise.catch(() => {
      landmarkerPromise = null; // allow a retry on next mount
    });
  }
  return landmarkerPromise;
}

export type LandmarkerStatus = 'loading' | 'ready' | 'error';

export function useHandLandmarker() {
  const [landmarker, setLandmarker] = useState<HandLandmarker | null>(null);
  const [status, setStatus] = useState<LandmarkerStatus>('loading');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    loadLandmarker().then(
      (l) => {
        if (!alive) return;
        setLandmarker(l);
        setStatus('ready');
      },
      (err) => {
        if (!alive) return;
        setError(err instanceof Error ? err.message : String(err));
        setStatus('error');
      }
    );
    return () => {
      alive = false;
    };
  }, []);

  /**
   * Detects up to two hands in the current video frame. `image` is what the
   * tracker actually looks at (a brightened copy in low light); it defaults to the video.
   */
  const detect = useCallback(
    (video: HTMLVideoElement, image: HTMLVideoElement | HTMLCanvasElement = video): DetectedHand[] => {
      if (!landmarker || video.readyState < 2 || video.videoWidth === 0) return [];
      // VIDEO mode needs strictly increasing timestamps, even across components.
      lastTimestamp = Math.max(performance.now(), lastTimestamp + 1);
      const result = landmarker.detectForVideo(image, lastTimestamp);
      return result.landmarks.map((landmarks, i) => {
        const category = result.handedness[i]?.[0];
        const label = category?.categoryName;
        return {
          landmarks,
          handedness: label === 'Left' || label === 'Right' ? label : null,
          score: category?.score ?? 0,
        };
      });
    },
    [landmarker]
  );

  return { status, error, detect };
}

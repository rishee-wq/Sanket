/**
 * HandSmoother: cleans up MediaPipe's landmarks before they reach the engine.
 *
 * Two problems it solves on a real webcam:
 *
 * 1. Jitter. In dim light the detector's landmarks shake from frame to frame.
 *    That shaking looks like movement (so the word spotter sees motion that is
 *    not there) and makes letter shapes flicker. We run a One-Euro filter
 *    (Casiez, Roussel & Vogel, CHI 2012) on every coordinate: an exponential
 *    moving average whose cutoff frequency rises with speed. Still hands get a
 *    low cutoff (strong smoothing, no shake); fast hands get a high cutoff
 *    (little smoothing, so no lag on real signing).
 *
 * 2. Dropouts. Motion blur and low light make the detector lose a hand for a
 *    frame or two in the middle of a sign, which would cut the sign in half.
 *    A hand that disappears is kept at its last position for up to `holdMs`.
 *
 * Hands are matched to the previous frame by nearest wrist, not by MediaPipe's
 * handedness label, because the label itself can flip for a frame.
 */
import type { DetectedHand, Landmark } from './features.ts';

export interface SmootherOptions {
  /** Cutoff (Hz) when the hand is still. Lower = smoother. */
  minCutoff: number;
  /** How fast the cutoff rises with speed (per screen-width per second). */
  beta: number;
  /** Cutoff (Hz) for the speed estimate itself. */
  dCutoff: number;
  /** How long a lost hand is kept at its last position. */
  holdMs: number;
  /** A hand further than this (in frame widths) from every tracked hand is a new hand. */
  matchDistance: number;
}

export const DEFAULT_SMOOTHER: SmootherOptions = {
  minCutoff: 1.6,
  beta: 6,
  dCutoff: 1,
  holdMs: 140,
  matchDistance: 0.25,
};

const COORDS = 63;

function alpha(cutoff: number, dt: number): number {
  const tau = 1 / (2 * Math.PI * cutoff);
  return 1 / (1 + tau / dt);
}

interface Track {
  value: Float32Array;
  speed: Float32Array;
  hand: DetectedHand;
  seen: number;
}

export class HandSmoother {
  readonly options: SmootherOptions;
  private tracks: Track[] = [];
  private lastTime = -Infinity;

  constructor(options: Partial<SmootherOptions> = {}) {
    this.options = { ...DEFAULT_SMOOTHER, ...options };
  }

  reset() {
    this.tracks = [];
    this.lastTime = -Infinity;
  }

  /** Returns the hands to use for this frame (smoothed, plus briefly held lost hands). */
  update(hands: DetectedHand[], now: number): DetectedHand[] {
    const { minCutoff, beta, dCutoff, holdMs, matchDistance } = this.options;
    const dt = this.lastTime > -Infinity ? Math.min(0.2, Math.max(1e-3, (now - this.lastTime) / 1000)) : 1 / 30;
    this.lastTime = now;

    // Greedy nearest-wrist matching (at most two hands, so greedy is exact enough).
    const pairs: { hand: number; track: number; d: number }[] = [];
    hands.forEach((h, i) =>
      this.tracks.forEach((t, j) => {
        const d = Math.hypot(h.landmarks[0].x - t.value[0], h.landmarks[0].y - t.value[1]);
        if (d <= matchDistance) pairs.push({ hand: i, track: j, d });
      })
    );
    pairs.sort((a, b) => a.d - b.d);
    const handTrack = new Map<number, number>();
    const usedTracks = new Set<number>();
    for (const p of pairs) {
      if (handTrack.has(p.hand) || usedTracks.has(p.track)) continue;
      handTrack.set(p.hand, p.track);
      usedTracks.add(p.track);
    }

    const next: Track[] = [];
    const out: DetectedHand[] = [];
    hands.forEach((hand, i) => {
      const raw = new Float32Array(COORDS);
      hand.landmarks.forEach((p, k) => {
        raw[k * 3] = p.x;
        raw[k * 3 + 1] = p.y;
        raw[k * 3 + 2] = p.z;
      });
      const j = handTrack.get(i);
      let track: Track;
      if (j === undefined) {
        track = { value: raw, speed: new Float32Array(COORDS), hand, seen: now };
      } else {
        track = this.tracks[j];
        const ad = alpha(dCutoff, dt);
        for (let k = 0; k < COORDS; k++) {
          const ds = (raw[k] - track.value[k]) / dt;
          track.speed[k] += ad * (ds - track.speed[k]);
          const a = alpha(minCutoff + beta * Math.abs(track.speed[k]), dt);
          track.value[k] += a * (raw[k] - track.value[k]);
        }
        track.hand = hand;
        track.seen = now;
      }
      next.push(track);
      out.push(toHand(track.value, hand));
    });

    // Keep recently lost hands for a moment, frozen where they were.
    this.tracks.forEach((t, j) => {
      if (usedTracks.has(j) || now - t.seen > holdMs) return;
      next.push(t);
      out.push(toHand(t.value, t.hand));
    });

    this.tracks = next.slice(0, 2);
    return out.slice(0, 2);
  }
}

function toHand(v: Float32Array, like: DetectedHand): DetectedHand {
  const landmarks: Landmark[] = new Array(21);
  for (let k = 0; k < 21; k++) landmarks[k] = { x: v[k * 3], y: v[k * 3 + 1], z: v[k * 3 + 2] };
  return { landmarks, handedness: like.handedness, score: like.score };
}

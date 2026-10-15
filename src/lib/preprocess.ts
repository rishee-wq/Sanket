/**
 * Landmark preprocessing shared by every predictor.
 *
 * This MUST stay numerically identical to ml/preprocess.py.
 * The single source of truth is docs/preprocessing.md — change the spec first,
 * then both implementations.
 */
import type { DetectedHand, NormalizedLandmark } from '../types/isl';

export const LANDMARKS_PER_HAND = 21;
export const COORDS_PER_LANDMARK = 3;
export const FEATURES_PER_HAND = LANDMARKS_PER_HAND * COORDS_PER_LANDMARK; // 63

/** Below this hand size a hand is treated as degenerate and left unscaled. */
const MIN_SCALE = 1e-6;

/**
 * Normalizes one hand (spec §2):
 * 1. translate every landmark so the wrist (index 0) is the origin;
 * 2. divide by the largest wrist-to-landmark distance (3D), so the hand fits in a unit sphere.
 * Output layout: [x0, y0, z0, x1, y1, z1, ... x20, y20, z20].
 */
export function normalizeHand(landmarks: NormalizedLandmark[]): Float32Array {
  const out = new Float32Array(FEATURES_PER_HAND);
  if (landmarks.length !== LANDMARKS_PER_HAND) return out;

  const wrist = landmarks[0];
  let scale = 0;
  for (let i = 0; i < LANDMARKS_PER_HAND; i++) {
    const dx = landmarks[i].x - wrist.x;
    const dy = landmarks[i].y - wrist.y;
    const dz = landmarks[i].z - wrist.z;
    out[i * 3] = dx;
    out[i * 3 + 1] = dy;
    out[i * 3 + 2] = dz;
    scale = Math.max(scale, Math.hypot(dx, dy, dz));
  }

  if (scale > MIN_SCALE) {
    for (let k = 0; k < FEATURES_PER_HAND; k++) out[k] /= scale;
  }
  return out;
}

/**
 * Puts detected hands into fixed slots (spec §3).
 * - numHands = 1: the highest-scoring hand goes in slot 0.
 * - numHands = 2: MediaPipe's "Right" label goes in slot 0 and "Left" in slot 1.
 *   If the labels are missing or both hands share a label, the hand whose wrist has the
 *   larger image x goes in slot 0 (that is where MediaPipe's "Right" hand appears in an
 *   unmirrored frame).
 * Empty slots are null and become zeros in the feature vector.
 */
export function assignHandSlots(hands: DetectedHand[], numHands: number): (DetectedHand | null)[] {
  const slots: (DetectedHand | null)[] = new Array(numHands).fill(null);
  if (hands.length === 0) return slots;

  const byScore = [...hands].sort((a, b) => b.score - a.score);
  if (numHands === 1) {
    slots[0] = byScore[0];
    return slots;
  }

  const [a, b] = byScore;
  if (!b) {
    slots[a.handedness === 'Left' ? 1 : 0] = a;
    return slots;
  }

  const labelsUsable = a.handedness !== null && b.handedness !== null && a.handedness !== b.handedness;
  if (labelsUsable) {
    slots[a.handedness === 'Right' ? 0 : 1] = a;
    slots[b.handedness === 'Right' ? 0 : 1] = b;
  } else {
    const aFirst = a.landmarks[0].x >= b.landmarks[0].x;
    slots[0] = aFirst ? a : b;
    slots[1] = aFirst ? b : a;
  }
  return slots;
}

/** One frame's feature vector: numHands × 63 values, slot by slot (spec §4). */
export function handsToFeatures(hands: DetectedHand[], numHands: number): Float32Array {
  const out = new Float32Array(numHands * FEATURES_PER_HAND);
  assignHandSlots(hands, numHands).forEach((hand, slot) => {
    if (hand) out.set(normalizeHand(hand.landmarks), slot * FEATURES_PER_HAND);
  });
  return out;
}

/** Fixed-length sliding window of frame features for dynamic (sequence) models (spec §5). */
export class SequenceBuffer {
  private frames: Float32Array[] = [];

  constructor(
    readonly length: number,
    readonly frameSize: number
  ) {}

  push(frame: Float32Array) {
    this.frames.push(frame);
    if (this.frames.length > this.length) this.frames.shift();
  }

  get isFull(): boolean {
    return this.frames.length === this.length;
  }

  clear() {
    this.frames = [];
  }

  /** Oldest frame first, flattened to length × frameSize. */
  toArray(): Float32Array {
    const out = new Float32Array(this.length * this.frameSize);
    this.frames.forEach((f, i) => out.set(f, i * this.frameSize));
    return out;
  }
}

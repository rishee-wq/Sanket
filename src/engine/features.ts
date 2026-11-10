/**
 * Landmark features (spec: docs/preprocessing.md).
 *
 * This MUST stay numerically identical to ml/features.py.
 * `node ml/check_parity.mjs` runs both on the same hands and compares.
 */

export const POINTS = 21;
export const SHAPE_SIZE = POINTS * 3; // 63 values per hand
export const NUM_SLOTS = 2;
export const RAW_SIZE = NUM_SLOTS * SHAPE_SIZE; // 126 raw coordinates per frame
export const FRAME_SIZE = RAW_SIZE + 6; // 132
export const TRAJECTORY_SIZE = 4;
export const SEQ_FRAME_SIZE = FRAME_SIZE + TRAJECTORY_SIZE; // 136
export const SEQUENCE_LENGTH = 32;

const EPS = 1e-6;

export interface Landmark {
  x: number;
  y: number;
  z: number;
}

/** One hand from MediaPipe HandLandmarker, in image coordinates of the unmirrored frame. */
export interface DetectedHand {
  landmarks: Landmark[];
  /** MediaPipe's handedness label, or null if unavailable. */
  handedness: 'Left' | 'Right' | null;
  score: number;
}

/**
 * Spec §1-§2: puts up to two detected hands into fixed slots and undoes the
 * aspect-ratio squash (x and z are multiplied by width / height).
 *
 * - Both labels present and different: "Right" goes in slot 0, "Left" in slot 1.
 * - Otherwise the hand whose wrist has the larger x goes in slot 0.
 * - One hand: slot 1 if it is "Left", else slot 0.
 *
 * Writes 126 values into `hands` at `offset` and returns the two presence flags as bits
 * (bit 0 = slot 0, bit 1 = slot 1).
 */
export function toSlots(detected: DetectedHand[], aspect: number, hands: Float32Array, offset = 0): number {
  hands.fill(0, offset, offset + RAW_SIZE);
  if (detected.length === 0) return 0;

  let a: DetectedHand | null = null;
  let b: DetectedHand | null = null;
  for (const h of detected) {
    if (h.landmarks.length !== POINTS) continue;
    if (!a || h.score > a.score) {
      b = a;
      a = h;
    } else if (!b || h.score > b.score) b = h;
  }
  if (!a) return 0;

  let first: DetectedHand | null;
  let second: DetectedHand | null;
  if (!b) {
    first = a.handedness === 'Left' ? null : a;
    second = a.handedness === 'Left' ? a : null;
  } else if (a.handedness !== null && b.handedness !== null && a.handedness !== b.handedness) {
    first = a.handedness === 'Right' ? a : b;
    second = a.handedness === 'Right' ? b : a;
  } else {
    const aFirst = a.landmarks[0].x >= b.landmarks[0].x;
    first = aFirst ? a : b;
    second = aFirst ? b : a;
  }

  let bits = 0;
  const slots = [first, second];
  for (let s = 0; s < NUM_SLOTS; s++) {
    const hand = slots[s];
    if (!hand) continue;
    bits |= 1 << s;
    let k = offset + s * SHAPE_SIZE;
    for (let i = 0; i < POINTS; i++) {
      const p = hand.landmarks[i];
      hands[k++] = p.x * aspect;
      hands[k++] = p.y;
      hands[k++] = p.z * aspect;
    }
  }
  return bits;
}

/** Largest wrist-to-landmark distance of the hand in `slot`. */
export function handScale(hands: Float32Array, offset: number, slot: number): number {
  const base = offset + slot * SHAPE_SIZE;
  const wx = hands[base];
  const wy = hands[base + 1];
  const wz = hands[base + 2];
  let max = 0;
  for (let i = 1; i < POINTS; i++) {
    const k = base + i * 3;
    const d = Math.hypot(hands[k] - wx, hands[k + 1] - wy, hands[k + 2] - wz);
    if (d > max) max = d;
  }
  return max;
}

/**
 * Spec §3-§4: one frame's 132 features.
 *
 *   [0:63]    slot 0 shape: wrist at the origin, scaled into the unit sphere
 *   [63:66]   relation: (wrist1 - wrist0) / mean hand size (x, y), log size ratio
 *   [66:129]  slot 1 shape
 *   [129:132] flags: slot 0 present, slot 1 present, both present
 */
export function frameFeatures(
  hands: Float32Array,
  handsOffset: number,
  presentBits: number,
  out: Float32Array,
  outOffset = 0
): void {
  const p0 = presentBits & 1;
  const p1 = (presentBits >> 1) & 1;
  const scales = [handScale(hands, handsOffset, 0), handScale(hands, handsOffset, 1)];
  const present = [p0, p1];

  for (let s = 0; s < NUM_SLOTS; s++) {
    const src = handsOffset + s * SHAPE_SIZE;
    const dst = outOffset + s * (SHAPE_SIZE + 3);
    if (!present[s]) {
      out.fill(0, dst, dst + SHAPE_SIZE);
      continue;
    }
    const inv = 1 / (scales[s] > EPS ? scales[s] : 1);
    const wx = hands[src];
    const wy = hands[src + 1];
    const wz = hands[src + 2];
    for (let i = 0; i < POINTS; i++) {
      const k = i * 3;
      out[dst + k] = (hands[src + k] - wx) * inv;
      out[dst + k + 1] = (hands[src + k + 1] - wy) * inv;
      out[dst + k + 2] = (hands[src + k + 2] - wz) * inv;
    }
  }

  const both = p0 * p1;
  const rel = outOffset + SHAPE_SIZE;
  if (both) {
    const mean = Math.max((scales[0] + scales[1]) / 2, EPS);
    const h1 = handsOffset + SHAPE_SIZE;
    out[rel] = (hands[h1] - hands[handsOffset]) / mean;
    out[rel + 1] = (hands[h1 + 1] - hands[handsOffset + 1]) / mean;
    out[rel + 2] = Math.log(Math.max(scales[1], EPS) / Math.max(scales[0], EPS));
  } else {
    out[rel] = out[rel + 1] = out[rel + 2] = 0;
  }
  const flags = outOffset + 2 * SHAPE_SIZE + 3;
  out[flags] = p0;
  out[flags + 1] = p1;
  out[flags + 2] = both;
}

/** Spec §5: `length` frame indices spread evenly over n frames (nearest neighbour, half rounds up). */
export function resampleIndices(n: number, length = SEQUENCE_LENGTH): Int32Array {
  const out = new Int32Array(length);
  if (n <= 0 || length === 1) return out;
  for (let i = 0; i < length; i++) out[i] = Math.floor((i * (n - 1)) / (length - 1) + 0.5);
  return out;
}

/**
 * Spec §5: a window of T frames -> T × 136 features.
 *
 * `hands` holds T × 126 raw values, `present` holds T presence bit-masks.
 * Adds each wrist's (x, y) relative to the window's average wrist position, in
 * units of the window's average hand size: how the hands MOVE, without where
 * the signer stands or how far away they are.
 *
 * If `frameCache` is given it must hold the T × 132 frame features already
 * computed for these frames (the live engine computes them once per frame).
 */
export function sequenceFeatures(
  hands: Float32Array,
  present: Uint8Array,
  frames: number,
  out: Float32Array,
  outOffset = 0,
  frameCache?: Float32Array
): void {
  let count = 0;
  let cx = 0;
  let cy = 0;
  let scaleSum = 0;
  for (let t = 0; t < frames; t++) {
    for (let s = 0; s < NUM_SLOTS; s++) {
      if (!((present[t] >> s) & 1)) continue;
      const base = t * RAW_SIZE + s * SHAPE_SIZE;
      cx += hands[base];
      cy += hands[base + 1];
      scaleSum += handScale(hands, t * RAW_SIZE, s);
      count++;
    }
  }
  const safeCount = Math.max(count, 1);
  cx /= safeCount;
  cy /= safeCount;
  const meanScale = Math.max(scaleSum / safeCount, EPS);

  for (let t = 0; t < frames; t++) {
    const dst = outOffset + t * SEQ_FRAME_SIZE;
    if (frameCache) out.set(frameCache.subarray(t * FRAME_SIZE, (t + 1) * FRAME_SIZE), dst);
    else frameFeatures(hands, t * RAW_SIZE, present[t], out, dst);
    for (let s = 0; s < NUM_SLOTS; s++) {
      const on = (present[t] >> s) & 1;
      const base = t * RAW_SIZE + s * SHAPE_SIZE;
      out[dst + FRAME_SIZE + s * 2] = on ? (hands[base] - cx) / meanScale : 0;
      out[dst + FRAME_SIZE + s * 2 + 1] = on ? (hands[base + 1] - cy) / meanScale : 0;
    }
  }
}

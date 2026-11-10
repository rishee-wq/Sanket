/**
 * Exemplars: real landmark recordings, one per sign, from the held-out test
 * split (written by ml/export_exemplars.py).
 *
 * They do two jobs:
 *  - Learn shows them as a moving hand skeleton, so you can see the sign.
 *  - The demo stream replays them through the SAME engine as the camera, so
 *    the whole pipeline can be shown (and tested) without a webcam.
 *
 * File format: exemplars.json is an index; exemplars.bin holds every frame as
 * 126 little-endian int16 values (2 hands × 21 points × x, y, z, each × 10000,
 * aspect-corrected). A hand whose 63 values are all zero is absent.
 */
import type { DetectedHand, Landmark } from '../engine/features';

export interface Exemplar {
  label: string;
  kind: 'word' | 'letter';
  /** First frame in the binary file, and how many frames. */
  offset: number;
  frames: number;
  /** Frames (relative to offset) where the sign itself starts and ends. */
  active: [number, number];
  fps: number;
  aspect: number;
}

export interface ExemplarSet {
  items: Exemplar[];
  byLabel: Map<string, Exemplar>;
  data: Int16Array;
}

const VALUES_PER_FRAME = 126;
const SCALE = 10000;
let cached: Promise<ExemplarSet> | null = null;

export function loadExemplars(): Promise<ExemplarSet> {
  cached ??= (async () => {
    const base = `${import.meta.env.BASE_URL}model/`;
    const [index, bin] = await Promise.all([
      fetch(`${base}exemplars.json`).then((r) => {
        if (!r.ok || !r.headers.get('content-type')?.includes('json')) throw new Error('exemplars.json not found');
        return r.json() as Promise<{ items: Exemplar[] }>;
      }),
      fetch(`${base}exemplars.bin`).then((r) => r.arrayBuffer()),
    ]);
    return { items: index.items, byLabel: new Map(index.items.map((e) => [e.label, e])), data: new Int16Array(bin) };
  })();
  cached.catch(() => {
    cached = null;
  });
  return cached;
}

/** Decodes one frame back into MediaPipe-style detections (image coordinates, 0..1). */
export function exemplarFrame(set: ExemplarSet, item: Exemplar, frame: number): DetectedHand[] {
  const base = (item.offset + Math.max(0, Math.min(item.frames - 1, frame))) * VALUES_PER_FRAME;
  const hands: DetectedHand[] = [];
  for (let slot = 0; slot < 2; slot++) {
    const start = base + slot * 63;
    let any = false;
    const landmarks: Landmark[] = [];
    for (let i = 0; i < 21; i++) {
      const x = set.data[start + i * 3];
      const y = set.data[start + i * 3 + 1];
      const z = set.data[start + i * 3 + 2];
      if (x !== 0 || y !== 0 || z !== 0) any = true;
      landmarks.push({ x: x / SCALE / item.aspect, y: y / SCALE, z: z / SCALE / item.aspect });
    }
    // Slot 0 holds MediaPipe's "Right" hand and slot 1 its "Left" (spec §2).
    if (any) hands.push({ landmarks, handedness: slot === 0 ? 'Right' : 'Left', score: 1 });
  }
  return hands;
}

export interface View {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** The part of the image the hands move through, padded and widened to `targetAspect` (width / height in pixels). */
export function exemplarView(set: ExemplarSet, item: Exemplar, targetAspect: number, from = 0, to = item.frames - 1): View {
  let x0 = 1;
  let y0 = 1;
  let x1 = 0;
  let y1 = 0;
  // Signers are filmed full-length, so a hand left hanging at the side would stretch the view
  // from hip to head and shrink everything. Frame only the hands that are raised: those whose
  // wrist is in the upper 60% of the range the wrists cover.
  let top = 1;
  let bottom = 0;
  for (let f = from; f <= to; f++) {
    for (const hand of exemplarFrame(set, item, f)) {
      top = Math.min(top, hand.landmarks[0].y);
      bottom = Math.max(bottom, hand.landmarks[0].y);
    }
  }
  const cutoff = bottom - top > 0.12 ? top + 0.6 * (bottom - top) : 1;
  for (let f = from; f <= to; f++) {
    for (const hand of exemplarFrame(set, item, f)) {
      if (hand.landmarks[0].y > cutoff) continue;
      for (const p of hand.landmarks) {
        x0 = Math.min(x0, p.x);
        y0 = Math.min(y0, p.y);
        x1 = Math.max(x1, p.x);
        y1 = Math.max(y1, p.y);
      }
    }
  }
  if (x1 <= x0 || y1 <= y0) return { x0: 0, y0: 0, x1: 1, y1: 1 };
  // Work in pixel-proportional units (x × aspect), pad, then fit the target aspect.
  const a = item.aspect;
  let w = (x1 - x0) * a;
  let h = y1 - y0;
  const cx = ((x0 + x1) / 2) * a;
  const cy = (y0 + y1) / 2;
  w *= 1.35;
  h *= 1.35;
  if (w / h < targetAspect) w = h * targetAspect;
  else h = w / targetAspect;
  return { x0: (cx - w / 2) / a, y0: cy - h / 2, x1: (cx + w / 2) / a, y1: cy + h / 2 };
}

/**
 * Plays a queue of exemplars as if they were a camera: frames come out at the
 * recording's own frame rate, with a short empty gap between signs (the hands
 * leave the frame, as they would between isolated signs).
 */
export class ReplayPlayer {
  readonly set: ExemplarSet;
  readonly queue: Exemplar[];
  readonly loop: boolean;
  private index = 0;
  private frame = 0;
  private startedAt: number | null = null;
  private gapUntil = 0;
  done = false;

  constructor(set: ExemplarSet, queue: Exemplar[], loop = false) {
    this.set = set;
    this.queue = queue;
    this.loop = loop;
  }

  get current(): Exemplar | null {
    return this.queue[this.index] ?? null;
  }

  /** Position in the queue, for progress display. */
  get position(): { index: number; total: number } {
    return { index: Math.min(this.index, this.queue.length - 1), total: this.queue.length };
  }

  /**
   * Returns the frames that became due since the last call (usually 0 or 1),
   * each with the time it "was captured". An empty hand list is a real frame
   * with no hands in it.
   */
  due(now: number, gapMs = 420): { hands: DetectedHand[]; time: number; item: Exemplar | null }[] {
    const out: { hands: DetectedHand[]; time: number; item: Exemplar | null }[] = [];
    const item = this.current;
    if (!item || this.done) return out;

    if (now < this.gapUntil) {
      out.push({ hands: [], time: now, item: null });
      return out;
    }
    this.startedAt ??= now;
    const frameMs = 1000 / item.fps;
    while (this.frame < item.frames && this.startedAt + this.frame * frameMs <= now && out.length < 4) {
      out.push({ hands: exemplarFrame(this.set, item, this.frame), time: this.startedAt + this.frame * frameMs, item });
      this.frame++;
    }
    if (this.frame >= item.frames) {
      this.index++;
      this.frame = 0;
      this.startedAt = null;
      this.gapUntil = now + gapMs;
      if (this.index >= this.queue.length) {
        if (this.loop) this.index = 0;
        else this.done = true;
      }
    }
    return out;
  }
}

/**
 * FrameRing: a fixed-capacity circular buffer of recent camera frames.
 *
 * DATA STRUCTURE: ring buffer (circular queue).
 *   push      O(1)   overwrite the oldest slot, advance the head
 *   access    O(1)   any of the last `capacity` frames by its sequence number
 *   memory    O(capacity), allocated once; nothing is garbage-collected per frame
 *
 * A plain array with shift() would cost O(n) per frame and allocate. Here the
 * storage is "structure of arrays": one big typed array per field, so reading a
 * window of frames is a few contiguous memory copies.
 *
 * Every frame gets a sequence number 0, 1, 2, ... (never reused). The frame
 * with sequence s lives in slot s % capacity while it is still in the ring.
 */
import { FRAME_SIZE, RAW_SIZE } from './features.ts';

export class FrameRing {
  readonly capacity: number;
  /** capacity × 126 raw landmark coordinates. */
  readonly hands: Float32Array;
  /** capacity × 132 frame features, computed once when the frame arrives. */
  readonly features: Float32Array;
  /** Presence bit-mask per frame (bit 0 = slot 0, bit 1 = slot 1). */
  readonly present: Uint8Array;
  /** Capture time of each frame in milliseconds. */
  readonly time: Float64Array;
  /** Hand speed at each frame, in hand sizes per second. */
  readonly speed: Float32Array;
  /** Number of frames ever pushed; the newest frame has sequence `total - 1`. */
  total = 0;

  constructor(capacity: number) {
    this.capacity = capacity;
    this.hands = new Float32Array(capacity * RAW_SIZE);
    this.features = new Float32Array(capacity * FRAME_SIZE);
    this.present = new Uint8Array(capacity);
    this.time = new Float64Array(capacity);
    this.speed = new Float32Array(capacity);
  }

  get size(): number {
    return Math.min(this.total, this.capacity);
  }

  /** Sequence number of the oldest frame still stored. */
  get oldest(): number {
    return this.total - this.size;
  }

  get newest(): number {
    return this.total - 1;
  }

  /** Reserves the slot for the next frame and returns it. The caller fills the arrays at that slot. */
  push(time: number): number {
    const slot = this.total % this.capacity;
    this.time[slot] = time;
    this.total++;
    return slot;
  }

  slot(seq: number): number {
    return seq % this.capacity;
  }

  has(seq: number): boolean {
    return seq >= this.oldest && seq < this.total;
  }

  /**
   * First sequence number whose time is >= `time`.
   *
   * ALGORITHM: binary search. Timestamps only ever increase, so the ring is
   * sorted by time and "which frame was 1.2 s ago?" takes O(log n) steps
   * instead of a scan.
   */
  lowerBound(time: number): number {
    let lo = this.oldest;
    let hi = this.total;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (this.time[mid % this.capacity] < time) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  clear() {
    this.total = 0;
  }
}

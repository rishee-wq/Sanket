/**
 * Debounces per-frame predictions into accepted signs.
 *
 * A label is accepted once it has stayed above `minConfidence` for `holdMs`.
 * After that it is locked: holding the same sign does not add it again. The
 * lock is released when the label changes or confidence drops (hand lowered)
 * for longer than `graceMs`, so short flickers neither reset the timer nor
 * count as a new sign.
 */
import type { Prediction } from './predictor';

export interface StabilityOptions {
  minConfidence: number;
  holdMs: number;
  graceMs: number;
}

export const DEFAULT_STABILITY: StabilityOptions = { minConfidence: 0.8, holdMs: 1000, graceMs: 200 };

export interface StabilityResult {
  /** Label currently being held, if any. */
  candidate: string | null;
  /** 0..1 progress towards acceptance; 1 while locked. */
  progress: number;
  /** True only on the frame where `candidate` is accepted. */
  accepted: boolean;
}

export class StabilityGate {
  private candidate: string | null = null;
  private since = 0;
  private lastMatch = 0;
  private locked = false;

  private readonly options: StabilityOptions;

  constructor(options: StabilityOptions = DEFAULT_STABILITY) {
    this.options = options;
  }

  update(prediction: Prediction | null, now: number): StabilityResult {
    const { minConfidence, holdMs, graceMs } = this.options;
    const confident = prediction !== null && prediction.confidence >= minConfidence;
    const graceOver = now - this.lastMatch > graceMs;

    if (confident && prediction.label === this.candidate) {
      this.lastMatch = now;
    } else if (confident && (this.candidate === null || graceOver)) {
      this.candidate = prediction.label;
      this.since = now;
      this.lastMatch = now;
      this.locked = false;
    } else if (!confident && graceOver) {
      this.candidate = null;
      this.locked = false;
    }

    if (this.candidate === null) return { candidate: null, progress: 0, accepted: false };
    if (this.locked) return { candidate: this.candidate, progress: 1, accepted: false };

    const progress = Math.min(1, (now - this.since) / holdMs);
    this.locked = progress >= 1;
    return { candidate: this.candidate, progress, accepted: this.locked };
  }

  reset() {
    this.candidate = null;
    this.locked = false;
  }
}

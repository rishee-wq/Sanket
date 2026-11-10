/**
 * Turning per-frame model outputs into committed signs.
 *
 * Two small state machines live here:
 *
 * LetterGate (static model): accepts a letter once it has been held still and
 * confident for `holdMs`. Probabilities are smoothed with an exponential moving
 * average first, so one noisy frame cannot flip the answer.
 *
 * WordSpotter (dynamic model): finds whole-word signs in a continuous stream.
 * This is the R-CNN recipe applied to time instead of image space:
 *   1. PROPOSALS   windows of several lengths that all end "now"
 *   2. CLASSIFY    the temporal CNN scores every proposal, including a
 *                  "background" class for windows that are not a sign
 *   3. NMS         of all overlapping proposals for one sign, only the
 *                  highest-scoring one survives (non-maximum suppression),
 *                  here by tracking the score's peak over time
 * After a sign is committed nothing is tracked until the hands pause or leave
 * (the boundary between signs). The next sign starts there, so signs can follow
 * each other without lowering the hands, and the tail of one sign is never
 * read as another.
 */

// ---------------------------------------------------------------------------
// Letters
// ---------------------------------------------------------------------------

export interface LetterOptions {
  /** Smoothed probability needed to count as a candidate. */
  minConfidence: number;
  /** How long a candidate must be held before it is accepted. */
  holdMs: number;
  /** Hand speed (hand sizes per second) above which the hand counts as moving. */
  stillSpeed: number;
  /** EMA weight of the newest frame. */
  smoothing: number;
  /** After this long without a confident match the lock is released. */
  graceMs: number;
}

export const DEFAULT_LETTER_OPTIONS: LetterOptions = {
  minConfidence: 0.7,
  holdMs: 320,
  stillSpeed: 1.6,
  smoothing: 0.55,
  graceMs: 160,
};

export interface LetterState {
  /** Class index being held, or -1. */
  candidate: number;
  confidence: number;
  /** 0..1 progress towards acceptance; stays 1 while locked. */
  progress: number;
  /** True only on the update where the candidate is accepted. */
  accepted: boolean;
}

export class LetterGate {
  private smoothed: Float32Array | null = null;
  private candidate = -1;
  private since = 0;
  private lastMatch = 0;
  private locked = false;
  readonly options: LetterOptions;

  constructor(options: Partial<LetterOptions> = {}) {
    this.options = { ...DEFAULT_LETTER_OPTIONS, ...options };
  }

  /** Smoothed probabilities of the last update (for the candidate bars). */
  get probabilities(): Float32Array | null {
    return this.smoothed;
  }

  /** `ignore` is the index of the "not a letter" class, if the model has one. */
  update(probs: Float32Array, speed: number, now: number, ignore = -1): LetterState {
    const { minConfidence, holdMs, stillSpeed, smoothing, graceMs } = this.options;

    // Exponential moving average: s = a * new + (1 - a) * s.
    if (!this.smoothed || this.smoothed.length !== probs.length) this.smoothed = Float32Array.from(probs);
    else for (let i = 0; i < probs.length; i++) this.smoothed[i] += smoothing * (probs[i] - this.smoothed[i]);

    let best = 0;
    for (let i = 1; i < this.smoothed.length; i++) if (this.smoothed[i] > this.smoothed[best]) best = i;
    const confidence = this.smoothed[best];
    const still = speed <= stillSpeed;
    const confident = confidence >= minConfidence && still && best !== ignore;
    const graceOver = now - this.lastMatch > graceMs;

    if (confident && best === this.candidate) {
      this.lastMatch = now;
    } else if (confident) {
      // A different confident letter replaces the candidate at once. The EMA above has
      // already filtered single-frame flicker, so there is no reason to wait.
      this.candidate = best;
      this.since = now;
      this.lastMatch = now;
      this.locked = false;
    } else if (!confident && graceOver) {
      this.candidate = -1;
      this.locked = false;
    }

    if (this.candidate === -1) return { candidate: -1, confidence, progress: 0, accepted: false };
    if (this.locked) return { candidate: this.candidate, confidence, progress: 1, accepted: false };
    const progress = Math.min(1, (now - this.since) / holdMs);
    this.locked = progress >= 1;
    return { candidate: this.candidate, confidence, progress, accepted: this.locked };
  }

  reset() {
    this.smoothed = null;
    this.candidate = -1;
    this.locked = false;
  }
}

// ---------------------------------------------------------------------------
// Words
// ---------------------------------------------------------------------------

export interface Proposal {
  /** First and last frame sequence numbers (inclusive). */
  start: number;
  end: number;
  startTime: number;
  endTime: number;
}

export interface Detection extends Proposal {
  label: number;
  score: number;
}

export interface WordOptions {
  /** Window lengths tried at every evaluation, in milliseconds. */
  windowsMs: number[];
  /** Shortest window worth classifying. */
  minWindowMs: number;
  /** Score needed to start tracking a detection. */
  threshold: number;
  /** A tracked detection is committed after this many evaluations without improvement. */
  patience: number;
  /** Wrist travel (in hand sizes) a window needs before it can be a word. */
  minTravel: number;
}

export const DEFAULT_WORD_OPTIONS: WordOptions = {
  windowsMs: [700, 1000, 1350, 1800, 2400],
  minWindowMs: 450,
  threshold: 0.55,
  patience: 3,
  minTravel: 1.2,
};

/** Overlap of two frame intervals divided by their union. */
export function temporalIoU(a: Proposal, b: Proposal): number {
  const inter = Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start) + 1);
  const union = a.end - a.start + 1 + (b.end - b.start + 1) - inter;
  return union > 0 ? inter / union : 0;
}

/**
 * Greedy non-maximum suppression: sort by score, keep the best, drop everything
 * that overlaps it by more than `maxIoU`, repeat. O(n log n + n·k).
 */
export function nonMaxSuppression(detections: Detection[], maxIoU = 0.3): Detection[] {
  const sorted = [...detections].sort((a, b) => b.score - a.score);
  const kept: Detection[] = [];
  for (const d of sorted) if (kept.every((k) => temporalIoU(k, d) <= maxIoU)) kept.push(d);
  return kept;
}

export type SpotterPhase = 'idle' | 'watching' | 'tracking' | 'cooldown';

export class WordSpotter {
  readonly options: WordOptions;
  /** Proposals may not start before this frame (end of the last committed sign + 1). */
  floor = 0;
  private pending: Detection | null = null;
  private misses = 0;
  phase: SpotterPhase = 'idle';
  /**
   * True from a commit until the hands pause or leave. The end of a sign (hands
   * dropping, or moving on) must not be read as another sign, so nothing is
   * tracked until the engine sees that boundary and calls restart().
   */
  cooling = false;

  constructor(options: Partial<WordOptions> = {}) {
    this.options = { ...DEFAULT_WORD_OPTIONS, ...options };
  }

  get tracking(): Detection | null {
    return this.pending;
  }

  /**
   * Feeds the detections of one evaluation (already limited to non-background
   * classes above a low score). Returns a detection when one is committed.
   *
   * Peak tracking: while the same label keeps scoring at least as well, the
   * best-scoring window is remembered. When the score stops improving for
   * `patience` evaluations the sign is over, and the remembered window (the
   * maximum) is committed. Every other window that overlapped it is
   * suppressed because `floor` moves past its end.
   */
  update(detections: Detection[]): Detection | null {
    const { threshold, patience } = this.options;
    if (this.cooling) return null;
    const best = nonMaxSuppression(detections.filter((d) => d.score >= threshold && d.start >= this.floor))[0] ?? null;

    if (best) {
      if (!this.pending) {
        this.pending = best;
        this.misses = 0;
      } else if (best.label === this.pending.label) {
        if (best.score >= this.pending.score) {
          this.pending = best;
          this.misses = 0;
        } else this.misses++;
      } else if (
        best.score > this.pending.score + 0.1 ||
        (best.start <= this.pending.start && best.end > this.pending.end && best.score >= this.pending.score - 0.05)
      ) {
        // A clearly better reading, or one that has seen MORE of the same movement and is
        // about as sure: the first guess was made on only the beginning of the sign.
        this.pending = best;
        this.misses = 0;
      } else this.misses++;
    } else if (this.pending) this.misses++;

    this.phase = this.pending ? 'tracking' : 'watching';
    if (this.pending && this.misses >= patience) return this.commit();
    return null;
  }

  /** Called when the hands leave the frame: whatever is being tracked is final. */
  flush(): Detection | null {
    return this.pending ? this.commit() : null;
  }

  private commit(): Detection {
    const done = this.pending!;
    this.pending = null;
    this.misses = 0;
    this.floor = done.end + 1;
    this.cooling = true;
    this.phase = 'cooldown';
    return done;
  }

  /** Starts a fresh segment at frame `seq` (hands just appeared, or mode changed). */
  restart(seq: number) {
    this.pending = null;
    this.misses = 0;
    this.cooling = false;
    this.floor = Math.max(this.floor, seq);
    this.phase = 'idle';
  }
}

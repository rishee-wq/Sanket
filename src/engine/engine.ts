/**
 * SignEngine: everything between "MediaPipe found these hands" and "the user
 * signed DOCTOR".
 *
 *   detected hands
 *     -> slots + aspect correction                      (features.ts)
 *     -> frame features, pushed into a ring buffer      (ringBuffer.ts)
 *     -> static CNN on every frame  -> LetterGate       (letters, digits)
 *     -> temporal CNN on windows    -> WordSpotter      (words)
 *     -> tokens
 *
 * The camera loop calls pushFrame() once per video frame and never waits:
 * model results arrive asynchronously, and a model that is still busy simply
 * skips a frame. Nothing here touches React; the UI reads `telemetry`.
 */
import {
  type DetectedHand,
  FRAME_SIZE,
  NUM_SLOTS,
  RAW_SIZE,
  SEQUENCE_LENGTH,
  SEQ_FRAME_SIZE,
  SHAPE_SIZE,
  frameFeatures,
  handScale,
  resampleIndices,
  sequenceFeatures,
  toSlots,
} from './features.ts';
import { topKIndices } from './heap.ts';
import type { SignModel } from './model.ts';
import { FrameRing } from './ringBuffer.ts';
import {
  type Detection,
  LetterGate,
  type LetterOptions,
  type Proposal,
  type SpotterPhase,
  type WordOptions,
  WordSpotter,
} from './spotter.ts';

export type EngineMode = 'auto' | 'letters' | 'words';

export interface Candidate {
  label: string;
  score: number;
}

export interface Token {
  kind: 'letter' | 'word';
  label: string;
  confidence: number;
  /** Capture time of the frame that completed the sign. */
  time: number;
  /** Milliseconds from that frame to the commit (model + decision latency). */
  latencyMs: number;
  alternatives: Candidate[];
}

export interface Telemetry {
  fps: number;
  /** Time spent in pushFrame (slots, features, motion, proposals). */
  featureMs: number;
  staticMs: number;
  dynamicMs: number;
  hands: number;
  /** Hand speed in hand sizes per second. */
  speed: number;
  frames: number;
  ringFill: number;
  phase: SpotterPhase;
  proposals: number;
  letter: { label: string | null; progress: number; confidence: number; top: Candidate[] };
  word: { label: string | null; score: number; background: number; top: Candidate[] };
  staticRuns: number;
  dynamicRuns: number;
}

export interface EngineOptions {
  staticModel: SignModel | null;
  dynamicModel: SignModel | null;
  mode?: EngineMode;
  onToken: (token: Token) => void;
  letters?: Partial<LetterOptions>;
  words?: Partial<WordOptions>;
}

/** Hands missing for this long ends the current segment. */
const GAP_MS = 220;
/** After a word, the hands must stay this slow for this long (or leave) before the next word can start. */
const PAUSE_SPEED = 1.4;
const PAUSE_MS = 110;
/** In auto mode a letter must be held longer, because word signs contain short holds too. */
const AUTO_HOLD_FACTOR = 1.7;
/** Minimum time between two word evaluations. */
const EVAL_INTERVAL_MS = 80;
/** Letters are held back this long after a word, so a word's final pose is not read as a letter. */
const LETTER_BLOCK_AFTER_WORD_MS = 550;
const MAX_PROPOSALS = 6;
const RING_CAPACITY = 256;
/** Landmarks averaged into the palm centre used for the speed estimate: wrist, index base, pinky base. */
const PALM = [0, 5, 17];

function emptyTelemetry(): Telemetry {
  return {
    fps: 0,
    featureMs: 0,
    staticMs: 0,
    dynamicMs: 0,
    hands: 0,
    speed: 0,
    frames: 0,
    ringFill: 0,
    phase: 'idle',
    proposals: 0,
    letter: { label: null, progress: 0, confidence: 0, top: [] },
    word: { label: null, score: 0, background: 1, top: [] },
    staticRuns: 0,
    dynamicRuns: 0,
  };
}

export class SignEngine {
  readonly ring = new FrameRing(RING_CAPACITY);
  readonly telemetry: Telemetry = emptyTelemetry();
  readonly letterGate: LetterGate;
  readonly spotter: WordSpotter;
  mode: EngineMode;

  private readonly staticModel: SignModel | null;
  private readonly dynamicModel: SignModel | null;
  private readonly onToken: (token: Token) => void;

  private staticBusy = false;
  private dynamicBusy = false;
  private lastEval = -Infinity;
  private lastFrameTime = -Infinity;
  private lastHandTime = -Infinity;
  private lastHandSeq = -1;
  private handsVisible = false;
  private segmentStart = 0;
  private speed = 0;
  private slowSince = -Infinity;
  private baseHoldMs = 0;
  private lettersBlockedUntil = -Infinity;
  private disposed = false;
  private readonly batch: Float32Array;
  private readonly windowHands = new Float32Array(SEQUENCE_LENGTH * RAW_SIZE);
  private readonly windowFeatures = new Float32Array(SEQUENCE_LENGTH * FRAME_SIZE);
  private readonly windowPresent = new Uint8Array(SEQUENCE_LENGTH);

  constructor(options: EngineOptions) {
    this.staticModel = options.staticModel;
    this.dynamicModel = options.dynamicModel;
    this.onToken = options.onToken;
    this.mode = options.mode ?? 'auto';
    this.letterGate = new LetterGate(options.letters);
    this.baseHoldMs = this.letterGate.options.holdMs;
    this.applyHold();
    this.spotter = new WordSpotter(options.words);
    this.batch = new Float32Array(MAX_PROPOSALS * SEQUENCE_LENGTH * SEQ_FRAME_SIZE);
  }

  get lettersActive(): boolean {
    return this.staticModel !== null && (this.mode !== 'words' || this.dynamicModel === null);
  }

  get wordsActive(): boolean {
    return this.dynamicModel !== null && (this.mode !== 'letters' || this.staticModel === null);
  }

  /** Called once per camera frame with MediaPipe's result. `aspect` is video width / height. */
  pushFrame(detected: DetectedHand[], aspect: number, time: number) {
    if (this.disposed) return;
    const t0 = performance.now();
    const { ring, telemetry } = this;

    const slot = ring.push(time);
    const seq = ring.newest;
    const bits = toSlots(detected, aspect, ring.hands, slot * RAW_SIZE);
    ring.present[slot] = bits;
    frameFeatures(ring.hands, slot * RAW_SIZE, bits, ring.features, slot * FRAME_SIZE);
    ring.speed[slot] = this.updateSpeed(seq, time);

    if (this.lastFrameTime > -Infinity && time > this.lastFrameTime) {
      const fps = 1000 / (time - this.lastFrameTime);
      telemetry.fps = telemetry.fps ? telemetry.fps * 0.9 + fps * 0.1 : fps;
    }
    this.lastFrameTime = time;
    telemetry.hands = (bits & 1) + ((bits >> 1) & 1);
    telemetry.speed = this.speed;
    telemetry.frames = ring.total;
    telemetry.ringFill = ring.size / ring.capacity;

    if (bits) {
      if (!this.handsVisible) {
        // Hands just came into view: a new segment starts here.
        this.handsVisible = true;
        this.segmentStart = seq;
        this.spotter.restart(seq);
        this.letterGate.reset();
      }
      this.lastHandTime = time;
      this.lastHandSeq = seq;
      // A pause after a committed word is the boundary where the next sign may begin.
      if (this.speed > PAUSE_SPEED) this.slowSince = -Infinity;
      else if (this.slowSince === -Infinity) this.slowSince = time;
      if (this.spotter.cooling && time - this.slowSince >= PAUSE_MS) {
        this.spotter.restart(seq);
        telemetry.phase = 'watching';
      }
      if (this.lettersActive) this.runLetters(slot, time);
      if (this.wordsActive && time - this.lastEval >= EVAL_INTERVAL_MS) this.runWords(seq, time, false);
    } else if (this.handsVisible && time - this.lastHandTime > GAP_MS) {
      // Hands have been gone long enough: finish whatever was being signed.
      this.handsVisible = false;
      this.letterGate.reset();
      telemetry.letter = { label: null, progress: 0, confidence: 0, top: [] };
      if (this.wordsActive) this.runWords(this.lastHandSeq, time, true);
      else telemetry.phase = 'idle';
    }

    const ms = performance.now() - t0;
    telemetry.featureMs = telemetry.featureMs ? telemetry.featureMs * 0.9 + ms * 0.1 : ms;
  }

  /**
   * Hand speed in hand sizes per second: how far the palm centre moved since
   * the previous frame, divided by the hand's size and the time step, then
   * smoothed. Dividing by hand size makes it independent of camera distance.
   */
  private updateSpeed(seq: number, time: number): number {
    const { ring } = this;
    if (seq === 0 || !ring.has(seq - 1)) return (this.speed = 0);
    const cur = ring.slot(seq);
    const prev = ring.slot(seq - 1);
    const dt = (time - ring.time[prev]) / 1000;
    if (dt <= 0) return this.speed;
    let fastest = -1;
    for (let s = 0; s < NUM_SLOTS; s++) {
      if (!((ring.present[cur] >> s) & 1) || !((ring.present[prev] >> s) & 1)) continue;
      let dx = 0;
      let dy = 0;
      for (const p of PALM) {
        dx += ring.hands[cur * RAW_SIZE + s * SHAPE_SIZE + p * 3] - ring.hands[prev * RAW_SIZE + s * SHAPE_SIZE + p * 3];
        dy += ring.hands[cur * RAW_SIZE + s * SHAPE_SIZE + p * 3 + 1] - ring.hands[prev * RAW_SIZE + s * SHAPE_SIZE + p * 3 + 1];
      }
      const scale = Math.max(handScale(ring.hands, cur * RAW_SIZE, s), 1e-6);
      fastest = Math.max(fastest, Math.hypot(dx, dy) / PALM.length / scale / dt);
    }
    if (fastest < 0) return this.speed; // no hand in both frames: keep the last estimate
    this.speed += 0.5 * (fastest - this.speed);
    return this.speed;
  }

  // -------------------------------------------------------------------------
  // Letters
  // -------------------------------------------------------------------------

  private runLetters(slot: number, time: number) {
    const model = this.staticModel;
    if (!model || this.staticBusy) return;
    this.staticBusy = true;
    const started = performance.now();
    const speed = this.speed;
    const input = this.ring.features.slice(slot * FRAME_SIZE, (slot + 1) * FRAME_SIZE);
    model.predict(input).then(
      (probs) => {
        this.staticBusy = false;
        if (this.disposed || !this.handsVisible) return;
        const { telemetry } = this;
        const ms = performance.now() - started;
        telemetry.staticMs = telemetry.staticMs ? telemetry.staticMs * 0.9 + ms * 0.1 : ms;
        telemetry.staticRuns++;

        const blocked = this.spotter.tracking !== null || time < this.lettersBlockedUntil;
        const state = this.letterGate.update(probs, blocked ? Infinity : speed, time, model.backgroundIndex);
        const smoothed = this.letterGate.probabilities ?? probs;
        const top = topKIndices(smoothed, 3, model.backgroundIndex).map((s) => ({ label: model.labels[s.item], score: s.score }));
        telemetry.letter = {
          label: state.candidate >= 0 ? model.labels[state.candidate] : null,
          progress: state.progress,
          confidence: state.confidence,
          top,
        };
        if (state.accepted) {
          // The movement that brought the hand here was not a word.
          this.spotter.restart(this.ring.newest + 1);
          this.emit('letter', model.labels[state.candidate], state.confidence, time, top);
        }
      },
      () => {
        this.staticBusy = false;
      }
    );
  }

  // -------------------------------------------------------------------------
  // Words
  // -------------------------------------------------------------------------

  /** Builds the proposal windows that end at frame `end`. */
  private proposals(end: number): Proposal[] {
    const { ring, spotter } = this;
    const endTime = ring.time[ring.slot(end)];
    const floor = Math.max(spotter.floor, this.segmentStart, ring.oldest);
    const out: Proposal[] = [];
    const add = (start: number) => {
      let s = Math.max(start, floor);
      while (s < end && ring.present[ring.slot(s)] === 0) s++; // trim leading empty frames
      const startTime = ring.time[ring.slot(s)];
      if (end - s + 1 < 8 || endTime - startTime < spotter.options.minWindowMs) return;
      if (out.some((p) => p.start === s)) return;
      out.push({ start: s, end, startTime, endTime });
    };
    for (const ms of spotter.options.windowsMs) add(ring.lowerBound(endTime - ms));
    return out.slice(0, MAX_PROPOSALS);
  }

  /** Resamples one proposal to 32 frames and writes its 32 × 136 features into the batch. Returns wrist travel. */
  private fillWindow(p: Proposal, row: number): number {
    const { ring } = this;
    const idx = resampleIndices(p.end - p.start + 1);
    for (let i = 0; i < SEQUENCE_LENGTH; i++) {
      const slot = ring.slot(p.start + idx[i]);
      this.windowHands.set(ring.hands.subarray(slot * RAW_SIZE, (slot + 1) * RAW_SIZE), i * RAW_SIZE);
      this.windowFeatures.set(ring.features.subarray(slot * FRAME_SIZE, (slot + 1) * FRAME_SIZE), i * FRAME_SIZE);
      this.windowPresent[i] = ring.present[slot];
    }
    const offset = row * SEQUENCE_LENGTH * SEQ_FRAME_SIZE;
    sequenceFeatures(this.windowHands, this.windowPresent, SEQUENCE_LENGTH, this.batch, offset, this.windowFeatures);

    // Travel: summed wrist path length, already in hand sizes thanks to the trajectory features.
    let travel = 0;
    for (let s = 0; s < NUM_SLOTS; s++) {
      let path = 0;
      let last = -1;
      for (let i = 0; i < SEQUENCE_LENGTH; i++) {
        if (!((this.windowPresent[i] >> s) & 1)) continue;
        const k = offset + i * SEQ_FRAME_SIZE + FRAME_SIZE + s * 2;
        if (last >= 0) path += Math.hypot(this.batch[k] - this.batch[last], this.batch[k + 1] - this.batch[last + 1]);
        last = k;
      }
      travel = Math.max(travel, path);
    }
    return travel;
  }

  private runWords(end: number, time: number, final: boolean) {
    const model = this.dynamicModel;
    if (!model) return;
    if (this.dynamicBusy) {
      // A final evaluation must not be dropped: retry as soon as the model is free.
      if (final) setTimeout(() => this.runWords(end, time, true), 8);
      return;
    }
    const proposals = end >= 0 && this.ring.has(end) ? this.proposals(end) : [];
    this.telemetry.proposals = proposals.length;
    if (proposals.length === 0) {
      if (final) {
        const pending = this.spotter.flush();
        if (pending) this.commitWord(pending, model);
        this.finishSegment();
      }
      return;
    }
    this.lastEval = time;
    const travel = proposals.map((p, i) => this.fillWindow(p, i));
    this.dynamicBusy = true;
    const started = performance.now();
    const input = this.batch.slice(0, proposals.length * SEQUENCE_LENGTH * SEQ_FRAME_SIZE);

    model.predict(input, proposals.length).then(
      (probs) => {
        this.dynamicBusy = false;
        if (this.disposed) return;
        const { telemetry, spotter } = this;
        const ms = performance.now() - started;
        telemetry.dynamicMs = telemetry.dynamicMs ? telemetry.dynamicMs * 0.9 + ms * 0.1 : ms;
        telemetry.dynamicRuns++;

        const classes = model.classes;
        const detections: (Detection & { top: Candidate[] })[] = [];
        let shown: { top: Candidate[]; background: number } | null = null;
        for (let i = 0; i < proposals.length; i++) {
          const row = probs.subarray(i * classes, (i + 1) * classes);
          const ranked = topKIndices(row, 3, model.backgroundIndex);
          const top = ranked.map((s) => ({ label: model.labels[s.item], score: s.score }));
          if (!shown || top[0].score > shown.top[0].score) {
            shown = { top, background: model.backgroundIndex >= 0 ? row[model.backgroundIndex] : 0 };
          }
          if (travel[i] < spotter.options.minTravel) continue;
          detections.push({ ...proposals[i], label: ranked[0].item, score: ranked[0].score, top });
        }

        let committed = spotter.update(detections);
        if (!committed && final) committed = spotter.flush();
        const tracking = spotter.tracking;
        telemetry.word = {
          label: tracking ? model.labels[tracking.label] : null,
          score: tracking ? tracking.score : (shown?.top[0].score ?? 0),
          background: shown?.background ?? 1,
          top: shown?.top ?? [],
        };
        if (committed) this.commitWord(committed, model);
        if (final) this.finishSegment();
        else telemetry.phase = spotter.phase;
      },
      () => {
        this.dynamicBusy = false;
      }
    );
  }

  private commitWord(detection: Detection, model: SignModel) {
    const top = (detection as Detection & { top?: Candidate[] }).top ?? [];
    this.lettersBlockedUntil = this.lastFrameTime + LETTER_BLOCK_AFTER_WORD_MS;
    this.letterGate.reset();
    this.emit('word', model.labels[detection.label], detection.score, detection.endTime, top);
  }

  private finishSegment() {
    this.spotter.restart(this.ring.total);
    this.telemetry.phase = 'idle';
    this.telemetry.word = { label: null, score: 0, background: 1, top: [] };
  }

  private emit(kind: Token['kind'], label: string, confidence: number, time: number, alternatives: Candidate[]) {
    this.onToken({ kind, label, confidence, time, latencyMs: Math.max(0, this.lastFrameTime - time), alternatives });
  }

  private applyHold() {
    this.letterGate.options.holdMs = this.baseHoldMs * (this.mode === 'auto' && this.dynamicModel ? AUTO_HOLD_FACTOR : 1);
  }

  setMode(mode: EngineMode) {
    if (mode === this.mode) return;
    this.mode = mode;
    this.applyHold();
    this.letterGate.reset();
    this.spotter.restart(this.ring.total);
    this.telemetry.letter = { label: null, progress: 0, confidence: 0, top: [] };
    this.telemetry.word = { label: null, score: 0, background: 1, top: [] };
  }

  /** Forgets everything in flight (camera stopped, or the view changed). */
  reset() {
    this.handsVisible = false;
    this.speed = 0;
    this.slowSince = -Infinity;
    this.lastFrameTime = -Infinity;
    this.lastEval = -Infinity;
    this.letterGate.reset();
    this.spotter.restart(this.ring.total);
    Object.assign(this.telemetry, emptyTelemetry(), {
      staticMs: this.telemetry.staticMs,
      dynamicMs: this.telemetry.dynamicMs,
    });
  }

  dispose() {
    this.disposed = true;
  }
}

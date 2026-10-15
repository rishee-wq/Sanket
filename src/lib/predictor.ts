/**
 * Sign predictors. The UI only talks to the `Predictor` interface, so the mock and the
 * trained TF.js model are interchangeable. Model files follow docs/preprocessing.md §6.
 */
import type * as tfType from '@tensorflow/tfjs';
import type { DetectedHand, NormalizedLandmark } from '../types/isl';
import { FEATURES_PER_HAND, SequenceBuffer, assignHandSlots, handsToFeatures } from './preprocess';

export interface ModelConfig {
  type: 'static' | 'dynamic';
  /** Frames per sample; only used by dynamic models. */
  sequenceLength: number;
  numHands: number;
}

export type PredictorKind = 'mock' | 'tfjs';

export interface Prediction {
  label: string;
  /** Probability of `label`, 0..1. Simulated for the mock predictor. */
  confidence: number;
  /** One probability per entry of `Predictor.labels`. */
  probabilities: Float32Array;
  source: PredictorKind;
}

export interface Predictor {
  readonly kind: PredictorKind;
  readonly labels: readonly string[];
  readonly config: ModelConfig;
  /**
   * Called once per video frame. Returns null when there is nothing to predict:
   * no hands, an unrecognized shape (mock), or a dynamic model still filling its window.
   */
  predict(hands: DetectedHand[]): Prediction | null;
  /** Forget any per-sequence state. */
  reset(): void;
  dispose(): void;
}

function toPrediction(labels: readonly string[], probabilities: Float32Array, source: PredictorKind): Prediction {
  let best = 0;
  for (let i = 1; i < probabilities.length; i++) if (probabilities[i] > probabilities[best]) best = i;
  return { label: labels[best], confidence: probabilities[best], probabilities, source };
}

// ---------------------------------------------------------------------------
// Mock predictor: rule-based finger-state checks on a single hand.
// It exists so the whole pipeline works before a model is trained. Its
// confidence is a fixed simulated value and must not be reported as accuracy.
// ---------------------------------------------------------------------------

export const MOCK_LABELS = [
  'Hello', 'Yes', 'No', 'Pain', '1', '2', '3', 'Doctor', 'Help', 'Water', 'Thank you', 'O', 'SOS',
] as const;

const MOCK_CONFIDENCE = 0.9;

function distance(a: NormalizedLandmark, b: NormalizedLandmark) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

/** Classifies a hand shape, or returns null when no rule matches. */
export function classifyHandShape(lm: NormalizedLandmark[]): (typeof MOCK_LABELS)[number] | null {
  const wrist = lm[0];
  // Wrist to middle-finger base: a palm size that does not change when fingers curl.
  const palm = distance(wrist, lm[9]) || 1;
  const extended = (tip: number, pip: number) => distance(lm[tip], wrist) > distance(lm[pip], wrist) * 1.15;

  const thumb = distance(lm[4], wrist) > distance(lm[3], wrist) * 1.08 && distance(lm[4], lm[5]) / palm > 0.45;
  // Thumb folded right across the palm (tip near the middle/ring knuckles), not just held close.
  // Measured in the image plane: MediaPipe's depth is too noisy for this.
  const flat = (a: NormalizedLandmark, b: NormalizedLandmark) => Math.hypot(a.x - b.x, a.y - b.y);
  const thumbTucked = Math.min(flat(lm[4], lm[9]), flat(lm[4], lm[13])) / palm < 0.42;
  const index = extended(8, 6);
  const middle = extended(12, 10);
  const ring = extended(16, 14);
  const pinky = extended(20, 18);
  const count = [thumb, index, middle, ring, pinky].filter(Boolean).length;
  const thumbTouchesIndex = distance(lm[4], lm[8]) / palm < 0.25;

  if (count === 5) return 'Hello';
  if (count === 0) return 'No';
  if (thumb && count === 1) return lm[4].y < wrist.y ? 'Yes' : 'Pain';
  if (index && !middle && !ring && !pinky) return thumb ? 'Doctor' : '1';
  if (index && middle && !ring && !pinky) return '2';
  if (index && middle && ring && !pinky) return '3';
  if (!thumb && index && middle && ring && pinky) {
    // Thumb folded across the palm: the first half of the international "Signal for Help".
    // A relaxed open palm (thumb resting beside the index finger) is still a greeting.
    return thumbTucked ? 'SOS' : 'Hello';
  }
  if (thumb && index && !middle && !ring && pinky) return 'Help';
  if (!thumb && !index && !middle && !ring && pinky) return 'Water';
  if (thumbTouchesIndex && middle && ring && pinky) return 'Thank you';
  if (thumbTouchesIndex && !middle && !ring && !pinky) return 'O';
  return null;
}

export class MockPredictor implements Predictor {
  readonly kind = 'mock';
  readonly labels: readonly string[] = MOCK_LABELS;
  readonly config: ModelConfig = { type: 'static', sequenceLength: 1, numHands: 1 };

  predict(hands: DetectedHand[]): Prediction | null {
    const [hand] = assignHandSlots(hands, 1);
    if (!hand) return null;
    const label = classifyHandShape(hand.landmarks);
    if (!label) return null;

    const rest = (1 - MOCK_CONFIDENCE) / (this.labels.length - 1);
    const probabilities = new Float32Array(this.labels.length).fill(rest);
    probabilities[this.labels.indexOf(label)] = MOCK_CONFIDENCE;
    return toPrediction(this.labels, probabilities, this.kind);
  }

  reset() {}
  dispose() {}
}

// ---------------------------------------------------------------------------
// TF.js predictor: loads public/model/{model.json, labels.json, config.json}.
// ---------------------------------------------------------------------------

/** After this many frames without hands, a dynamic model's window is cleared. */
const DYNAMIC_EMPTY_FRAMES_RESET = 10;

export class TfjsPredictor implements Predictor {
  readonly kind = 'tfjs';
  private readonly buffer: SequenceBuffer | null;
  private emptyFrames = 0;

  private constructor(
    private readonly tf: typeof tfType,
    private readonly model: tfType.LayersModel,
    private readonly inputShape: number[],
    readonly labels: readonly string[],
    readonly config: ModelConfig
  ) {
    const frameSize = config.numHands * FEATURES_PER_HAND;
    this.buffer = config.type === 'dynamic' ? new SequenceBuffer(config.sequenceLength, frameSize) : null;
  }

  static async load(baseUrl: string): Promise<TfjsPredictor> {
    const fetchJson = async (file: string) => {
      const res = await fetch(baseUrl + file);
      // The dev server answers missing files with index.html, so check the type too.
      if (!res.ok || !res.headers.get('content-type')?.includes('json')) throw new Error(`${file} not found`);
      return res.json();
    };
    const [labels, config] = (await Promise.all([fetchJson('labels.json'), fetchJson('config.json')])) as [
      string[],
      ModelConfig,
    ];

    // Loaded lazily so the mock-only app does not pay for the TF.js bundle up front.
    const tf = await import('@tensorflow/tfjs');
    await tf.ready();
    const model = await tf.loadLayersModel(baseUrl + 'model.json');

    // Accept any input layout whose size matches the spec, e.g. [126] for an MLP,
    // [42, 3] for a Conv1D over landmarks, or [30, 126] for a sequence model.
    const inputShape = model.inputs[0].shape.slice(1).map((d) => d ?? -1);
    const frameSize = config.numHands * FEATURES_PER_HAND;
    const expected = config.type === 'dynamic' ? config.sequenceLength * frameSize : frameSize;
    const actual = inputShape.reduce((a, b) => a * b, 1);
    const outputUnits = model.outputs[0].shape[model.outputs[0].shape.length - 1];

    if (actual !== expected) {
      model.dispose();
      throw new Error(`model input has ${actual} values, config.json implies ${expected}`);
    }
    if (outputUnits !== labels.length) {
      model.dispose();
      throw new Error(`model has ${outputUnits} outputs but labels.json has ${labels.length} labels`);
    }
    return new TfjsPredictor(tf, model, inputShape, labels, config);
  }

  predict(hands: DetectedHand[]): Prediction | null {
    if (hands.length === 0) {
      if (++this.emptyFrames >= DYNAMIC_EMPTY_FRAMES_RESET) this.buffer?.clear();
      return null;
    }
    this.emptyFrames = 0;

    const features = handsToFeatures(hands, this.config.numHands);
    let input = features;
    if (this.buffer) {
      this.buffer.push(features);
      if (!this.buffer.isFull) return null;
      input = this.buffer.toArray();
    }

    const { tf, model, inputShape } = this;
    const output = tf.tidy(() => {
      const x = tf.tensor(input, [1, ...inputShape]);
      return (model.predict(x) as tfType.Tensor).reshape([-1]);
    });
    const probabilities = new Float32Array(output.dataSync());
    output.dispose();
    return toPrediction(this.labels, probabilities, this.kind);
  }

  reset() {
    this.buffer?.clear();
    this.emptyFrames = 0;
  }

  dispose() {
    this.model.dispose();
  }
}

export const MODEL_BASE_URL = `${import.meta.env.BASE_URL}model/`;

/** Loads the trained model if one is present in public/model/, otherwise the mock. */
export async function createPredictor(
  kind: PredictorKind
): Promise<{ predictor: Predictor; fallbackReason: string | null }> {
  if (kind === 'mock') return { predictor: new MockPredictor(), fallbackReason: null };
  try {
    return { predictor: await TfjsPredictor.load(MODEL_BASE_URL), fallbackReason: null };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.info(`[predictor] No usable TF.js model (${reason}); using the mock predictor.`);
    return { predictor: new MockPredictor(), fallbackReason: reason };
  }
}

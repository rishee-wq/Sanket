/**
 * A trained TF.js model plus its labels, config and calibration.
 * Model files are described in docs/preprocessing.md §6.
 */
import type * as tfType from '@tensorflow/tfjs';

export interface ModelConfig {
  type: 'static' | 'dynamic';
  /** Values per frame: 132 (static) or 136 (dynamic). */
  frameSize: number;
  /** Frames per window; only dynamic models have it. */
  sequenceLength?: number;
  numHands: number;
  /** Input shape without the batch dimension. */
  inputShape: number[];
  /** Calibration temperature fitted on the validation set. */
  temperature: number;
  /** Label of the "no sign here" class; only dynamic models have it. */
  background?: string;
  version: number;
}

export class SignModel {
  readonly inputSize: number;
  readonly classes: number;
  /** Index of the background class, or -1. */
  readonly backgroundIndex: number;
  private readonly tf: typeof tfType;
  private readonly model: tfType.LayersModel;
  private dual: tfType.LayersModel | null = null;
  /**
   * Mean unit embedding of every class (rows in label order), from prototypes.json.
   * A taught sign must be closer than all of these to count (fewshot.ts).
   */
  builtin: Float32Array | null = null;
  readonly labels: readonly string[];
  readonly config: ModelConfig;

  constructor(tf: typeof tfType, model: tfType.LayersModel, labels: readonly string[], config: ModelConfig) {
    this.tf = tf;
    this.model = model;
    this.labels = labels;
    this.config = config;
    this.inputSize = config.inputShape.reduce((a, b) => a * b, 1);
    this.classes = labels.length;
    this.backgroundIndex = config.background ? labels.indexOf(config.background) : -1;

    const actual = model.inputs[0].shape.slice(1).reduce((a: number, b) => a * (b ?? 1), 1);
    const outputs = model.outputs[0].shape[model.outputs[0].shape.length - 1];
    if (actual !== this.inputSize) throw new Error(`model input has ${actual} values, config.json implies ${this.inputSize}`);
    if (outputs !== labels.length) throw new Error(`model has ${outputs} outputs but labels.json has ${labels.length} labels`);
  }

  /**
   * Runs `batch` inputs (flattened, row-major) and returns batch × classes
   * calibrated probabilities. The GPU read-back is awaited, so the camera loop
   * is never blocked while the result is on its way.
   */
  async predict(input: Float32Array, batch = 1): Promise<Float32Array> {
    const { tf } = this;
    const output = tf.tidy(() => {
      const x = tf.tensor(input.subarray(0, batch * this.inputSize), [batch, ...this.config.inputShape]);
      return this.model.predict(x) as tfType.Tensor;
    });
    const probs = (await output.data()) as Float32Array;
    output.dispose();
    return calibrate(probs, this.classes, this.config.temperature);
  }

  /**
   * Like predict(), but also returns each input's embedding: the output of the
   * layer named "embedding", just before the classifier, L2-normalised. Both come
   * from one forward pass through a second model that shares the same weights.
   * Used to compare a sign with the user's own taught signs (fewshot.ts).
   */
  async predictWithEmbedding(input: Float32Array, batch = 1): Promise<{ probs: Float32Array; embeddings: Float32Array; size: number }> {
    const { tf } = this;
    this.dual ??= tf.model({
      inputs: this.model.inputs,
      outputs: [this.model.outputs[0], this.model.getLayer('embedding').output as tfType.SymbolicTensor],
    });
    const dual = this.dual;
    const [p, e] = tf.tidy(() => {
      const x = tf.tensor(input.subarray(0, batch * this.inputSize), [batch, ...this.config.inputShape]);
      return dual.predict(x) as tfType.Tensor[];
    });
    const [probs, raw] = (await Promise.all([p.data(), e.data()])) as [Float32Array, Float32Array];
    p.dispose();
    e.dispose();
    const size = raw.length / batch;
    const embeddings = new Float32Array(raw.length);
    for (let r = 0; r < batch; r++) {
      let n = 0;
      for (let i = 0; i < size; i++) n += raw[r * size + i] ** 2;
      n = Math.sqrt(n) || 1;
      for (let i = 0; i < size; i++) embeddings[r * size + i] = raw[r * size + i] / n;
    }
    return { probs: calibrate(probs, this.classes, this.config.temperature), embeddings, size };
  }

  /** Compiles the GPU programs before the first real frame. */
  async warmUp() {
    await this.predict(new Float32Array(this.inputSize), 1);
  }

  dispose() {
    this.model.dispose();
  }
}

/**
 * Temperature scaling: p' = softmax(log(p) / T), row by row. Equivalent to
 * dividing the logits by T before the softmax. T is fitted in training so that
 * a reported 90% is right about 90% of the time.
 */
export function calibrate(probs: Float32Array, classes: number, temperature: number): Float32Array {
  if (Math.abs(temperature - 1) < 1e-3) return probs;
  const out = new Float32Array(probs.length);
  for (let row = 0; row < probs.length; row += classes) {
    let max = -Infinity;
    for (let i = 0; i < classes; i++) {
      const v = Math.log(Math.max(probs[row + i], 1e-12)) / temperature;
      out[row + i] = v;
      if (v > max) max = v;
    }
    let sum = 0;
    for (let i = 0; i < classes; i++) {
      const e = Math.exp(out[row + i] - max);
      out[row + i] = e;
      sum += e;
    }
    for (let i = 0; i < classes; i++) out[row + i] /= sum;
  }
  return out;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  // The dev server answers missing files with index.html, so check the type too.
  if (!res.ok || !res.headers.get('content-type')?.includes('json')) throw new Error(`${url} not found`);
  return res.json() as Promise<T>;
}

/** Loads model.json, labels.json and config.json from `baseUrl` (which ends with a slash). */
export async function loadSignModel(tf: typeof tfType, baseUrl: string): Promise<SignModel> {
  const [labels, config, model] = await Promise.all([
    fetchJson<string[]>(`${baseUrl}labels.json`),
    fetchJson<ModelConfig>(`${baseUrl}config.json`),
    tf.loadLayersModel(`${baseUrl}model.json`),
  ]);
  const signModel = new SignModel(tf, model, labels, config);
  // Optional: only "Teach your own sign" needs it.
  try {
    const protos = await fetchJson<{ size: number; vectors: number[][] }>(`${baseUrl}prototypes.json`);
    signModel.builtin = Float32Array.from(protos.vectors.flat());
  } catch {
    signModel.builtin = null;
  }
  await signModel.warmUp();
  return signModel;
}

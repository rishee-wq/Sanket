/**
 * Few-shot learning for "Teach your own sign" (a prototypical network).
 *
 * The trained models already turn any sign into an "embedding": the 160 (words)
 * or 128 (letters) numbers just before the last layer, where different signs
 * land far apart. To learn a NEW sign we do not retrain anything:
 *
 *   1. Record it 3-5 times and embed each recording.
 *   2. L2-normalise and average them: that average is the sign's PROTOTYPE.
 *   3. A new movement is that sign if its embedding is close enough to the
 *      prototype (cosine similarity) and closer than to any other prototype.
 *
 * "Close enough" means both of these, measured in ml/eval_fewshot.py on 15
 * words the network never saw (3 taught signs, 5 examples each):
 *   - cosine similarity to the prototype of at least 0.80, and
 *   - no more than 0.10 below the closest BUILT-IN class (any of the 70 words,
 *     or "no sign"). This "nearest class mean" check is what stops rest poses
 *     and ordinary words from being read as a taught sign.
 * At that setting 68% of real performances were accepted and 4% of other
 * movements wrongly accepted. A similarity threshold alone was worse (64% at a
 * similar error rate), and requiring the taught sign to beat every built-in
 * class outright was too strict (45%).
 *
 * ml/eval_fewshot.py measures this on 15 words the network never saw.
 */
import { FRAME_SIZE, NUM_SLOTS, RAW_SIZE, SEQUENCE_LENGTH, SEQ_FRAME_SIZE, SHAPE_SIZE, resampleIndices, sequenceFeatures } from './features.ts';

export type CustomKind = 'movement' | 'shape';

/** One recorded example: raw landmarks, so embeddings can be recomputed if a model changes. */
export interface Recording {
  /** frames × 126 aspect-corrected coordinates. */
  hands: Float32Array;
  /** Presence bit-mask per frame. */
  present: Uint8Array;
  frames: number;
}

export interface CustomSign {
  id: string;
  /** What is typed and spoken when the sign is recognised. */
  text: string;
  kind: CustomKind;
  recordings: Recording[];
  created: number;
}

/** A sign ready for matching. */
export interface Prototype {
  id: string;
  text: string;
  kind: CustomKind;
  /** Unit-length mean embedding. */
  vector: Float32Array;
  threshold: number;
  /** Leave-one-out similarities, shown as a consistency score. */
  consistency: number[];
}

/** Minimum cosine similarity to a taught prototype (eval_fewshot.py operating point). */
export const THRESHOLD = 0.8;
/** How far below the closest built-in class a taught sign may be and still win. */
export const BUILTIN_MARGIN = 0.1;
export const MIN_EXAMPLES = 3;

export function normalize(v: Float32Array): Float32Array {
  let n = 0;
  for (let i = 0; i < v.length; i++) n += v[i] * v[i];
  n = Math.sqrt(n) || 1;
  const out = new Float32Array(v.length);
  for (let i = 0; i < v.length; i++) out[i] = v[i] / n;
  return out;
}

export function dot(a: Float32Array, b: Float32Array, bOffset = 0): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[bOffset + i];
  return s;
}

/** Normalised mean of unit vectors. */
export function meanVector(vectors: Float32Array[]): Float32Array {
  const out = new Float32Array(vectors[0].length);
  for (const v of vectors) for (let i = 0; i < v.length; i++) out[i] += v[i];
  return normalize(out);
}

/** Builds a prototype from unit-length example embeddings. */
export function buildPrototype(sign: Pick<CustomSign, 'id' | 'text' | 'kind'>, embeddings: Float32Array[]): Prototype {
  const vector = meanVector(embeddings);
  const consistency =
    embeddings.length < 2
      ? [1]
      : embeddings.map((e, i) => dot(e, meanVector(embeddings.filter((_, j) => j !== i))));
  const threshold = THRESHOLD;
  return { id: sign.id, text: sign.text, kind: sign.kind, vector, threshold, consistency };
}

export interface Match {
  index: number;
  similarity: number;
  /** 0..1, comparable to a model probability: 0.6 at the threshold, 1 at a perfect match. */
  score: number;
}

/**
 * Nearest prototype of `kind` to the unit embedding at `offset`; null if none
 * clears the threshold.
 *
 * With `builtin` (the models' own class prototypes) this is a NEAREST CLASS MEAN
 * check over built-in and taught classes together: the taught sign must come
 * within BUILTIN_MARGIN of the closest built-in word or "no sign". Without it,
 * rest poses and ordinary words were wrongly accepted most of the time.
 */
export function bestMatch(
  prototypes: Prototype[],
  kind: CustomKind,
  embedding: Float32Array,
  offset = 0,
  builtin: { vectors: Float32Array; size: number } | null = null
): Match | null {
  let best: Match | null = null;
  for (let i = 0; i < prototypes.length; i++) {
    const p = prototypes[i];
    if (p.kind !== kind) continue;
    const similarity = dot(p.vector, embedding, offset);
    if (similarity < p.threshold || (best && similarity <= best.similarity)) continue;
    // Any match that clears the threshold scores at least 0.6, enough for the word spotter to track it.
    best = { index: i, similarity, score: 0.6 + (0.4 * (similarity - p.threshold)) / Math.max(1e-3, 1 - p.threshold) };
  }
  if (best && builtin) {
    let rival = -1;
    for (let row = 0; row + builtin.size <= builtin.vectors.length; row += builtin.size) {
      let s = 0;
      for (let i = 0; i < builtin.size; i++) s += builtin.vectors[row + i] * embedding[offset + i];
      if (s > rival) rival = s;
    }
    if (rival - BUILTIN_MARGIN >= best.similarity) return null;
  }
  return best;
}

/**
 * The span of a recording that is the sign: the same rule as active_segment()
 * in ml/extract_include.py. Height of the highest wrist per frame; rest = the
 * median of the lowest quarter; active = more than 30% of the way from rest to
 * the 95th percentile. Falls back to every frame with a hand.
 */
export function activeSegment(rec: Recording, pad = 2): [number, number] {
  const heights: number[] = [];
  const seen: number[] = [];
  for (let t = 0; t < rec.frames; t++) {
    let y = Infinity;
    for (let s = 0; s < NUM_SLOTS; s++) if ((rec.present[t] >> s) & 1) y = Math.min(y, rec.hands[t * RAW_SIZE + s * SHAPE_SIZE + 1]);
    if (y < Infinity) {
      heights.push(1 - y);
      seen.push(t);
    }
  }
  if (seen.length < 4) return [0, Math.max(0, rec.frames - 1)];
  const sorted = [...heights].sort((a, b) => a - b);
  const quarter = sorted.slice(0, Math.max(1, sorted.length >> 2));
  const rest = quarter[quarter.length >> 1];
  const peak = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];
  if (peak - rest < 0.05) return [seen[0], seen[seen.length - 1]];
  const active = seen.filter((_, i) => heights[i] > rest + 0.3 * (peak - rest));
  return [Math.max(0, active[0] - pad), Math.min(rec.frames - 1, active[active.length - 1] + pad)];
}

/** A movement recording -> the 32 × 136 window the words model expects, written into `out`. */
export function movementWindow(rec: Recording, out: Float32Array, offset = 0) {
  const [a, b] = activeSegment(rec);
  const idx = resampleIndices(b - a + 1, SEQUENCE_LENGTH);
  const hands = new Float32Array(SEQUENCE_LENGTH * RAW_SIZE);
  const present = new Uint8Array(SEQUENCE_LENGTH);
  for (let i = 0; i < SEQUENCE_LENGTH; i++) {
    const t = a + idx[i];
    hands.set(rec.hands.subarray(t * RAW_SIZE, (t + 1) * RAW_SIZE), i * RAW_SIZE);
    present[i] = rec.present[t];
  }
  sequenceFeatures(hands, present, SEQUENCE_LENGTH, out, offset);
}

export const WINDOW_SIZE = SEQUENCE_LENGTH * SEQ_FRAME_SIZE;
export { FRAME_SIZE };

// ---------------------------------------------------------------------------
// Storage: recordings as int16 (×10000) in base64, so dozens of signs fit in localStorage.
// ---------------------------------------------------------------------------

interface StoredRecording {
  hands: string;
  present: string;
  frames: number;
}

interface StoredSign extends Omit<CustomSign, 'recordings'> {
  recordings: StoredRecording[];
}

function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function fromBase64(text: string): Uint8Array {
  const s = atob(text);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export function serialize(signs: CustomSign[]): string {
  const stored: StoredSign[] = signs.map((s) => ({
    ...s,
    recordings: s.recordings.map((r) => {
      const q = new Int16Array(r.hands.length);
      for (let i = 0; i < q.length; i++) q[i] = Math.max(-32767, Math.min(32767, Math.round(r.hands[i] * 10000)));
      return { hands: toBase64(new Uint8Array(q.buffer)), present: toBase64(r.present), frames: r.frames };
    }),
  }));
  return JSON.stringify({ version: 1, signs: stored });
}

export function deserialize(text: string): CustomSign[] {
  const data = JSON.parse(text) as { version: number; signs: StoredSign[] };
  return data.signs.map((s) => ({
    ...s,
    recordings: s.recordings.map((r) => {
      const bytes = fromBase64(r.hands);
      const q = new Int16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2);
      const hands = new Float32Array(q.length);
      for (let i = 0; i < q.length; i++) hands[i] = q[i] / 10000;
      return { hands, present: fromBase64(r.present), frames: r.frames };
    }),
  }));
}

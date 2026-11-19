/**
 * The user's taught signs: stored in this browser only, turned into prototypes
 * with the loaded models, and handed to the engine.
 */
import { useEffect, useState, useSyncExternalStore } from 'react';
import type { SignEngine } from '../engine/engine';
import { FRAME_SIZE, RAW_SIZE, frameFeatures } from '../engine/features';
import {
  type CustomKind,
  type CustomSign,
  type Prototype,
  type Recording,
  WINDOW_SIZE,
  buildPrototype,
  deserialize,
  meanVector,
  movementWindow,
  serialize,
} from '../engine/fewshot';
import type { SignModel } from '../engine/model';
import type { ModelBundle } from '../hooks/useSignEngine';

const KEY = 'sanket.mysigns.v1';
const listeners = new Set<() => void>();
let cache: CustomSign[] | null = null;

function read(): CustomSign[] {
  if (cache) return cache;
  try {
    const text = localStorage.getItem(KEY);
    cache = text ? deserialize(text) : [];
  } catch {
    cache = [];
  }
  return cache;
}

function write(signs: CustomSign[]) {
  cache = signs;
  try {
    localStorage.setItem(KEY, serialize(signs));
  } catch {
    // Full or blocked: keep them for this session.
  }
  listeners.forEach((l) => l());
}

export function useCustomSigns(): CustomSign[] {
  return useSyncExternalStore((l) => {
    listeners.add(l);
    return () => listeners.delete(l);
  }, read);
}

let pendingTeach: { text: string; kind: CustomKind } | null = null;

/**
 * Asks the My signs page to open its teach form with this sign filled in.
 * Teaching your own version of a built-in word (same name as its label) makes
 * the engine prefer your recording in close calls: per-user adaptation.
 */
export function requestTeach(text: string, kind: CustomKind) {
  pendingTeach = { text, kind };
}

/** Returns the pending teach request once, then forgets it. */
export function takeTeachRequest(): { text: string; kind: CustomKind } | null {
  const request = pendingTeach;
  pendingTeach = null;
  return request;
}

export function saveCustomSign(sign: CustomSign) {
  const rest = read().filter((s) => s.id !== sign.id);
  write([...rest, sign]);
}

export function deleteCustomSign(id: string) {
  write(read().filter((s) => s.id !== id));
}

// ---------------------------------------------------------------------------
// Embedding
// ---------------------------------------------------------------------------

/** The still part of a hand-shape recording: up to 12 frames with hands from its middle 60%. */
function shapeFrames(rec: Recording): number[] {
  const withHands = [];
  for (let t = 0; t < rec.frames; t++) if (rec.present[t]) withHands.push(t);
  const a = Math.floor(withHands.length * 0.2);
  const b = Math.ceil(withHands.length * 0.8);
  const middle = withHands.slice(a, Math.max(a + 1, b));
  const step = Math.max(1, Math.floor(middle.length / 12));
  return middle.filter((_, i) => i % step === 0).slice(0, 12);
}

const embedCache = new WeakMap<Recording, Float32Array>();

/** One unit-length embedding per recording. */
export async function embedRecordings(kind: CustomKind, recordings: Recording[], bundle: ModelBundle): Promise<Float32Array[]> {
  const model: SignModel | null = kind === 'movement' ? bundle.dynamicModel : bundle.staticModel;
  if (!model) throw new Error(kind === 'movement' ? 'The words model is not loaded.' : 'The letters model is not loaded.');
  const todo = recordings.filter((r) => !embedCache.has(r));

  if (kind === 'movement' && todo.length) {
    const input = new Float32Array(todo.length * WINDOW_SIZE);
    todo.forEach((rec, i) => movementWindow(rec, input, i * WINDOW_SIZE));
    const { embeddings, size } = await model.predictWithEmbedding(input, todo.length);
    todo.forEach((rec, i) => embedCache.set(rec, embeddings.slice(i * size, (i + 1) * size)));
  }
  if (kind === 'shape') {
    for (const rec of todo) {
      const frames = shapeFrames(rec);
      if (!frames.length) continue;
      const input = new Float32Array(frames.length * FRAME_SIZE);
      frames.forEach((t, i) => frameFeatures(rec.hands, t * RAW_SIZE, rec.present[t], input, i * FRAME_SIZE));
      const { embeddings, size } = await model.predictWithEmbedding(input, frames.length);
      const rows = frames.map((_, i) => embeddings.slice(i * size, (i + 1) * size));
      embedCache.set(rec, meanVector(rows));
    }
  }
  return recordings.map((r) => embedCache.get(r)).filter((e): e is Float32Array => Boolean(e));
}

/** Keeps the engine's prototypes in step with the stored signs. */
export function usePrototypes(engine: SignEngine | null, bundle: ModelBundle | null, signs: CustomSign[]) {
  const [prototypes, setPrototypes] = useState<Prototype[]>([]);
  useEffect(() => {
    if (!bundle) return;
    let alive = true;
    (async () => {
      const out: Prototype[] = [];
      for (const sign of signs) {
        try {
          const embeddings = await embedRecordings(sign.kind, sign.recordings, bundle);
          if (embeddings.length) out.push(buildPrototype(sign, embeddings));
        } catch {
          // The model this sign needs is missing; skip it.
        }
      }
      if (!alive) return;
      setPrototypes(out);
      engine?.setPrototypes(out);
    })();
    return () => {
      alive = false;
    };
  }, [engine, bundle, signs]);
  return prototypes;
}

/** Checks one recording before it is kept. Returns a problem to show, or null. */
export function checkRecording(kind: CustomKind, rec: Recording): string | null {
  let withHands = 0;
  for (let t = 0; t < rec.frames; t++) if (rec.present[t]) withHands++;
  if (rec.frames < 10 || withHands < 6) return 'No hands were seen. Keep both hands inside the camera and try again.';
  if (withHands / rec.frames < 0.4) return 'Your hands were out of view for most of it. Step back a little and try again.';
  if (kind === 'shape' && shapeFrames(rec).length < 3) return 'Hold the shape still for the whole recording.';
  return null;
}

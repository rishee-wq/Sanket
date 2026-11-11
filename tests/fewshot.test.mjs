// Tests for "Teach your own sign" (src/engine/fewshot.ts and its use in the engine).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import * as tf from '@tensorflow/tfjs';
import { loadFromDisk } from '../ml/check_tfjs.mjs';
import { SignEngine } from '../src/engine/engine.ts';
import {
  THRESHOLD,
  WINDOW_SIZE,
  activeSegment,
  bestMatch,
  buildPrototype,
  deserialize,
  movementWindow,
  normalize,
  serialize,
} from '../src/engine/fewshot.ts';
import { SignModel } from '../src/engine/model.ts';

const unit = (...v) => normalize(Float32Array.from(v));

test('prototype is the normalised mean, with a consistency score per example', () => {
  const tight = buildPrototype({ id: 'a', text: 'A', kind: 'movement' }, [unit(1, 0.05, 0), unit(1, -0.05, 0), unit(1, 0, 0.05)]);
  assert.ok(Math.abs(tight.vector[0] - 1) < 0.01);
  assert.equal(tight.threshold, THRESHOLD);
  const loose = buildPrototype({ id: 'b', text: 'B', kind: 'movement' }, [unit(1, 1, 0), unit(1, -1, 0), unit(1, 0, 1)]);
  assert.ok(Math.min(...loose.consistency) < Math.min(...tight.consistency), 'looser examples are less consistent');
});

test('a taught sign is rejected when a built-in class is clearly closer', () => {
  const taught = buildPrototype({ id: 'a', text: 'A', kind: 'movement' }, [unit(1, 0.1, 0), unit(1, -0.1, 0)]);
  const query = unit(1, 0.3, 0);
  assert.ok(bestMatch([taught], 'movement', query), 'matches with no built-in classes');
  const builtin = { vectors: unit(1, 0.35, 0), size: 3 }; // a built-in word a little closer: still within the margin
  assert.ok(bestMatch([taught], 'movement', query, 0, builtin));
  // A built-in word that is exactly the movement: clearly closer than the taught sign, so rejected.
  assert.equal(bestMatch([taught], 'movement', unit(1, 0.5, 0), 0, { vectors: unit(1, 0.5, 0), size: 3 }), null);
  const far = { vectors: unit(0, 0, 1), size: 3 };
  assert.ok(bestMatch([taught], 'movement', query, 0, far));
});

test('best match respects kind, threshold and the nearest prototype', () => {
  const a = buildPrototype({ id: 'a', text: 'A', kind: 'movement' }, [unit(1, 0, 0), unit(1, 0.02, 0)]);
  const b = buildPrototype({ id: 'b', text: 'B', kind: 'movement' }, [unit(0, 1, 0), unit(0.02, 1, 0)]);
  const c = buildPrototype({ id: 'c', text: 'C', kind: 'shape' }, [unit(1, 0, 0), unit(1, 0.02, 0)]);
  const protos = [a, b, c];
  assert.equal(bestMatch(protos, 'movement', unit(1, 0.01, 0)).index, 0);
  assert.equal(bestMatch(protos, 'movement', unit(0.01, 1, 0)).index, 1);
  assert.equal(bestMatch(protos, 'shape', unit(1, 0.01, 0)).index, 2);
  assert.equal(bestMatch(protos, 'movement', unit(0, 0, 1)), null, 'far from everything: rejected');
  const m = bestMatch(protos, 'movement', unit(1, 0, 0));
  assert.ok(m.score >= 0.6 && m.score <= 1);
});

function fakeRecording(frames, raiseFrom, raiseTo) {
  const hands = new Float32Array(frames * 126);
  const present = new Uint8Array(frames).fill(1);
  for (let t = 0; t < frames; t++) {
    const y = t >= raiseFrom && t <= raiseTo ? 0.35 : 0.85; // wrist high while signing, low at rest
    for (let i = 0; i < 21; i++) {
      hands[t * 126 + i * 3] = 0.5 + i * 0.004;
      hands[t * 126 + i * 3 + 1] = y - i * 0.006;
    }
  }
  return { hands, present, frames };
}

test('active segment finds where the hand is raised', () => {
  const [a, b] = activeSegment(fakeRecording(60, 20, 40));
  assert.ok(a >= 16 && a <= 20, `start ${a}`);
  assert.ok(b >= 40 && b <= 44, `end ${b}`);
});

test('recordings survive storage', () => {
  const rec = fakeRecording(30, 10, 20);
  const signs = [{ id: 'x', text: 'Rishee', kind: 'movement', recordings: [rec], created: 1 }];
  const [back] = deserialize(serialize(signs));
  assert.equal(back.text, 'Rishee');
  assert.equal(back.recordings[0].frames, 30);
  let worst = 0;
  for (let i = 0; i < rec.hands.length; i++) worst = Math.max(worst, Math.abs(rec.hands[i] - back.recordings[0].hands[i]));
  assert.ok(worst <= 5e-5, `quantisation error ${worst}`);
  assert.deepEqual(Array.from(back.recordings[0].present), Array.from(rec.present));
});

// ---------------------------------------------------------------------------
// End to end with the real words model
// ---------------------------------------------------------------------------

const dir = new URL('../public/model/', import.meta.url);
const read = (name) => JSON.parse(readFileSync(new URL(name, dir), 'utf8'));
const index = read('exemplars.json');
const bin = readFileSync(new URL('exemplars.bin', dir));
const data = new Int16Array(bin.buffer, bin.byteOffset, bin.byteLength / 2);
const item = (label) => index.items.find((i) => i.label === label);

/** An exemplar as a Recording, optionally with noise and a different start/end (a "new performance"). */
function recordingOf(label, seed = 0) {
  const it = item(label);
  let s = seed * 9301 + 49297;
  const rand = () => ((s = (s * 9301 + 49297) % 233280) / 233280) - 0.5;
  const cut = seed ? Math.floor(Math.abs(rand()) * 6) : 0;
  const frames = it.frames - cut * 2;
  const hands = new Float32Array(frames * 126);
  const present = new Uint8Array(frames);
  for (let t = 0; t < frames; t++) {
    const src = (it.offset + t + cut) * 126;
    for (let k = 0; k < 126; k++) {
      const v = data[src + k] / 1e4;
      hands[t * 126 + k] = v && seed ? v + rand() * 0.006 : v;
    }
    for (let slot = 0; slot < 2; slot++) {
      let any = false;
      for (let k = 0; k < 63; k++) any ||= data[src + slot * 63 + k] !== 0;
      if (any) present[t] |= 1 << slot;
    }
  }
  return { hands, present, frames };
}

function frameHands(rec, t, aspect) {
  const out = [];
  for (let slot = 0; slot < 2; slot++) {
    if (!((rec.present[t] >> slot) & 1)) continue;
    const landmarks = [];
    for (let i = 0; i < 21; i++) {
      const k = t * 126 + slot * 63 + i * 3;
      landmarks.push({ x: rec.hands[k] / aspect, y: rec.hands[k + 1], z: rec.hands[k + 2] / aspect });
    }
    out.push({ landmarks, handedness: slot === 0 ? 'Right' : 'Left', score: 1 });
  }
  return out;
}

const tick = () => new Promise((r) => setTimeout(r, 0));

async function stream(engine, rec, aspect) {
  let time = 1000;
  for (let t = 0; t < rec.frames; t++) {
    engine.pushFrame(frameHands(rec, t, aspect), aspect, time);
    time += 40;
    for (let i = 0; i < 6; i++) await tick();
  }
  for (let g = 0; g < 14; g++) {
    engine.pushFrame([], aspect, time);
    time += 40;
    for (let i = 0; i < 6; i++) await tick();
  }
  await new Promise((r) => setTimeout(r, 30));
}

test('a taught sign is recognised by the live engine, and other signs are not', async () => {
  await tf.setBackend('cpu');
  const path = new URL('dynamic/', dir).pathname.replace(/^\/(\w:)/, '$1').replaceAll('%20', ' ');
  const words = new SignModel(tf, await loadFromDisk(path), read('dynamic/labels.json'), read('dynamic/config.json'));
  words.builtin = Float32Array.from(read('dynamic/prototypes.json').vectors.flat());

  // Teach "Thanks a lot" from three noisy, re-cut performances of the THANK YOU recording.
  const examples = [1, 2, 3].map((seed) => recordingOf('thank you', seed));
  const input = new Float32Array(examples.length * WINDOW_SIZE);
  examples.forEach((rec, i) => movementWindow(rec, input, i * WINDOW_SIZE));
  const { embeddings, size } = await words.predictWithEmbedding(input, examples.length);
  const proto = buildPrototype(
    { id: 'thanks', text: 'Thanks a lot', kind: 'movement' },
    examples.map((_, i) => embeddings.slice(i * size, (i + 1) * size))
  );

  const tokens = [];
  const engine = new SignEngine({ staticModel: null, dynamicModel: words, mode: 'words', onToken: (t) => tokens.push(t) });
  engine.setPrototypes([proto]);
  const aspect = item('thank you').aspect;

  await stream(engine, recordingOf('thank you'), aspect);
  assert.deepEqual(tokens.map((t) => t.label), ['Thanks a lot'], 'the taught sign is recognised');
  assert.equal(tokens[0].custom, true);

  for (const other of ['hello', 'doctor', 'house', 'sick']) {
    tokens.length = 0;
    await stream(engine, recordingOf(other), aspect);
    assert.ok(!tokens.some((t) => t.label === 'Thanks a lot'), `${other} must not match the taught sign (got ${tokens.map((t) => t.label)})`);
  }
});

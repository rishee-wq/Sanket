// Tests for the live-input clean-up: the One-Euro landmark smoother and the framing coach.
//   npm test
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HandSmoother } from '../src/engine/smoothing.ts';
import { framingHint } from '../src/lib/framing.ts';

/** A 21-point hand centred at (cx, cy), `size` across. */
function hand(cx, cy, size = 0.2, label = 'Right') {
  const landmarks = Array.from({ length: 21 }, (_, i) => ({
    x: cx + (((i * 7) % 11) / 10 - 0.5) * size,
    y: cy + (i / 20 - 0.5) * size,
    z: 0,
  }));
  return { landmarks, handedness: label, score: 0.9 };
}

/** Deterministic Gaussian-ish noise (sum of uniforms). */
function noise(seed) {
  let s = seed;
  return () => {
    let t = 0;
    for (let i = 0; i < 4; i++) {
      s = (s * 1103515245 + 12345) % 2147483648;
      t += s / 2147483648 - 0.5;
    }
    return t;
  };
}

const FRAME = 1000 / 30;

test('a still hand: jitter is strongly reduced', () => {
  const smoother = new HandSmoother();
  const rnd = noise(1);
  let rawVar = 0;
  let outVar = 0;
  for (let f = 0; f < 120; f++) {
    const h = hand(0.5, 0.5);
    for (const p of h.landmarks) p.x += rnd() * 0.01;
    const [out] = smoother.update([h], f * FRAME);
    if (f > 30) {
      rawVar += (h.landmarks[0].x - hand(0.5, 0.5).landmarks[0].x) ** 2;
      outVar += (out.landmarks[0].x - hand(0.5, 0.5).landmarks[0].x) ** 2;
    }
  }
  assert.ok(outVar < rawVar * 0.35, `smoothed variance ${outVar} should be well below raw ${rawVar}`);
});

test('a fast hand: little lag', () => {
  const smoother = new HandSmoother();
  let lag = 0;
  for (let f = 0; f < 40; f++) {
    const x = 0.2 + f * 0.015; // about 0.45 frame widths per second
    const [out] = smoother.update([hand(x, 0.5)], f * FRAME);
    lag = hand(x, 0.5).landmarks[0].x - out.landmarks[0].x;
  }
  assert.ok(Math.abs(lag) < 0.02, `lag ${lag} should be under 2% of the frame width`);
});

test('a short dropout is bridged, a real exit is not', () => {
  const smoother = new HandSmoother();
  for (let f = 0; f < 10; f++) smoother.update([hand(0.5, 0.5)], f * FRAME);
  // Lost for two frames: still reported.
  assert.equal(smoother.update([], 10 * FRAME).length, 1);
  assert.equal(smoother.update([], 11 * FRAME).length, 1);
  // Back again: tracking continues.
  assert.equal(smoother.update([hand(0.5, 0.5)], 12 * FRAME).length, 1);
  // Gone for good: dropped once the hold time has passed.
  for (let f = 13; f < 25; f++) smoother.update([], f * FRAME);
  assert.equal(smoother.update([], 25 * FRAME).length, 0);
});

test('two hands keep their identity when the detector swaps their order', () => {
  const smoother = new HandSmoother();
  for (let f = 0; f < 10; f++) smoother.update([hand(0.3, 0.5, 0.2, 'Right'), hand(0.7, 0.5, 0.2, 'Left')], f * FRAME);
  const out = smoother.update([hand(0.7, 0.5, 0.2, 'Left'), hand(0.3, 0.5, 0.2, 'Right')], 10 * FRAME);
  const xs = out.map((h) => h.landmarks[0].x).sort();
  assert.ok(xs[0] < 0.4 && xs[1] > 0.6, `hands stayed apart: ${xs}`);
});

test('framing coach: edge, too close, too far, fine', () => {
  assert.equal(framingHint([hand(0.02, 0.5)], 16 / 9), 'edge');
  assert.equal(framingHint([hand(0.5, 0.5, 0.7)], 16 / 9), 'close');
  assert.equal(framingHint([hand(0.5, 0.5, 0.03)], 16 / 9), 'far');
  assert.equal(framingHint([hand(0.5, 0.5, 0.2)], 16 / 9), null);
  assert.equal(framingHint([], 16 / 9), null);
});

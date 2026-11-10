// Runs src/engine/features.ts on the fixture written by check_parity.py and compares.
// Node runs the TypeScript file directly (type stripping), so this is the exact browser code.
import { readFileSync } from 'node:fs';
import {
  FRAME_SIZE,
  RAW_SIZE,
  SEQ_FRAME_SIZE,
  frameFeatures,
  resampleIndices,
  sequenceFeatures,
  toSlots,
} from '../src/engine/features.ts';

const fixture = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const maxDiff = (a, b) => a.reduce((m, v, i) => Math.max(m, Math.abs(v - b[i])), 0);
let worst = 0;
let failures = 0;
const check = (name, diff, limit = 1e-5) => {
  worst = Math.max(worst, diff);
  if (!(diff <= limit)) {
    failures++;
    console.log(`  MISMATCH ${name}: ${diff}`);
  }
};

fixture.frames.forEach((f, i) => {
  const detected = f.detected.map((h) => ({
    landmarks: h.landmarks.map(([x, y, z]) => ({ x, y, z })),
    handedness: h.handedness,
    score: h.score,
  }));
  const hands = new Float32Array(RAW_SIZE);
  const bits = toSlots(detected, f.aspect, hands);
  check(`frame ${i} slots`, maxDiff(Array.from(hands), f.hands));
  check(`frame ${i} present`, maxDiff([bits & 1, (bits >> 1) & 1], f.present));
  const out = new Float32Array(FRAME_SIZE);
  frameFeatures(hands, 0, bits, out);
  check(`frame ${i} features`, maxDiff(Array.from(out), f.features));
});

fixture.sequences.forEach((s, i) => {
  const n = s.present.length;
  const idx = resampleIndices(n, fixture.sequenceLength);
  check(`sequence ${i} indices`, maxDiff(Array.from(idx), s.indices), 0);
  const T = fixture.sequenceLength;
  const hands = new Float32Array(T * RAW_SIZE);
  const present = new Uint8Array(T);
  for (let t = 0; t < T; t++) {
    hands.set(s.hands.slice(idx[t] * RAW_SIZE, (idx[t] + 1) * RAW_SIZE), t * RAW_SIZE);
    present[t] = s.present[idx[t]][0] | (s.present[idx[t]][1] << 1);
  }
  const out = new Float32Array(T * SEQ_FRAME_SIZE);
  sequenceFeatures(hands, present, T, out);
  check(`sequence ${i} features`, maxDiff(Array.from(out), s.features), 2e-4);
});

console.log(
  `${fixture.frames.length} frames and ${fixture.sequences.length} sequences compared; largest difference ${worst.toExponential(2)}`
);
console.log(failures ? `FAILED: ${failures} mismatches` : 'PARITY OK: Python and TypeScript features match');
process.exit(failures ? 1 : 0);

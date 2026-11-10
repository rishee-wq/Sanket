// Unit tests for the data structures and algorithms in src/engine.
//   npm test
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MinHeap, TopK, topKIndices } from '../src/engine/heap.ts';
import { LanguageModel } from '../src/engine/language.ts';
import { LruCache } from '../src/engine/lru.ts';
import { FrameRing } from '../src/engine/ringBuffer.ts';
import { LetterGate, WordSpotter, nonMaxSuppression, temporalIoU } from '../src/engine/spotter.ts';
import { Trie, editDistance } from '../src/engine/trie.ts';

test('min-heap pops in ascending order', () => {
  const heap = new MinHeap();
  [5, 3, 8, 1, 9, 2].forEach((v) => heap.push(v, v));
  const out = [];
  for (let s = heap.pop(); s; s = heap.pop()) out.push(s.score);
  assert.deepEqual(out, [1, 2, 3, 5, 8, 9]);
});

test('top-k keeps the k largest, highest first', () => {
  const top = new TopK(3);
  [0.1, 0.7, 0.05, 0.9, 0.3, 0.8].forEach((v, i) => top.offer(i, v));
  assert.deepEqual(top.result().map((s) => s.item), [3, 5, 1]);
  assert.deepEqual(topKIndices([0.2, 0.9, 0.5, 0.7], 2, 1).map((s) => s.item), [3, 2]);
});

test('ring buffer overwrites the oldest frame and binary-searches by time', () => {
  const ring = new FrameRing(8);
  for (let i = 0; i < 20; i++) ring.push(i * 33);
  assert.equal(ring.size, 8);
  assert.equal(ring.oldest, 12);
  assert.equal(ring.newest, 19);
  assert.equal(ring.has(11), false);
  assert.equal(ring.lowerBound(15 * 33), 15);
  assert.equal(ring.lowerBound(15 * 33 + 1), 16);
  assert.equal(ring.lowerBound(-5), 12);
  assert.equal(ring.lowerBound(1e9), 20);
});

test('LRU cache evicts the least recently used entry', () => {
  const cache = new LruCache(2);
  cache.set('a', 1);
  cache.set('b', 2);
  assert.equal(cache.get('a'), 1); // a is now the most recent
  cache.set('c', 3); // evicts b
  assert.equal(cache.get('b'), undefined);
  assert.equal(cache.get('a'), 1);
  assert.equal(cache.get('c'), 3);
  assert.equal(cache.size, 2);
});

test('trie completes prefixes by weight', () => {
  const trie = new Trie();
  trie.insert('hospital', 50);
  trie.insert('house', 80);
  trie.insert('hot', 20);
  trie.insert('help', 99);
  assert.deepEqual(trie.complete('ho', 2).map((s) => s.word), ['HOUSE', 'HOSPITAL']);
  assert.deepEqual(trie.complete('h', 1).map((s) => s.word), ['HELP']);
  assert.deepEqual(trie.complete('x'), []);
  assert.equal(trie.has('hot'), true);
  assert.equal(trie.has('ho'), false);
});

test('edit distance and fuzzy trie search agree', () => {
  assert.equal(editDistance('HOSPITL', 'HOSPITAL'), 1);
  assert.equal(editDistance('KITTEN', 'SITTING'), 3);
  assert.equal(editDistance('', 'ABC'), 3);
  const trie = new Trie();
  ['hospital', 'doctor', 'police', 'medicine', 'water'].forEach((w) => trie.insert(w));
  assert.equal(trie.fuzzy('HOSPITL', 1)[0].word, 'HOSPITAL');
  assert.equal(trie.fuzzy('DOCTER', 1)[0].word, 'DOCTOR');
  assert.equal(trie.fuzzy('MEDCINE', 1)[0].word, 'MEDICINE');
  assert.deepEqual(trie.fuzzy('ZZZZ', 1), []);
  for (const word of ['HOSPITAL', 'DOCTOR', 'POLICE']) {
    for (const hit of trie.fuzzy('POLISE', 2)) assert.equal(hit.edits, editDistance('POLISE', hit.word));
    assert.equal(trie.fuzzy(word, 0)[0].word, word);
  }
});

test('language model completes, corrects and predicts the next word', () => {
  const lm = new LanguageModel(['cell phone']);
  assert.ok(lm.completions('HOS').some((s) => s.word === 'HOSPITAL'));
  assert.ok(lm.completions('DOCTER').some((s) => s.word === 'DOCTOR'));
  assert.ok(lm.nextWords('i').includes('need'));
  assert.ok(lm.nextWords('<s>').includes('i'));
  lm.completions('HOS');
  assert.ok(lm.cacheStats.hits >= 1);
  lm.learn('zebra crossing ahead', 5, false);
  assert.deepEqual(lm.nextWords('zebra'), ['crossing']);
});

test('temporal IoU and non-maximum suppression', () => {
  const a = { start: 0, end: 9, startTime: 0, endTime: 0 };
  const b = { start: 5, end: 14, startTime: 0, endTime: 0 };
  assert.equal(temporalIoU(a, a), 1);
  assert.equal(temporalIoU(a, b), 5 / 15);
  assert.equal(temporalIoU(a, { ...a, start: 20, end: 30 }), 0);
  const kept = nonMaxSuppression([
    { ...a, label: 1, score: 0.7 },
    { ...b, label: 1, score: 0.9 },
    { start: 40, end: 60, startTime: 0, endTime: 0, label: 2, score: 0.6 },
  ]);
  assert.deepEqual(kept.map((d) => d.score), [0.9, 0.6]);
});

test('letter gate accepts a held letter once and waits for a change', () => {
  const gate = new LetterGate({ holdMs: 300, smoothing: 1 });
  const probs = (i) => Float32Array.from({ length: 4 }, (_, k) => (k === i ? 0.94 : 0.02));
  const accepted = [];
  for (let t = 0; t <= 1000; t += 33) {
    const state = gate.update(probs(t < 600 ? 1 : 2), 0.2, t);
    if (state.accepted) accepted.push([state.candidate, t]);
  }
  assert.equal(accepted.length, 2);
  assert.equal(accepted[0][0], 1);
  assert.equal(accepted[1][0], 2);
  // A moving hand is never accepted.
  const moving = new LetterGate({ holdMs: 300 });
  for (let t = 0; t <= 1000; t += 33) assert.equal(moving.update(probs(1), 9, t).accepted, false);
});

test('word spotter commits the peak window and never reaches back', () => {
  const spotter = new WordSpotter({ patience: 2, threshold: 0.5 });
  const det = (start, end, label, score) => ({ start, end, startTime: start * 33, endTime: end * 33, label, score });
  assert.equal(spotter.update([det(0, 20, 7, 0.6)]), null);
  assert.equal(spotter.update([det(0, 24, 7, 0.85), det(4, 24, 7, 0.7)]), null);
  assert.equal(spotter.update([det(0, 27, 7, 0.75)]), null); // past the peak: first miss
  const done = spotter.update([]); // second miss: commit the peak
  assert.equal(done.label, 7);
  assert.equal(done.score, 0.85);
  assert.equal(spotter.floor, 25);
  // Until the hands pause, nothing is tracked: the tail of a sign is not a new sign.
  assert.equal(spotter.cooling, true);
  assert.equal(spotter.update([det(26, 50, 3, 0.9)]), null);
  assert.equal(spotter.tracking, null);
  spotter.restart(26); // the engine saw a pause
  // A window that reaches back into the committed sign is ignored; one after it is tracked.
  assert.equal(spotter.update([det(10, 40, 7, 0.9)]), null);
  assert.equal(spotter.tracking, null);
  spotter.update([det(26, 50, 3, 0.8)]);
  assert.equal(spotter.tracking.label, 3);
  assert.equal(spotter.flush().label, 3);
});

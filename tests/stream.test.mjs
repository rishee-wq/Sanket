// End-to-end test of the live engine, without a camera or a browser.
//
// Every exemplar (one held-out TEST recording per sign) is streamed frame by
// frame through the real SignEngine with the real exported models, exactly as
// the demo stream does in the app. Reports how many signs the engine commits
// correctly, and how long after the sign ended.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import * as tf from '@tensorflow/tfjs';
import { loadFromDisk } from '../ml/check_tfjs.mjs';
import { SignEngine } from '../src/engine/engine.ts';
import { SignModel } from '../src/engine/model.ts';

const dir = new URL('../public/model/', import.meta.url);
const read = (name) => JSON.parse(readFileSync(new URL(name, dir), 'utf8'));
const index = read('exemplars.json');
const bin = readFileSync(new URL('exemplars.bin', dir));
const data = new Int16Array(bin.buffer, bin.byteOffset, bin.byteLength / 2);

function frame(item, f) {
  const hands = [];
  for (let slot = 0; slot < 2; slot++) {
    const start = (item.offset + f) * 126 + slot * 63;
    const landmarks = [];
    let any = false;
    for (let i = 0; i < 21; i++) {
      const [x, y, z] = [data[start + i * 3], data[start + i * 3 + 1], data[start + i * 3 + 2]];
      any ||= x !== 0 || y !== 0 || z !== 0;
      landmarks.push({ x: x / 1e4 / item.aspect, y: y / 1e4, z: z / 1e4 / item.aspect });
    }
    if (any) hands.push({ landmarks, handedness: slot === 0 ? 'Right' : 'Left', score: 1 });
  }
  return hands;
}

async function load(name) {
  return new SignModel(tf, await loadFromDisk(new URL(`${name}/`, dir).pathname.replace(/^\/(\w:)/, '$1').replaceAll('%20', ' ')), read(`${name}/labels.json`), read(`${name}/config.json`));
}

const tick = () => new Promise((r) => setTimeout(r, 0));

/** Streams the items one after another with an empty gap between them; resolves with the tokens per item. */
async function stream(engine, tokens, items) {
  const results = [];
  let time = 1000;
  for (const item of items) {
    const before = tokens.length;
    const frameMs = 1000 / item.fps;
    for (let f = 0; f < item.frames; f++) {
      engine.pushFrame(frame(item, f), item.aspect, time);
      time += frameMs;
      for (let i = 0; i < 6; i++) await tick(); // let model promises resolve, as rAF gaps do in the browser
    }
    for (let g = 0; g < 14; g++) {
      engine.pushFrame([], item.aspect, time);
      time += frameMs;
      for (let i = 0; i < 6; i++) await tick();
    }
    await new Promise((r) => setTimeout(r, 30));
    results.push({ item, got: tokens.slice(before) });
  }
  return results;
}

function report(name, results) {
  const right = results.filter((r) => r.got.length === 1 && r.got[0].label === r.item.label);
  const missed = results.filter((r) => r.got.length === 0);
  const extra = results.filter((r) => r.got.length > 1);
  const wrong = results.filter((r) => r.got.length === 1 && r.got[0].label !== r.item.label);
  console.log(`${name}: ${right.length}/${results.length} committed exactly once and correctly; ${wrong.length} wrong, ${missed.length} missed, ${extra.length} with extra tokens`);
  for (const r of [...wrong, ...extra]) console.log(`   ${r.item.label} -> ${r.got.map((t) => `${t.label} ${(t.confidence * 100).toFixed(0)}%`).join(', ')}`);
  if (missed.length) console.log(`   missed: ${missed.map((r) => r.item.label).join(', ')}`);
  return right.length / results.length;
}

await tf.setBackend('cpu');
const [staticModel, dynamicModel] = await Promise.all([load('static'), load('dynamic')]);

test('words: every test recording streamed through the engine', async () => {
  const tokens = [];
  const engine = new SignEngine({ staticModel, dynamicModel, mode: 'words', onToken: (t) => tokens.push(t) });
  const rate = report('words mode', await stream(engine, tokens, index.items.filter((i) => i.kind === 'word')));
  assert.ok(rate >= 0.7, `only ${(rate * 100).toFixed(0)}% of words recognised`);
});

test('letters: every held test pose streamed through the engine', async () => {
  const tokens = [];
  const engine = new SignEngine({ staticModel, dynamicModel, mode: 'letters', onToken: (t) => tokens.push(t) });
  const rate = report('letters mode', await stream(engine, tokens, index.items.filter((i) => i.kind === 'letter')));
  assert.ok(rate >= 0.9, `only ${(rate * 100).toFixed(0)}% of letters recognised`);
});

test('auto: words and letters mixed in one stream', async () => {
  const tokens = [];
  const engine = new SignEngine({ staticModel, dynamicModel, mode: 'auto', onToken: (t) => tokens.push(t) });
  const pick = ['hello', 'doctor', 'H', 'E', 'thank you', 'L', 'P', 'hospital', '5'];
  const items = pick.map((l) => index.items.find((i) => i.label === l));
  const rate = report('auto mode', await stream(engine, tokens, items));
  assert.ok(rate >= 0.6, `only ${(rate * 100).toFixed(0)}% recognised in auto mode`);
});

// Proves that TensorFlow.js computes the same outputs as Keras for an exported model.
//
//   node ml/check_tfjs.mjs static
//   node ml/check_tfjs.mjs dynamic
//
// Loads public/model/<name>/ exactly as the browser does (same library, CPU backend)
// and compares against ml/runs/<name>_parity.json, written by the training script.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as tf from '@tensorflow/tfjs';

const here = dirname(fileURLToPath(import.meta.url));
const name = process.argv[2] ?? 'static';
const dir = join(here, '..', 'public', 'model', name);

export async function loadFromDisk(modelDir) {
  const json = JSON.parse(readFileSync(join(modelDir, 'model.json'), 'utf8'));
  const manifest = json.weightsManifest[0];
  const bin = readFileSync(join(modelDir, manifest.paths[0]));
  return tf.loadLayersModel(
    tf.io.fromMemory({
      modelTopology: json.modelTopology,
      weightSpecs: manifest.weights,
      weightData: bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength),
    })
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await tf.setBackend('cpu');
  const model = await loadFromDisk(dir);
  const parity = JSON.parse(readFileSync(join(here, 'runs', `${name}_parity.json`), 'utf8'));
  const x = tf.tensor(parity.inputs.flat(Infinity), [parity.inputs.length, ...parity.shape]);
  const t0 = performance.now();
  const y = model.predict(x);
  const out = await y.data();
  const ms = performance.now() - t0;
  const expected = parity.outputs.flat();
  let worst = 0;
  for (let i = 0; i < expected.length; i++) worst = Math.max(worst, Math.abs(out[i] - expected[i]));
  const classes = parity.outputs[0].length;
  let agree = 0;
  for (let r = 0; r < parity.outputs.length; r++) {
    const row = out.slice(r * classes, (r + 1) * classes);
    if (row.indexOf(Math.max(...row)) === parity.outputs[r].indexOf(Math.max(...parity.outputs[r]))) agree++;
  }
  console.log(`${name}: ${model.layers.length} layers, ${model.countParams().toLocaleString()} parameters loaded by TF.js`);
  console.log(`${parity.inputs.length} samples: largest probability difference ${worst.toExponential(2)}, same top class ${agree}/${parity.outputs.length} (${ms.toFixed(0)} ms on the CPU backend)`);
  const ok = worst < 1e-3 && agree === parity.outputs.length;
  console.log(ok ? 'TFJS OK: browser model matches Keras' : 'FAILED: outputs differ');
  process.exit(ok ? 0 : 1);
}

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Timer } from 'lucide-react';
import { vocab } from '../../data/vocabulary';
import type { SignEngine } from '../../engine/engine';
import type { LanguageModel } from '../../engine/language';
import type { SignModel } from '../../engine/model';
import type { ModelBundle } from '../../hooks/useSignEngine';

/** The parts of public/model/<name>/report.json this page reads. */
interface Report {
  model: string;
  params: number;
  epochs_run: number;
  train_seconds: number;
  temperature: number;
  split: { train: number; val: number; test: number };
  test: Record<string, number | null>;
  labels: string[];
  history: Record<'loss' | 'val_loss' | 'accuracy' | 'val_accuracy', number[]>;
  metrics: { confusion: number[][]; per_class: { label: string; precision: number; recall: number; f1: number; support: number }[] };
  layers: { name: string; type: string; shape: number[]; params: number }[];
  embedding: [number, number, number][];
  comparison: Record<string, { model: string; params: number; train_seconds: number; keras_cpu_ms?: number; test: Record<string, number | null> }>;
  dataset: string;
}

const pct = (v: number | null | undefined, digits = 1) => (v == null ? '–' : `${(v * 100).toFixed(digits)}%`);
const BASE = `${import.meta.env.BASE_URL}model/`;

function useReport(name: string) {
  const [report, setReport] = useState<Report | null>(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    fetch(`${BASE}${name}/report.json`)
      .then((r) => (r.ok && r.headers.get('content-type')?.includes('json') ? r.json() : Promise.reject()))
      .then(setReport, () => setMissing(true));
  }, [name]);
  return { report, missing };
}

const Tile: React.FC<{ label: string; value: string; note?: string; loud?: boolean }> = ({ label, value, note, loud }) => (
  <div className={`rounded-md border-2 border-ink p-3 ${loud ? 'bg-signal' : 'bg-card'}`}>
    <p className="tag text-ink/60">{label}</p>
    <p className="display mt-1 text-[40px]">{value}</p>
    {note && <p className="mt-1 text-[12.5px] leading-snug text-ink/70">{note}</p>}
  </div>
);

const Section: React.FC<{ n: string; title: string; kicker?: string; children: React.ReactNode }> = ({ n, title, kicker, children }) => (
  <section className="border-t-2 border-ink pt-4">
    <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <span className="num text-[13px] font-semibold text-mute">{n}</span>
      <h2 className="display text-[34px]">{title}</h2>
      {kicker && <p className="text-[15px] text-mute">{kicker}</p>}
    </div>
    {children}
  </section>
);

// ---------------------------------------------------------------------------
// Charts
// ---------------------------------------------------------------------------

/** Training curves: two series on a shared axis, drawn as plain polylines. */
const Curves: React.FC<{ title: string; train: number[]; val: number[]; max?: number }> = ({ title, train, val, max }) => {
  const W = 420;
  const H = 170;
  const top = max ?? Math.max(...train, ...val) * 1.05;
  const low = max ? Math.min(...train, ...val, 0.5) * 0.98 : 0;
  const line = (ys: number[]) =>
    ys.map((y, i) => `${(i / Math.max(1, ys.length - 1)) * W},${H - ((y - low) / (top - low)) * H}`).join(' ');
  return (
    <figure className="plate p-3">
      <figcaption className="mb-2 flex items-center justify-between">
        <span className="tag">{title}</span>
        <span className="flex gap-3 text-[12px]">
          <span className="flex items-center gap-1"><i className="inline-block h-[3px] w-4 bg-ink" /> train</span>
          <span className="flex items-center gap-1"><i className="inline-block h-[3px] w-4 bg-rail" /> validation</span>
        </span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full overflow-visible" role="img" aria-label={title}>
        {[0, 0.25, 0.5, 0.75, 1].map((g) => (
          <line key={g} x1="0" x2={W} y1={H * g} y2={H * g} stroke="#241612" strokeOpacity=".12" />
        ))}
        <polyline points={line(train)} fill="none" stroke="#241612" strokeWidth="2.5" />
        <polyline points={line(val)} fill="none" stroke="#2e7d4f" strokeWidth="2.5" />
      </svg>
      <div className="num mt-1 flex justify-between text-[11px] text-mute">
        <span>epoch 1</span>
        <span>
          final {train[train.length - 1].toFixed(3)} / {val[val.length - 1].toFixed(3)}
        </span>
        <span>epoch {train.length}</span>
      </div>
    </figure>
  );
};

/** Row-normalised confusion matrix on a canvas; hover reads out a cell. */
const Confusion: React.FC<{ report: Report }> = ({ report }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const [hover, setHover] = useState<string>('Hover a cell: row = true sign, column = what the model said.');
  const { confusion } = report.metrics;
  const n = confusion.length;
  const cell = Math.max(5, Math.floor(560 / n));

  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#fffaf3';
    ctx.fillRect(0, 0, n * cell, n * cell);
    confusion.forEach((row, r) => {
      const total = row.reduce((a, b) => a + b, 0) || 1;
      row.forEach((v, c) => {
        if (!v) return;
        const share = v / total;
        // Diagonal (correct) in ink, mistakes in alarm red so they stand out.
        ctx.fillStyle = r === c ? `rgba(36,22,18,${0.12 + 0.88 * share})` : `rgba(212,42,23,${0.35 + 0.65 * share})`;
        ctx.fillRect(c * cell, r * cell, cell - 1, cell - 1);
      });
    });
  }, [confusion, n, cell]);

  const worst = useMemo(() => {
    const pairs: { t: number; p: number; v: number }[] = [];
    confusion.forEach((row, t) => row.forEach((v, p) => t !== p && v > 0 && pairs.push({ t, p, v })));
    return pairs.sort((a, b) => b.v - a.v).slice(0, 6);
  }, [confusion]);

  return (
    <div className="plate p-3">
      <div className="flex flex-wrap gap-4">
        <canvas
          ref={ref}
          width={n * cell}
          height={n * cell}
          className="max-w-full border-2 border-ink [image-rendering:pixelated]"
          style={{ width: Math.min(n * cell, 420) }}
          onMouseMove={(e) => {
            const box = e.currentTarget.getBoundingClientRect();
            const c = Math.floor(((e.clientX - box.left) / box.width) * n);
            const r = Math.floor(((e.clientY - box.top) / box.height) * n);
            if (confusion[r]?.[c] === undefined) return;
            setHover(`True ${vocab(report.labels[r]).text} → predicted ${vocab(report.labels[c]).text}: ${confusion[r][c]} of ${confusion[r].reduce((a, b) => a + b, 0)}`);
          }}
          role="img"
          aria-label="Confusion matrix"
        />
        <div className="min-w-[200px] flex-1">
          <p className="tag text-mute">Most confused pairs (test set)</p>
          {worst.length === 0 ? (
            <p className="mt-2 text-[15px]">No mistakes on the test set.</p>
          ) : (
            <ul className="mt-2 space-y-1 text-[14px]">
              {worst.map(({ t, p, v }) => (
                <li key={`${t}-${p}`} className="flex items-center gap-1.5">
                  <b className="uppercase">{vocab(report.labels[t]).text}</b> <ArrowRight className="h-3.5 w-3.5" />
                  <span className="uppercase">{vocab(report.labels[p]).text}</span>
                  <span className="num ml-auto text-mute">×{v}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="num mt-3 text-[12px] text-mute">{hover}</p>
        </div>
      </div>
    </div>
  );
};

/** t-SNE of the embedding layer: each dot is a test sample, coloured by its true class. */
const Embedding: React.FC<{ report: Report }> = ({ report }) => {
  const n = report.labels.length;
  return (
    <figure className="plate p-3">
      <figcaption className="tag mb-2">What the network learned · t-SNE of the embedding layer</figcaption>
      <svg viewBox="-4 -4 108 108" className="dots aspect-square w-full max-w-[420px] border-2 border-ink bg-white" role="img" aria-label="t-SNE scatter plot">
        {report.embedding.map(([x, y, c], i) => (
          <circle key={i} cx={x * 100} cy={y * 100} r="1.1" fill={`hsl(${(c * 360) / n} 75% 38%)`}>
            <title>{vocab(report.labels[c]).text}</title>
          </circle>
        ))}
      </svg>
      <p className="mt-2 max-w-[52ch] text-[13px] leading-snug text-mute">
        Samples of one sign land in one tight cluster, away from other signs. The last layer only has to draw lines
        between clusters, which is why it is a single dense layer.
      </p>
    </figure>
  );
};

const LayerTable: React.FC<{ report: Report }> = ({ report }) => (
  <details className="plate">
    <summary className="cursor-pointer px-3 py-2 text-[15px] font-semibold">
      All {report.layers.length} layers · {report.params.toLocaleString()} parameters
    </summary>
    <div className="max-h-[340px] overflow-auto border-t-2 border-ink">
      <table className="num w-full text-left text-[12px]">
        <thead className="sticky top-0 bg-ink text-paper">
          <tr>
            <th className="px-2 py-1 font-medium">layer</th>
            <th className="px-2 py-1 font-medium">type</th>
            <th className="px-2 py-1 font-medium">output</th>
            <th className="px-2 py-1 text-right font-medium">params</th>
          </tr>
        </thead>
        <tbody>
          {report.layers.map((l) => (
            <tr key={l.name} className="border-b border-ink/10">
              <td className="px-2 py-0.5">{l.name}</td>
              <td className="px-2 py-0.5">{l.type}</td>
              <td className="px-2 py-0.5">{l.shape.join(' × ')}</td>
              <td className="px-2 py-0.5 text-right">{l.params ? l.params.toLocaleString() : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </details>
);

const NAMES: Record<string, string> = {
  static_cnn: '2-D CNN, shared across hands (ships)',
  static_mlp: 'MLP baseline',
  dynamic_tcn: 'Dilated temporal CNN + attention (ships)',
  dynamic_bilstm: 'Bidirectional LSTM',
  dynamic_gru: 'GRU',
  dynamic_mlp: 'MLP on the flattened window',
};

const Comparison: React.FC<{ report: Report; dynamic: boolean }> = ({ report, dynamic }) => {
  const rows = Object.values(report.comparison).sort((a, b) => (b.test.accuracy ?? 0) - (a.test.accuracy ?? 0));
  if (rows.length < 2) return null;
  return (
    <div className="plate overflow-x-auto">
      <table className="w-full min-w-[520px] text-left text-[14px]">
        <thead className="bg-ink text-paper">
          <tr className="tag">
            <th className="px-3 py-2 font-medium">Architecture</th>
            <th className="px-3 py-2 text-right font-medium">Test acc.</th>
            <th className="px-3 py-2 text-right font-medium">{dynamic ? 'Words only' : 'Stress test'}</th>
            <th className="px-3 py-2 text-right font-medium">Macro F1</th>
            <th className="px-3 py-2 text-right font-medium">Params</th>
            <th className="px-3 py-2 text-right font-medium">Train</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.model} className={`border-t border-ink/15 ${r.model === report.model ? 'bg-signal font-semibold' : ''}`}>
              <td className="px-3 py-1.5">{NAMES[r.model] ?? r.model}</td>
              <td className="num px-3 py-1.5 text-right">{pct(r.test.accuracy, 2)}</td>
              <td className="num px-3 py-1.5 text-right">{pct(dynamic ? r.test.word_accuracy : r.test.stress_accuracy, 2)}</td>
              <td className="num px-3 py-1.5 text-right">{pct(r.test.macro_f1, 2)}</td>
              <td className="num px-3 py-1.5 text-right">{r.params.toLocaleString()}</td>
              <td className="num px-3 py-1.5 text-right">{Math.round(r.train_seconds)} s</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const ModelReport: React.FC<{ name: 'static' | 'dynamic' }> = ({ name }) => {
  const { report, missing } = useReport(name);
  if (missing) return <p className="plate p-4 text-[15px]">No trained {name} model in public/model/{name}/. Run the training scripts in ml/.</p>;
  if (!report) return <p className="tag text-mute">Loading report…</p>;
  const t = report.test;
  const dynamic = name === 'dynamic';
  return (
    <div className="space-y-3">
      <p className="text-[15px] text-mute">
        {report.dataset}. Split: {report.split.train.toLocaleString()} train / {report.split.val.toLocaleString()} validation /{' '}
        {report.split.test.toLocaleString()} test {dynamic ? 'videos' : 'images'}. Numbers below are on the test set, which the model never saw.
      </p>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Tile loud label="Test accuracy" value={pct(dynamic ? t.word_accuracy : t.accuracy)} note={dynamic ? `Word windows only. With background windows: ${pct(t.accuracy)}` : `${t.samples} held-out images`} />
        <Tile label="Top-3 accuracy" value={pct(t.top3_accuracy)} note="The right sign is among the three best guesses" />
        <Tile label="Macro F1" value={pct(t.macro_f1)} note="Average over classes, so rare signs count equally" />
        <Tile
          label="Calibration error"
          value={pct(t.ece, 1)}
          note={`Was ${pct(t.ece_uncalibrated, 1)} before temperature scaling (T = ${report.temperature.toFixed(2)})`}
        />
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <Curves title="Loss" train={report.history.loss} val={report.history.val_loss} />
        <Curves title="Accuracy" train={report.history.accuracy} val={report.history.val_accuracy} max={1} />
      </div>
      <Comparison report={report} dynamic={dynamic} />
      <div className="grid gap-3 lg:grid-cols-[1.25fr_1fr]">
        <Confusion report={report} />
        <Embedding report={report} />
      </div>
      <LayerTable report={report} />
    </div>
  );
};

// ---------------------------------------------------------------------------
// Live benchmark
// ---------------------------------------------------------------------------

async function timeModel(model: SignModel, batch: number, runs = 40) {
  const input = new Float32Array(batch * model.inputSize).map(() => Math.random() - 0.5);
  await model.predict(input, batch);
  const samples: number[] = [];
  for (let i = 0; i < runs; i++) {
    const t0 = performance.now();
    await model.predict(input, batch);
    samples.push(performance.now() - t0);
  }
  samples.sort((a, b) => a - b);
  return { median: samples[samples.length >> 1], p95: samples[Math.floor(samples.length * 0.95)] };
}

const Benchmark: React.FC<{ bundle: ModelBundle | null }> = ({ bundle }) => {
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<{ name: string; median: number; p95: number }[]>([]);
  const run = async () => {
    if (!bundle) return;
    setBusy(true);
    const out: typeof rows = [];
    if (bundle.staticModel) out.push({ name: 'Letters CNN, 1 frame', ...(await timeModel(bundle.staticModel, 1)) });
    if (bundle.dynamicModel) {
      out.push({ name: 'Words TCN, 1 window', ...(await timeModel(bundle.dynamicModel, 1)) });
      out.push({ name: 'Words TCN, batch of 5 windows', ...(await timeModel(bundle.dynamicModel, 5)) });
    }
    setRows(out);
    setBusy(false);
  };
  return (
    <div className="plate p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[15px]">
          Time each model on <b>this</b> device ({bundle?.backend ?? '…'} backend, 40 runs each).
        </p>
        <button className="btn btn-signal btn-sm" onClick={run} disabled={busy || !bundle}>
          <Timer className="h-4 w-4" /> {busy ? 'Measuring…' : 'Run benchmark'}
        </button>
      </div>
      {rows.length > 0 && (
        <table className="num mt-3 w-full text-left text-[13px]">
          <tbody>
            {rows.map((r) => (
              <tr key={r.name} className="border-t border-ink/15">
                <td className="py-1.5 font-sans text-[14px]">{r.name}</td>
                <td className="py-1.5 text-right">median {r.median.toFixed(1)} ms</td>
                <td className="py-1.5 text-right text-mute">p95 {r.p95.toFixed(1)} ms</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Data structures and algorithms, live
// ---------------------------------------------------------------------------

const TriePlayground: React.FC<{ language: LanguageModel }> = ({ language }) => {
  const [q, setQ] = useState('hosp');
  const key = q.trim().toUpperCase();
  const completions = key ? language.trie.complete(key, 6) : [];
  const fuzzy = key.length >= 3 ? language.trie.fuzzy(key, key.length >= 6 ? 2 : 1, 6) : [];
  return (
    <div className="plate p-3">
      <p className="tag">Trie + edit distance · try a prefix or a misspelling</p>
      <input className="field mt-2 uppercase" value={q} onChange={(e) => setQ(e.target.value.replace(/[^a-zA-Z0-9]/g, ''))} aria-label="Letters spelled so far" spellCheck={false} />
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <p className="tag text-mute">Prefix completions · O(length + subtree)</p>
          <p className="mt-1 min-h-[1.5em] text-[15px] font-semibold">{completions.map((s) => s.word).join(' · ') || 'none'}</p>
        </div>
        <div>
          <p className="tag text-mute">Within {key.length >= 6 ? 2 : 1} edit{key.length >= 6 ? 's' : ''} · Levenshtein over the trie</p>
          <p className="mt-1 min-h-[1.5em] text-[15px] font-semibold">
            {fuzzy.map((s) => `${s.word} (${s.edits})`).join(' · ') || (key.length < 3 ? 'type 3+ letters' : 'none')}
          </p>
        </div>
      </div>
      <p className="mt-3 text-[13px] text-mute">
        {language.trie.size.toLocaleString()} words in the trie. Suggestion cache (LRU, 64 entries): {language.cacheStats.hits} hits,{' '}
        {language.cacheStats.misses} misses.
      </p>
    </div>
  );
};

/** The Levenshtein table for two words, with the cheapest path highlighted. */
const EditTable: React.FC = () => {
  const [a, setA] = useState('DOCTER');
  const [b, setB] = useState('DOCTOR');
  const { table, path } = useMemo(() => {
    const A = a.toUpperCase();
    const B = b.toUpperCase();
    const t = Array.from({ length: A.length + 1 }, (_, i) => Array.from({ length: B.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
    for (let i = 1; i <= A.length; i++)
      for (let j = 1; j <= B.length; j++)
        t[i][j] = Math.min(t[i - 1][j] + 1, t[i][j - 1] + 1, t[i - 1][j - 1] + (A[i - 1] === B[j - 1] ? 0 : 1));
    // Walk back from the bottom-right corner along cheapest predecessors.
    const on = new Set<string>();
    let i = A.length;
    let j = B.length;
    on.add(`${i},${j}`);
    while (i > 0 || j > 0) {
      const diag = i > 0 && j > 0 ? t[i - 1][j - 1] : Infinity;
      const up = i > 0 ? t[i - 1][j] : Infinity;
      const left = j > 0 ? t[i][j - 1] : Infinity;
      if (diag <= up && diag <= left) [i, j] = [i - 1, j - 1];
      else if (up <= left) i--;
      else j--;
      on.add(`${i},${j}`);
    }
    return { table: t, path: on };
  }, [a, b]);
  const clean = (s: string) => s.replace(/[^a-zA-Z]/g, '').slice(0, 10).toUpperCase();
  return (
    <div className="plate p-3">
      <p className="tag">Edit distance · dynamic programming table</p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <input className="field uppercase" value={a} onChange={(e) => setA(clean(e.target.value))} aria-label="Spelled word" spellCheck={false} />
        <input className="field uppercase" value={b} onChange={(e) => setB(clean(e.target.value))} aria-label="Dictionary word" spellCheck={false} />
      </div>
      <div className="mt-3 overflow-x-auto">
        <table className="num border-collapse text-center text-[12px]">
          <tbody>
            <tr>
              <td className="h-7 w-7" />
              <td className="h-7 w-7 text-mute">∅</td>
              {[...b].map((ch, j) => (
                <td key={j} className="h-7 w-7 font-semibold">{ch}</td>
              ))}
            </tr>
            {table.map((row, i) => (
              <tr key={i}>
                <td className="h-7 w-7 font-semibold">{i === 0 ? <span className="font-normal text-mute">∅</span> : a[i - 1]}</td>
                {row.map((v, j) => (
                  <td key={j} className={`h-7 w-7 border border-ink/25 ${path.has(`${i},${j}`) ? 'bg-signal font-semibold' : 'bg-white'}`}>
                    {v}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[14px]">
        Distance <b className="num">{table[a.length][b.length]}</b>. Each cell is the cheapest of: delete (cell above + 1), insert (cell to the left + 1), or keep/substitute (diagonal + 0 or 1).
      </p>
    </div>
  );
};

const EngineState: React.FC<{ engine: SignEngine | null }> = ({ engine }) => {
  const [, tick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => tick((n) => n + 1), 400);
    return () => window.clearInterval(id);
  }, []);
  const t = engine?.telemetry;
  const ring = engine?.ring;
  const cells = 32;
  const filled = Math.round((t?.ringFill ?? 0) * cells);
  const head = ring ? Math.floor(((ring.total % ring.capacity) / ring.capacity) * cells) : 0;
  return (
    <div className="plate p-3">
      <p className="tag">Ring buffer · the last {ring?.capacity ?? 256} frames, O(1) push</p>
      <div className="mt-2 flex gap-[2px]" aria-hidden="true">
        {Array.from({ length: cells }, (_, i) => (
          <span key={i} className={`h-5 flex-1 border border-ink ${i === head ? 'bg-alarm' : i < filled ? 'bg-ink' : 'bg-white'}`} />
        ))}
      </div>
      <dl className="num mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-[12.5px] sm:grid-cols-4">
        <div><dt className="text-mute">frames seen</dt><dd className="font-semibold">{t?.frames ?? 0}</dd></div>
        <div><dt className="text-mute">write head</dt><dd className="font-semibold">{ring ? ring.total % ring.capacity : 0}</dd></div>
        <div><dt className="text-mute">spotter state</dt><dd className="font-semibold">{t?.phase ?? 'idle'}</dd></div>
        <div><dt className="text-mute">proposals / eval</dt><dd className="font-semibold">{t?.proposals ?? 0}</dd></div>
        <div><dt className="text-mute">letter runs</dt><dd className="font-semibold">{t?.staticRuns ?? 0}</dd></div>
        <div><dt className="text-mute">word runs</dt><dd className="font-semibold">{t?.dynamicRuns ?? 0}</dd></div>
        <div><dt className="text-mute">hand speed</dt><dd className="font-semibold">{(t?.speed ?? 0).toFixed(1)} /s</dd></div>
        <div><dt className="text-mute">features</dt><dd className="font-semibold">{(t?.featureMs ?? 0).toFixed(2)} ms</dd></div>
      </dl>
      <p className="mt-2 text-[13px] text-mute">Run the camera or the demo stream in Translate, then come back: these are the live engine's counters.</p>
    </div>
  );
};

const PIPELINE: { step: string; what: string; how: string }[] = [
  { step: 'Camera', what: 'One video frame', how: 'requestVideoFrameCallback: runs once per new frame' },
  { step: 'Palm detector', what: 'Where the hands are', how: 'Pretrained single-shot CNN detector (MediaPipe)' },
  { step: 'Landmark CNN', what: '21 points per hand', how: 'Pretrained regression CNN on each hand crop' },
  { step: 'Features', what: '132 numbers per frame', how: 'Wrist-relative, size-normalised, into a ring buffer' },
  { step: 'Letters CNN', what: 'A-Z, 1-9 every frame', how: 'Conv2D with weights shared across both hands' },
  { step: 'Words TCN', what: '70 words from windows', how: 'Dilated Conv1D + attention over 32 frames' },
  { step: 'Decoder', what: 'One committed sign', how: 'EMA + hold gate; proposals + peak NMS' },
  { step: 'Language', what: 'Suggestions', how: 'Trie, edit distance, bigram counts, LRU cache' },
];

const ALGORITHMS: [string, string, string][] = [
  ['Ring buffer', 'O(1) push and access', 'Holds the last 256 frames without allocating'],
  ['Binary search', 'O(log n)', 'Finds the frame from "1.2 s ago" by timestamp'],
  ['Nearest-neighbour resampling', 'O(T)', 'Turns any window length into exactly 32 frames'],
  ['Exponential moving average', 'O(classes)', 'Smooths letter probabilities and hand speed'],
  ['Finite-state machine', 'O(1) per frame', 'Letter hold gate; word spotter idle / watching / tracking'],
  ['Sliding-window proposals', 'O(windows)', 'Several window lengths ending now, like region proposals'],
  ['Temporal IoU + NMS', 'O(n log n)', 'Keeps only the best window for each sign'],
  ['Min-heap top-k', 'O(n log k)', 'Top-3 candidates; ranking suggestions'],
  ['Trie', 'O(word length)', 'Autocomplete while fingerspelling'],
  ['Levenshtein (dynamic programming)', 'O(m × n), pruned', 'Corrects a misread letter'],
  ['Hash-map bigram model', 'O(1) update', 'Predicts the next word; learns from use'],
  ['LRU cache (map + linked list)', 'O(1) get / set', 'Memoises suggestion queries'],
  ['Prototypical network (cosine similarity)', 'O(signs × 160)', 'Recognises signs you teach it from 3-5 examples'],
];

export const LabView: React.FC<{ bundle: ModelBundle | null; engine: SignEngine | null; language: LanguageModel }> = ({
  bundle,
  engine,
  language,
}) => {
  const [tab, setTab] = useState<'dynamic' | 'static'>('dynamic');
  return (
    <div className="space-y-6">
      <div className="board px-4 py-3">
        <p className="tag">Under the hood · अंदर क्या चलता है</p>
        <h1 className="display mt-1 text-[clamp(44px,7vw,92px)]">Model lab</h1>
        <p className="mt-2 max-w-[70ch] text-[16px]">
          Every number on this page comes from the files the training scripts wrote, or is measured live in your browser.
          The written explanation of each algorithm is in <code className="num text-[14px]">docs/ALGORITHMS.md</code>.
        </p>
      </div>

      <Section n="01" title="Pipeline" kicker="From a camera frame to a spoken word">
        <ol className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {PIPELINE.map((p, i) => (
            <li key={p.step} className="plate p-3">
              <p className="num text-[11px] text-mute">{String(i + 1).padStart(2, '0')}</p>
              <p className="display text-[24px]">{p.step}</p>
              <p className="mt-1 text-[15px] font-semibold">{p.what}</p>
              <p className="text-[13px] leading-snug text-mute">{p.how}</p>
            </li>
          ))}
        </ol>
        <div className="mt-3">
          <Benchmark bundle={bundle} />
        </div>
      </Section>

      <Section n="02" title="Models" kicker="Trained in ml/, exported to TensorFlow.js">
        <div className="mb-3 inline-flex overflow-hidden rounded-md border-2 border-ink" role="tablist">
          {(['dynamic', 'static'] as const).map((t, i) => (
            <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`px-4 py-2 text-[15px] font-bold ${i ? 'border-l-2 border-ink' : ''} ${tab === t ? 'bg-ink text-paper' : 'bg-card'}`}>
              {t === 'dynamic' ? 'Words · temporal CNN' : 'Letters · 2-D CNN'}
            </button>
          ))}
        </div>
        <ModelReport key={tab} name={tab} />
      </Section>

      <Section n="03" title="Data structures" kicker="The algorithms between the model and the sentence">
        <div className="grid gap-3 lg:grid-cols-2">
          <TriePlayground language={language} />
          <EditTable />
        </div>
        <div className="mt-3">
          <EngineState engine={engine} />
        </div>
        <div className="plate mt-3 overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-[14px]">
            <thead className="bg-ink text-paper">
              <tr className="tag">
                <th className="px-3 py-2 font-medium">Algorithm / structure</th>
                <th className="px-3 py-2 font-medium">Cost</th>
                <th className="px-3 py-2 font-medium">What it does here</th>
              </tr>
            </thead>
            <tbody>
              {ALGORITHMS.map(([name, cost, use]) => (
                <tr key={name} className="border-t border-ink/15">
                  <td className="px-3 py-1.5 font-semibold">{name}</td>
                  <td className="num px-3 py-1.5 text-[12.5px]">{cost}</td>
                  <td className="px-3 py-1.5">{use}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
};

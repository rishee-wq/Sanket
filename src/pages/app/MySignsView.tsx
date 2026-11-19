import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Circle, Hand, Move, Save, Trash2, X } from 'lucide-react';
import { CameraStage, type Stage } from '../../components/app/CameraStage';
import type { SignEngine, Token } from '../../engine/engine';
import { POINTS, RAW_SIZE, SHAPE_SIZE } from '../../engine/features';
import { type CustomKind, type CustomSign, MIN_EXAMPLES, type Prototype, type Recording, buildPrototype } from '../../engine/fewshot';
import type { ModelBundle } from '../../hooks/useSignEngine';
import { drawHands, ON_PAPER } from '../../lib/handDrawing';
import { takeTeachRequest, checkRecording, deleteCustomSign, embedRecordings, saveCustomSign } from '../../lib/mySigns';
import { soundEffects } from '../../services/soundEffects';

interface Props {
  stage: Stage;
  engine: SignEngine | null;
  bundle: ModelBundle | null;
  signs: CustomSign[];
  prototypes: Prototype[];
  /** Signs the engine committed while this view was open, newest first. */
  recent: Token[];
}

const DURATION: Record<CustomKind, number> = { movement: 2600, shape: 1400 };
const TARGET_EXAMPLES = 5;
const pct = (v: number) => `${Math.round(v * 100)}%`;

interface FewshotReport {
  held_out: string[];
  shots: number;
  ways: number;
  episodes: number;
  closed_set_accuracy: number;
  chance: number;
  taught: number;
  app_rule: { threshold: number; margin: number; accept: number; false_accept: number };
}

/** Loops one recording as a small skeleton (mirrored, as the user saw themself). */
const RecordingThumb: React.FC<{ rec: Recording }> = ({ rec }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    const frames = Array.from({ length: rec.frames }, (_, t) => {
      const hands = [];
      for (let s = 0; s < 2; s++) {
        if (!((rec.present[t] >> s) & 1)) continue;
        const base = t * RAW_SIZE + s * SHAPE_SIZE;
        const landmarks = Array.from({ length: POINTS }, (_, i) => {
          const p = { x: rec.hands[base + i * 3], y: rec.hands[base + i * 3 + 1], z: 0 };
          x0 = Math.min(x0, p.x);
          y0 = Math.min(y0, p.y);
          x1 = Math.max(x1, p.x);
          y1 = Math.max(y1, p.y);
          return p;
        });
        hands.push({ landmarks, handedness: null, score: 1 });
      }
      return hands;
    });
    // Fit the motion into the square thumbnail with a margin.
    const size = Math.max(x1 - x0, y1 - y0) * 1.25 || 1;
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    const view = { x0: cx - size / 2, y0: cy - size / 2, x1: cx + size / 2, y1: cy + size / 2 };
    let raf = 0;
    const start = performance.now();
    const tick = () => {
      const f = Math.floor(((performance.now() - start) / 40) % (rec.frames + 10));
      drawHands(ctx, frames[Math.min(f, rec.frames - 1)], true, false, ON_PAPER, view);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [rec]);
  return <canvas ref={ref} width={160} height={160} className="dots h-full w-full bg-white" aria-hidden="true" />;
};

/** Records one example: a 3-2-1 countdown, then a fixed-length capture from the engine's ring buffer. */
function useRecorder(engine: SignEngine | null, kind: CustomKind, onDone: (rec: Recording) => void) {
  const [phase, setPhase] = useState<'idle' | 'countdown' | 'recording'>('idle');
  const [count, setCount] = useState(3);
  const [progress, setProgress] = useState(0);
  const cancelled = useRef(false);

  useEffect(() => () => void (cancelled.current = true), []);

  const start = async () => {
    if (!engine || phase !== 'idle') return;
    cancelled.current = false;
    setPhase('countdown');
    for (let n = 3; n > 0; n--) {
      setCount(n);
      soundEffects.playTick();
      await new Promise((r) => setTimeout(r, 650));
      if (cancelled.current) return setPhase('idle');
    }
    setPhase('recording');
    const from = engine.ring.total;
    const t0 = performance.now();
    await new Promise<void>((resolve) => {
      const tick = () => {
        const p = (performance.now() - t0) / DURATION[kind];
        setProgress(Math.min(1, p));
        if (cancelled.current || p >= 1) return resolve();
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    setPhase('idle');
    setProgress(0);
    if (!cancelled.current) onDone(engine.snapshot(from));
  };

  return { phase, count, progress, start };
}

const Teach: React.FC<{ stage: Stage; engine: SignEngine | null; bundle: ModelBundle | null; existing: CustomSign[] }> = ({
  stage,
  engine,
  bundle,
  existing,
}) => {
  const [request] = useState(takeTeachRequest);
  const [text, setText] = useState(request?.text ?? '');
  const [kind, setKind] = useState<CustomKind>(request?.kind ?? 'movement');
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [preview, setPreview] = useState<Prototype | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const recorder = useRecorder(engine, kind, (rec) => {
    const issue = checkRecording(kind, rec);
    setProblem(issue);
    if (issue) return;
    soundEffects.playAccepted();
    setRecordings((r) => [...r, rec]);
  });

  // Live consistency: how similar each example is to the average of the others.
  useEffect(() => {
    if (!bundle || recordings.length < 2) return setPreview(null);
    let alive = true;
    embedRecordings(kind, recordings, bundle).then(
      (emb) => alive && setPreview(buildPrototype({ id: 'preview', text, kind }, emb)),
      (err) => alive && setProblem(err instanceof Error ? err.message : String(err))
    );
    return () => {
      alive = false;
    };
  }, [recordings, kind, bundle]);

  const trimmed = text.trim();
  const duplicate = existing.some((s) => s.text.toLowerCase() === trimmed.toLowerCase());
  const cameraOn = stage.camera.isActive;
  const canSave = trimmed.length > 0 && !duplicate && recordings.length >= MIN_EXAMPLES;

  const save = () => {
    saveCustomSign({ id: `${Date.now().toString(36)}`, text: trimmed, kind, recordings, created: Date.now() });
    setSaved(trimmed);
    setText('');
    setRecordings([]);
    setPreview(null);
  };

  const weakest = preview ? Math.min(...preview.consistency) : null;

  return (
    <section className="space-y-3" aria-label="Teach a new sign">
      <div className="plate p-3.5">
        <p className="tag text-mute">1 · What should it say?</p>
        <input
          className="field mt-2 text-[20px] font-semibold"
          placeholder="Your name, a place, a phrase…"
          value={text}
          maxLength={40}
          onChange={(e) => {
            setText(e.target.value);
            setSaved(null);
          }}
          aria-label="Text for the new sign"
          aria-invalid={duplicate || undefined}
        />
        {duplicate && <p className="mt-1.5 text-[14px] font-semibold text-alarm">You already have a sign for “{trimmed}”.</p>}
        <div className="mt-3 grid grid-cols-2 overflow-hidden rounded-md border-2 border-ink" role="radiogroup" aria-label="Kind of sign">
          {([
            ['movement', Move, 'A movement', 'Like a word sign. Uses the words model.'],
            ['shape', Hand, 'A hand shape', 'Held still, like a letter. Uses the letters model.'],
          ] as const).map(([k, Icon, title, hint], i) => (
            <button
              key={k}
              role="radio"
              aria-checked={kind === k}
              disabled={recordings.length > 0}
              onClick={() => setKind(k)}
              className={`p-3 text-left disabled:cursor-not-allowed ${i ? 'border-l-2 border-ink' : ''} ${kind === k ? 'bg-ink text-paper' : 'bg-card hover:bg-white'}`}
            >
              <span className="flex items-center gap-2 text-[16px] font-bold">
                <Icon className="h-5 w-5" /> {title}
              </span>
              <span className={`mt-0.5 block text-[13px] leading-snug ${kind === k ? 'text-paper/70' : 'text-mute'}`}>{hint}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="plate p-3.5">
        <div className="flex items-center justify-between gap-2">
          <p className="tag text-mute">
            2 · Record it {TARGET_EXAMPLES} times · {recordings.length}/{TARGET_EXAMPLES}
          </p>
          {recordings.length > 0 && (
            <button className="btn btn-bare btn-sm" onClick={() => setRecordings([])}>
              Start over
            </button>
          )}
        </div>
        <div className="relative mt-2">
          <CameraStage stage={stage} demo={[]} demoLabel="" />
          {recorder.phase !== 'idle' && (
            <div className="pointer-events-none absolute inset-0 grid place-items-center rounded-md" aria-live="assertive">
              {recorder.phase === 'countdown' ? (
                <span key={recorder.count} className="display flap text-[140px] text-signal [text-shadow:4px_4px_0_#17140f]">
                  {recorder.count}
                </span>
              ) : (
                <div className="absolute inset-x-4 bottom-14">
                  <span className="chip border-alarm bg-alarm text-white">
                    <Circle className="h-2.5 w-2.5" fill="currentColor" /> Recording · {kind === 'shape' ? 'hold still' : 'sign now'}
                  </span>
                  <div className="mt-1.5 h-3 border-2 border-ink bg-white">
                    <div className="h-full bg-alarm" style={{ width: pct(recorder.progress) }} />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        <button
          className="btn btn-alarm mt-2 w-full !min-h-[52px] text-[17px]"
          onClick={recorder.start}
          disabled={!cameraOn || recorder.phase !== 'idle' || recordings.length >= 8}
        >
          <Circle className="h-4 w-4" fill="currentColor" />
          {!cameraOn ? 'Start the camera to record' : recorder.phase !== 'idle' ? 'Get ready…' : `Record example ${recordings.length + 1}`}
        </button>
        <p className="mt-1.5 text-[13px] text-mute">
          {kind === 'movement'
            ? 'Start with your hands down, make the sign once, then lower them. Vary it a little each time, as you naturally would.'
            : 'Make the shape before the countdown ends and hold it still while the bar fills.'}
        </p>
        {problem && (
          <p role="alert" className="mt-2 rounded border-2 border-alarm bg-white px-2.5 py-1.5 text-[14px] font-semibold">
            {problem}
          </p>
        )}

        {recordings.length > 0 && (
          <ul className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-5">
            {recordings.map((rec, i) => (
              <li key={i} className="relative overflow-hidden rounded border-2 border-ink">
                <div className="aspect-square">
                  <RecordingThumb rec={rec} />
                </div>
                <span className="num flex items-center justify-between bg-card px-1.5 py-0.5 text-[11px]">
                  #{i + 1} {preview && <span>{pct(preview.consistency[i])}</span>}
                </span>
                <button
                  className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded border-[1.5px] border-ink bg-white"
                  onClick={() => setRecordings((r) => r.filter((_, j) => j !== i))}
                  aria-label={`Delete example ${i + 1}`}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
        {preview && weakest !== null && (
          <p className="mt-2 text-[14px]">
            Consistency: each example is <b>{pct(weakest)}–{pct(Math.max(...preview.consistency))}</b> similar to the others.{' '}
            {weakest < 0.8 ? 'One example looks different; delete it and record again for a sharper match.' : 'Good, these agree.'}
          </p>
        )}
      </div>

      <button className="btn btn-ink w-full !min-h-[52px] text-[17px]" onClick={save} disabled={!canSave}>
        <Save className="h-5 w-5" />
        {canSave ? `Save “${trimmed}”` : recordings.length < MIN_EXAMPLES ? `Record at least ${MIN_EXAMPLES} examples to save` : 'Give the sign a name to save'}
      </button>
      {saved && (
        <p role="status" className="flex items-center gap-1.5 text-[15px] font-semibold text-go">
          <Check className="h-5 w-5" /> “{saved}” is saved. Sign it now and it appears under Recognised.
        </p>
      )}
    </section>
  );
};

export const MySignsView: React.FC<Props> = ({ stage, engine, bundle, signs, prototypes, recent }) => {
  const [report, setReport] = useState<FewshotReport | null>(null);
  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}model/dynamic/fewshot.json`)
      .then((r) => (r.ok && r.headers.get('content-type')?.includes('json') ? r.json() : null))
      .then(setReport, () => setReport(null));
  }, []);
  const byId = useMemo(() => new Map(prototypes.map((p) => [p.id, p])), [prototypes]);
  const mine = recent.filter((t) => t.custom);

  return (
    <div className="space-y-[var(--pad)]">
      <div className="board px-4 py-3">
        <p className="tag">Few-shot learning · अपना इशारा सिखाएँ</p>
        <h1 className="display mt-1 text-[clamp(44px,7vw,92px)]">Teach your own sign</h1>
        <p className="mt-2 max-w-[72ch] text-[16px]">
          Your name sign, a local variant, a phrase you use every day. Show it a few times and Sanket recognises it, with no
          retraining and nothing sent anywhere: your examples stay in this browser.
        </p>
      </div>

      <div className="grid gap-[var(--pad)] lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <Teach stage={stage} engine={engine} bundle={bundle} existing={signs} />

        <div className="space-y-3">
          <section className="plate" aria-label="Your signs">
            <div className="flex items-center justify-between border-b-2 border-ink px-3.5 py-2">
              <span className="tag">Your signs</span>
              <span className="tag text-mute">{signs.length} saved</span>
            </div>
            {signs.length === 0 ? (
              <p className="p-3.5 text-[15px] text-mute">None yet. Teach one on the left.</p>
            ) : (
              <ul>
                {signs.map((s) => {
                  const p = byId.get(s.id);
                  return (
                    <li key={s.id} className="flex items-center gap-3 border-b border-ink/15 px-3.5 py-2.5 last:border-0">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded border-2 border-ink bg-signal">
                        {s.kind === 'movement' ? <Move className="h-4 w-4" /> : <Hand className="h-4 w-4" />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[17px] font-bold">{s.text}</p>
                        <p className="num text-[11.5px] text-mute">
                          {s.recordings.length} examples · {s.kind}
                          {p && ` · match above ${pct(p.threshold)}`}
                        </p>
                      </div>
                      <button className="btn btn-bare btn-sm btn-icon !w-[34px]" onClick={() => deleteCustomSign(s.id)} aria-label={`Delete ${s.text}`}>
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="plate p-3.5" aria-label="Try it" aria-live="polite">
            <p className="tag text-mute">3 · Try it</p>
            <p className="mt-1 text-[15px]">With the camera on, make any of your signs. Recognised ones appear here, and in Translate.</p>
            <div className="mt-2 flex min-h-[40px] flex-wrap gap-1.5">
              {mine.length === 0 ? (
                <span className="text-[14px] text-mute">Nothing yet</span>
              ) : (
                mine.slice(0, 8).map((t, i) => (
                  <span key={`${t.time}-${i}`} className={`chip ${i === 0 ? 'flap bg-go text-white' : 'bg-card'}`}>
                    {t.label} {pct(t.confidence)}
                  </span>
                ))
              )}
            </div>
          </section>

          <section className="plate p-3.5" aria-label="How it works">
            <p className="tag text-mute">How it works · prototypical network</p>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-[14.5px] leading-snug">
              <li>Each example goes through the trained model, stopping one layer before the answer: the <b>embedding</b>, 160 numbers that describe the movement.</li>
              <li>The examples are averaged into one point: the sign's <b>prototype</b>.</li>
              <li>Every new movement is embedded the same way and compared with each prototype by <b>cosine similarity</b>.</li>
              <li>It counts if the similarity is at least 80% and it is not clearly closer to one of the 70 built-in words or to "no sign" (a nearest-class-mean check).</li>
            </ol>
            {report && (
              <p className="mt-3 border-t-2 border-dashed border-ink/30 pt-2 text-[14px]">
                Tested on {report.ways} words the network <b>never saw</b> ({report.shots} examples each, {report.episodes} random trials):{' '}
                <b>{pct(report.closed_set_accuracy)}</b> picked correctly (chance: {pct(report.chance)}). With {report.taught} signs taught and the
                rule this app uses, {pct(report.app_rule.accept)} of real performances were accepted and {pct(report.app_rule.false_accept)} of
                other movements (rest poses, known words, untaught signs) were wrongly matched.
              </p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};

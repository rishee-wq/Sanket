import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Gauge, Play, Shuffle } from 'lucide-react';
import { CameraStage, type Stage } from '../../components/app/CameraStage';
import { GROUP_NAMES, type VocabEntry, vocab } from '../../data/vocabulary';
import type { SignEngine, Token } from '../../engine/engine';
import { useSnapshot } from '../../hooks/useLiveLoop';
import { type ExemplarSet, exemplarFrame, exemplarView, loadExemplars } from '../../lib/exemplars';
import { ON_PAPER, drawHands } from '../../lib/handDrawing';
import { summarize, useSignHistory } from '../../lib/signHistory';

interface Props {
  stage: Stage;
  engine: SignEngine | null;
  /** All labels the loaded models know, words first. */
  labels: string[];
  target: string;
  onTarget: (label: string) => void;
  /** The last sign the engine committed while this view was open. */
  attempt: Token | null;
}

const GROUP_ORDER: VocabEntry['group'][] = ['greeting', 'people', 'health', 'describe', 'time', 'place', 'letter', 'number'];

/** Loops one exemplar as a hand skeleton: how a real signer's hands move for this sign. */
const ExemplarPlayer: React.FC<{ label: string; slow: boolean }> = ({ label, slow }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [set, setSet] = useState<ExemplarSet | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    loadExemplars().then(setSet, () => setError(true));
  }, []);

  const item = set?.byLabel.get(label) ?? null;
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!set || !item || !canvas || !ctx) return;
    // Play the sign itself plus a few frames either side, then pause briefly and repeat.
    const from = Math.max(0, item.active[0] - 4);
    const to = Math.min(item.frames - 1, item.active[1] + 4);
    const view = exemplarView(set, item, canvas.width / canvas.height, from, to);
    const frameMs = (1000 / item.fps) * (slow ? 2.5 : 1);
    const cycle = (to - from + 1) * frameMs + 600;
    const start = performance.now();
    let raf = 0;
    const tick = () => {
      const t = (performance.now() - start) % cycle;
      const frame = Math.min(to, from + Math.floor(t / frameMs));
      drawHands(ctx, exemplarFrame(set, item, frame), false, false, ON_PAPER, view);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [set, item, slow]);

  return (
    <div className="dots relative aspect-[4/3] w-full overflow-hidden rounded-md border-2 border-ink bg-card">
      <canvas ref={canvasRef} width={800} height={600} className="absolute inset-0 h-full w-full" aria-label={`Hand movement for ${label}`} />
      {(error || (set && !item)) && (
        <p className="absolute inset-0 grid place-items-center p-6 text-center text-[15px] text-mute">
          {error ? 'The recordings could not be loaded.' : 'No recording for this sign.'}
        </p>
      )}
      <span className="chip absolute left-2.5 top-2.5 bg-card">Real signer · test recording</span>
    </div>
  );
};

/** Live match for the target: the model's current probability for it, and whether it was accepted. */
const MatchMeter: React.FC<{ stage: Stage; engine: SignEngine | null; target: string; matched: boolean; attempt: Token | null }> = ({
  stage,
  engine,
  target,
  matched,
  attempt,
}) => {
  const snap = useSnapshot(engine, stage.stats, 12);
  const isLetter = vocab(target).group === 'letter' || vocab(target).group === 'number';
  const pool = isLetter ? (snap?.letter.top ?? []) : (snap?.word.top ?? []);
  const score = matched ? 1 : (pool.find((c) => c.label === target)?.score ?? 0);
  const wrong = attempt && attempt.label !== target ? attempt : null;

  return (
    <div className={`rounded-md border-2 border-ink p-3 ${matched ? 'bg-go text-white' : 'bg-card'}`} aria-live="polite">
      <div className="flex items-center justify-between gap-3">
        <span className="tag">{matched ? 'Matched' : 'Match'}</span>
        <span className="num text-[13px]">{Math.round(score * 100)}%</span>
      </div>
      <div className="mt-2 h-4 border-2 border-ink bg-white">
        <div className={`h-full ${matched ? 'bg-ink' : 'bg-signal'}`} style={{ width: `${Math.round(score * 100)}%` }} />
      </div>
      <p className="mt-2 text-[15px] font-semibold">
        {matched ? (
          <span className="flex items-center gap-1.5">
            <Check className="h-5 w-5" /> The model read your sign as {vocab(target).text}.
          </span>
        ) : wrong ? (
          <>
            Read as <b className="uppercase">{vocab(wrong.label).text}</b> ({Math.round(wrong.confidence * 100)}%). Watch the recording and try again.
          </>
        ) : isLetter ? (
          'Copy the hand shape and hold it still.'
        ) : (
          'Copy the movement, then lower your hands.'
        )}
      </p>
    </div>
  );
};

export const LearnView: React.FC<Props> = ({ stage, engine, labels, target, onTarget, attempt }) => {
  const [slow, setSlow] = useState(false);
  const history = useSignHistory();
  const practised = useMemo(() => summarize(history).practised, [history]);
  const entry = vocab(target);
  const matched = attempt?.label === target;

  const groups = useMemo(() => {
    const map = new Map<VocabEntry['group'], string[]>();
    for (const label of labels) {
      const g = vocab(label).group;
      map.set(g, [...(map.get(g) ?? []), label]);
    }
    return GROUP_ORDER.filter((g) => map.has(g)).map((g) => ({ group: g, labels: map.get(g)! }));
  }, [labels]);

  const step = (delta: number) => {
    const i = labels.indexOf(target);
    onTarget(labels[(i + delta + labels.length) % labels.length]);
  };
  const random = () => {
    const pool = labels.filter((l) => !practised.has(l) && l !== target);
    const from = pool.length ? pool : labels;
    onTarget(from[Math.floor(Math.random() * from.length)]);
  };

  return (
    <div className="grid gap-[var(--pad)] xl:grid-cols-[minmax(240px,300px)_minmax(0,1fr)]">
      {/* Sign list */}
      <aside className="plate order-2 max-h-[72vh] overflow-y-auto xl:order-1" aria-label="Signs">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b-2 border-ink bg-card px-3 py-2">
          <span className="tag">
            {practised.size} / {labels.length} practised
          </span>
          <button className="btn btn-sm" onClick={random}>
            <Shuffle className="h-4 w-4" /> Surprise me
          </button>
        </div>
        {groups.map(({ group, labels: items }) => (
          <div key={group} className="border-b border-ink/15 px-3 py-2.5 last:border-0">
            <p className="tag mb-1.5 text-mute">{GROUP_NAMES[group]}</p>
            <div className="flex flex-wrap gap-1">
              {items.map((label) => (
                <button
                  key={label}
                  onClick={() => onTarget(label)}
                  aria-pressed={label === target}
                  className={`rounded border-[1.5px] border-ink px-2 py-1 text-[13.5px] font-semibold leading-tight ${
                    label === target ? 'bg-ink text-paper' : practised.has(label) ? 'bg-signal' : 'bg-white hover:bg-paper'
                  }`}
                >
                  {vocab(label).text}
                </button>
              ))}
            </div>
          </div>
        ))}
      </aside>

      <div className="order-1 min-w-0 xl:order-2">
        <div className="board flex flex-wrap items-end justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="tag">Sign this · {GROUP_NAMES[entry.group]}</p>
            <h1 className="display mt-1 break-words text-[clamp(48px,7vw,96px)]">{entry.text}</h1>
          </div>
          <div className="flex items-end gap-3">
            <p className="deva pb-1 text-[30px] font-bold leading-none">{entry.hindi}</p>
            <div className="flex gap-1.5">
              <button className="btn btn-icon" onClick={() => step(-1)} aria-label="Previous sign">
                <ArrowLeft className="h-5 w-5" />
              </button>
              <button className="btn btn-icon" onClick={() => step(1)} aria-label="Next sign">
                <ArrowRight className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <section aria-label="Watch">
            <div className="mb-1.5 flex items-center justify-between">
              <p className="tag text-mute">1 · Watch</p>
              <div className="flex gap-1.5">
                <button className={`btn btn-sm ${slow ? 'btn-ink' : ''}`} onClick={() => setSlow((s) => !s)} aria-pressed={slow}>
                  <Gauge className="h-4 w-4" /> Slow
                </button>
                <button className="btn btn-sm" onClick={() => stage.playDemo([target])} title="Feed this recording through the model">
                  <Play className="h-4 w-4" /> Test on model
                </button>
              </div>
            </div>
            <ExemplarPlayer label={target} slow={slow} />
            <p className="mt-2 text-[13px] leading-snug text-mute">
              Only the hands are shown, because hand landmarks are all the model sees. Word recordings come from the
              INCLUDE dataset (AI4Bharat, CC BY 4.0); check signs with an ISL teacher or the ISLRTC dictionary before
              relying on them.
            </p>
          </section>

          <section aria-label="Your turn">
            <p className="tag mb-1.5 text-mute">2 · Your turn</p>
            <CameraStage stage={stage} demo={[target]} demoLabel="Play the recording" />
            <div className="mt-2">
              <MatchMeter stage={stage} engine={engine} target={target} matched={matched} attempt={attempt} />
            </div>
            {matched && (
              <button className="btn btn-ink mt-2 w-full" onClick={() => step(1)} autoFocus>
                Next sign <ArrowRight className="h-5 w-5" />
              </button>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};

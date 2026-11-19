import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Check, ChevronDown, Lightbulb, Play, RotateCcw, Volume2 } from 'lucide-react';
import { CameraStage, type Stage } from '../../components/app/CameraStage';
import { LetterTeacher, WordTeacher, useTeachingData } from '../../components/learn/Teacher';
import { RULES, SENTENCES, type Sentence, UNITS, type Unit, sentenceKey } from '../../data/course';
import { vocab } from '../../data/vocabulary';
import type { SignEngine, Token } from '../../engine/engine';
import { useSnapshot } from '../../hooks/useLiveLoop';
import type { Clip } from '../../lib/clips';
import { recordSign, summarize, useSignHistory } from '../../lib/signHistory';
import { speechService } from '../../services/speechService';

interface Props {
  stage: Stage;
  engine: SignEngine | null;
  /** All labels the loaded models know (no background classes). */
  labels: string[];
  /** A sign label, or "sentence:<id>". */
  target: string;
  onTarget: (target: string) => void;
  /** The last sign the engine committed while this view was open. */
  attempt: Token | null;
  /** Opens My signs to record the learner's own version of a sign. */
  onTeach?: (label: string, kind: 'shape' | 'movement') => void;
}

const isSentence = (t: string) => t.startsWith('sentence:');
const sentenceOf = (t: string) => SENTENCES.find((s) => sentenceKey(s) === t) ?? null;

/** The items of a unit, in order: sign labels, or sentence keys. */
function unitItems(unit: Unit, labels: string[]): string[] {
  if (unit.kind === 'sentences') return SENTENCES.filter((s) => s.gloss.every((g) => labels.includes(g))).map(sentenceKey);
  return labels.filter((l) => unit.groups.includes(vocab(l).group));
}

// ---------------------------------------------------------------------------
// Course outline
// ---------------------------------------------------------------------------

const Outline: React.FC<{ labels: string[]; target: string; onTarget: (t: string) => void; done: Set<string> }> = ({
  labels,
  target,
  onTarget,
  done,
}) => {
  const current = UNITS.find((u) => unitItems(u, labels).includes(target))?.id;
  const [open, setOpen] = useState<string | undefined>(current);
  useEffect(() => setOpen(current), [current]);

  return (
    <nav className="plate overflow-hidden" aria-label="Course">
      <div className="border-b-2 border-ink px-3 py-2">
        <p className="tag">Course · words first, then sentences</p>
      </div>
      <ol>
        {UNITS.map((unit, n) => {
          const items = unitItems(unit, labels);
          if (!items.length) return null;
          const finished = items.filter((i) => done.has(i)).length;
          const expanded = open === unit.id;
          return (
            <li key={unit.id} className="border-b border-ink/20 last:border-0">
              <button
                onClick={() => setOpen(expanded ? undefined : unit.id)}
                aria-expanded={expanded}
                className={`flex w-full items-center gap-3 px-3 py-2.5 text-left ${expanded ? 'bg-signal' : 'hover:bg-paper'}`}
              >
                <span className={`num grid h-8 w-8 shrink-0 place-items-center rounded border-2 border-ink text-[13px] font-semibold ${finished === items.length ? 'bg-go text-white' : 'bg-white'}`}>
                  {finished === items.length ? <Check className="h-4 w-4" /> : n + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[16px] font-bold leading-tight">{unit.title}</span>
                  <span className="deva block text-[12.5px] font-semibold text-ink/60">{unit.hindi}</span>
                </span>
                <span className="num text-[12px]">
                  {finished}/{items.length}
                </span>
                <ChevronDown className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`} />
              </button>
              <div className="h-1 bg-ink/10">
                <div className="h-full bg-go" style={{ width: `${(finished / items.length) * 100}%` }} />
              </div>
              {expanded && (
                <div className="flex flex-wrap gap-1 px-3 py-2.5">
                  {items.map((item) => {
                    const text = isSentence(item) ? sentenceOf(item)!.english : vocab(item).text;
                    return (
                      <button
                        key={item}
                        onClick={() => onTarget(item)}
                        aria-current={item === target ? 'true' : undefined}
                        className={`flex items-center gap-1 rounded border-[1.5px] border-ink px-2 py-1 text-left text-[13.5px] font-semibold leading-tight ${
                          item === target ? 'bg-ink text-paper' : done.has(item) ? 'bg-signal' : 'bg-white hover:bg-paper'
                        } ${isSentence(item) ? 'w-full' : ''}`}
                      >
                        {done.has(item) && <Check className="h-3.5 w-3.5 shrink-0" />}
                        {text}
                      </button>
                    );
                  })}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
};

// ---------------------------------------------------------------------------
// Practice
// ---------------------------------------------------------------------------

const MatchMeter: React.FC<{ stage: Stage; engine: SignEngine | null; target: string; matched: boolean; attempt: Token | null }> = ({
  stage,
  engine,
  target,
  matched,
  attempt,
}) => {
  const snap = useSnapshot(engine, stage.stats, 12);
  const g = vocab(target).group;
  const isLetter = g === 'letter' || g === 'number';
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
            Read as <b className="uppercase">{vocab(wrong.label).text}</b> ({Math.round(wrong.confidence * 100)}%). Watch the key moments and try again.
          </>
        ) : isLetter ? (
          'Copy the hand shape and hold it still.'
        ) : (
          'Copy the movement, then lower your hands or pause.'
        )}
      </p>
    </div>
  );
};

const SignLesson: React.FC<Props & { clips: Record<string, Clip> | null; exemplars: ReturnType<typeof useTeachingData>['exemplars']; next: () => void }> = ({
  stage,
  engine,
  target,
  attempt,
  clips,
  exemplars,
  next,
  onTeach,
}) => {
  const entry = vocab(target);
  const letter = entry.group === 'letter' || entry.group === 'number';
  const clip = clips?.[target];
  const matched = attempt?.label === target;

  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <section aria-label="Watch">
        <p className="tag mb-1.5 text-mute">1 · Watch {letter ? 'the hand shape' : 'the signer'}</p>
        {letter ? (
          exemplars ? <LetterTeacher label={target} exemplars={exemplars} /> : <p className="tag text-mute">Loading…</p>
        ) : clip ? (
          <WordTeacher label={target} clip={clip} exemplars={exemplars} />
        ) : (
          <p className="tag text-mute">Loading…</p>
        )}
      </section>

      <section aria-label="Your turn">
        <p className="tag mb-1.5 text-mute">2 · Your turn</p>
        <CameraStage stage={stage} demo={[target]} demoLabel="Test the recording" />
        <div className="mt-2">
          <MatchMeter stage={stage} engine={engine} target={target} matched={matched} attempt={attempt} />
        </div>
        {matched && (
          <button className="btn btn-ink mt-2 w-full" onClick={next} autoFocus>
            Next <ArrowRight className="h-5 w-5" />
          </button>
        )}
        {!matched && onTeach && (
          <button
            className="mt-2 w-full rounded-md border-2 border-ink bg-card p-3 text-left text-[14px] leading-snug hover:bg-white"
            onClick={() => onTeach(target, letter ? 'shape' : 'movement')}
          >
            <span className="font-semibold">Not recognising you? Teach Sanket your way.</span>
            <span className="block text-mute">
              Record yourself signing “{entry.text}” 3 times. From then on Sanket compares your signing with your own
              recordings too, in your lighting, on your camera.
            </span>
          </button>
        )}
        <div className="mt-3 rounded-md border-2 border-dashed border-ink/40 p-3 text-[14px] leading-snug">
          <p className="flex items-center gap-1.5 font-semibold">
            <Lightbulb className="h-4 w-4" /> Tips
          </p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-mute">
            {letter ? (
              <>
                <li>Turn the hand to see the shape from the side.</li>
                <li>Keep your hand inside the camera, about an arm's length away.</li>
              </>
            ) : (
              <>
                <li>Turn on <b>Slow</b> and copy one key moment at a time.</li>
                <li>Start with your hands down, sign, then pause. The pause tells the model the sign has ended.</li>
              </>
            )}
            <li>Turn on <b>Mirror</b> to copy it like a reflection.</li>
          </ul>
        </div>
      </section>
    </div>
  );
};

/** Plays the clips of a sentence back to back, highlighting the word being shown. */
const SentencePlayer: React.FC<{ sentence: Sentence; clips: Record<string, Clip>; exemplars: ReturnType<typeof useTeachingData>['exemplars'] }> = ({
  sentence,
  clips,
  exemplars,
}) => {
  const [index, setIndex] = useState(0);
  const [run, setRun] = useState(0);
  useEffect(() => setIndex(0), [sentence]);
  const word = sentence.gloss[index];
  const clip = clips[word];
  if (!clip) return null;
  return (
    <WordTeacher
      key={`${sentence.id}-${run}-${index}`}
      label={word}
      clip={clip}
      exemplars={exemplars}
      loop={false}
      onEnded={() => (index < sentence.gloss.length - 1 ? setIndex(index + 1) : undefined)}
      caption={
        <div className="flex flex-wrap items-center gap-1">
          {sentence.gloss.map((g, i) => (
            <button
              key={`${g}-${i}`}
              onClick={() => setIndex(i)}
              className={`chip ${i === index ? 'border-signal bg-signal text-ink' : 'border-white/50 bg-night text-white'}`}
            >
              {i + 1} {vocab(g).text}
            </button>
          ))}
          <button
            className="chip ml-auto border-white/50 bg-night text-white"
            onClick={() => {
              setIndex(0);
              setRun((r) => r + 1);
            }}
          >
            <RotateCcw className="h-3 w-3" /> Again
          </button>
        </div>
      }
    />
  );
};

const SentenceLesson: React.FC<Props & { sentence: Sentence; clips: Record<string, Clip> | null; exemplars: ReturnType<typeof useTeachingData>['exemplars']; next: () => void }> = ({
  stage,
  sentence,
  attempt,
  clips,
  exemplars,
  next,
}) => {
  const [step, setStep] = useState(0);
  const [miss, setMiss] = useState<Token | null>(null);
  const done = step >= sentence.gloss.length;
  const rule = RULES[sentence.rule];

  useEffect(() => {
    setStep(0);
    setMiss(null);
  }, [sentence]);

  // Each committed sign either advances to the next word, repeats one already done (ignored), or misses.
  useEffect(() => {
    if (!attempt || done) return;
    if (attempt.label === sentence.gloss[step]) {
      setMiss(null);
      const nextStep = step + 1;
      setStep(nextStep);
      if (nextStep === sentence.gloss.length) {
        recordSign(sentenceKey(sentence), 'learn');
        speechService.speak(sentence.english, 'en-IN');
      }
    } else if (!sentence.gloss.slice(0, step).includes(attempt.label)) setMiss(attempt);
  }, [attempt]);

  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-[1fr_1.2fr]">
        <div className="plate p-3.5">
          <p className="tag text-mute">The rule</p>
          <h3 className="display mt-1 text-[30px]">{rule.title}</h3>
          <p className="mt-1.5 text-[15.5px] leading-snug">{rule.text}</p>
        </div>
        <div className="plate p-3.5">
          <p className="tag text-mute">English → ISL order</p>
          <p className="mt-1.5 text-[17px]">
            {sentence.english} <span className="deva text-mute">· {sentence.hindi}</span>
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {sentence.gloss.map((g, i) => (
              <React.Fragment key={`${g}-${i}`}>
                {i > 0 && <ArrowRight className="h-4 w-4 text-mute" />}
                <span className="display rounded border-2 border-ink bg-signal px-2 py-0.5 text-[24px]">{vocab(g).text}</span>
              </React.Fragment>
            ))}
          </div>
          <p className="mt-2 text-[12.5px] text-mute">
            Word order follows patterns described by ISL linguists; signers vary. Check with an ISL teacher.
          </p>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <section aria-label="Watch the sentence">
          <p className="tag mb-1.5 text-mute">1 · Watch it word by word</p>
          {clips ? <SentencePlayer sentence={sentence} clips={clips} exemplars={exemplars} /> : <p className="tag text-mute">Loading…</p>}
        </section>
        <section aria-label="Your turn">
          <p className="tag mb-1.5 text-mute">2 · Sign the whole sentence</p>
          <CameraStage stage={stage} demo={sentence.gloss} demoLabel="Test the recordings" />
          <div className={`mt-2 rounded-md border-2 border-ink p-3 ${done ? 'bg-go text-white' : 'bg-card'}`} aria-live="polite">
            <div className="flex flex-wrap gap-1.5">
              {sentence.gloss.map((g, i) => (
                <span
                  key={`${g}-${i}`}
                  className={`flex items-center gap-1 rounded border-2 border-ink px-2 py-1 text-[15px] font-bold uppercase ${
                    i < step ? 'bg-go text-white' : i === step ? 'bg-signal text-ink' : 'bg-white text-ink/50'
                  }`}
                >
                  {i < step && <Check className="h-4 w-4" />}
                  {vocab(g).text}
                </span>
              ))}
            </div>
            <p className="mt-2 text-[15px] font-semibold">
              {done ? (
                <span className="flex items-center gap-1.5">
                  <Volume2 className="h-5 w-5" /> “{sentence.english}” Sentence complete.
                </span>
              ) : miss ? (
                <>
                  Read as <b className="uppercase">{vocab(miss.label).text}</b>. Next is <b className="uppercase">{vocab(sentence.gloss[step]).text}</b>.
                </>
              ) : (
                <>
                  Now sign <b className="uppercase">{vocab(sentence.gloss[step]).text}</b>, then pause briefly.
                </>
              )}
            </p>
          </div>
          {done && (
            <div className="mt-2 flex gap-2">
              <button className="btn flex-1" onClick={() => setStep(0)}>
                <RotateCcw className="h-4 w-4" /> Again
              </button>
              <button className="btn btn-ink flex-1" onClick={next} autoFocus>
                Next sentence <ArrowRight className="h-5 w-5" />
              </button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------

export const LearnView: React.FC<Props> = (props) => {
  const { labels, target, onTarget } = props;
  const history = useSignHistory();
  const done = useMemo(() => summarize(history).practised, [history]);
  const { clips, exemplars, error } = useTeachingData();

  const order = useMemo(() => UNITS.flatMap((u) => unitItems(u, labels)), [labels]);
  const unit = UNITS.find((u) => unitItems(u, labels).includes(target));
  const sentence = sentenceOf(target);
  const entry = vocab(target);
  const total = order.length;
  const next = () => onTarget(order[(order.indexOf(target) + 1) % total]);

  return (
    <div className="grid gap-[var(--pad)] xl:grid-cols-[minmax(250px,310px)_minmax(0,1fr)]">
      <aside className="order-2 xl:order-1">
        <div className="xl:sticky xl:top-[76px]">
          <Outline labels={labels} target={target} onTarget={onTarget} done={done} />
          <p className="tag mt-2 text-mute">
            {order.filter((i) => done.has(i)).length} of {total} done · progress stays on this device
          </p>
        </div>
      </aside>

      <div className="order-1 min-w-0 space-y-3 xl:order-2">
        <div className="board flex flex-wrap items-end justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="tag">
              {unit ? `Unit ${UNITS.indexOf(unit) + 1} · ${unit.title}` : 'Learn'}
              {done.has(target) && ' · done'}
            </p>
            <h1 className="display mt-1 break-words text-[clamp(40px,6.5vw,92px)]">{sentence ? sentence.english : entry.text}</h1>
          </div>
          <div className="flex items-end gap-3">
            {!sentence && <p className="deva pb-1 text-[30px] font-bold leading-none">{entry.hindi}</p>}
            <button className="btn btn-ink" onClick={next}>
              Skip <ArrowRight className="h-5 w-5" />
            </button>
          </div>
        </div>

        {error && <p role="alert" className="plate p-3 text-[15px]">The teaching recordings could not be loaded.</p>}

        {sentence ? (
          <SentenceLesson {...props} sentence={sentence} clips={clips} exemplars={exemplars} next={next} />
        ) : (
          <SignLesson {...props} clips={clips} exemplars={exemplars} next={next} />
        )}

        <p className="text-[12.5px] leading-snug text-mute">
          Word videos: INCLUDE dataset, AI4Bharat, IIT Madras (CC BY 4.0), cropped and trimmed. Hand shapes for letters are drawn from
          recorded landmarks. Check signs with an ISL teacher or the ISLRTC dictionary before relying on them.{' '}
          <button className="link" onClick={() => props.stage.playDemo(sentence ? sentence.gloss : [target])}>
            <Play className="inline h-3.5 w-3.5" /> Feed the recording through the model
          </button>
        </p>
      </div>
    </div>
  );
};

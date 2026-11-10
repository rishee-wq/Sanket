import React, { useEffect, useRef } from 'react';
import { CornerDownLeft, Delete, Eraser, Mic, MicOff, Space, Trash2, Volume2 } from 'lucide-react';
import { CameraStage, type Stage } from '../../components/app/CameraStage';
import { QUICK_PHRASES } from '../../data/quickPhrases';
import { vocab } from '../../data/vocabulary';
import type { Candidate, EngineMode, SignEngine, Token } from '../../engine/engine';
import type { Conversation } from '../../hooks/useConversation';
import { spellingTail } from '../../hooks/useConversation';
import { useSnapshot } from '../../hooks/useLiveLoop';

const MODES: { mode: EngineMode; label: string; hint: string }[] = [
  { mode: 'auto', label: 'Auto', hint: 'Words while moving, letters while still' },
  { mode: 'words', label: 'Words', hint: '70 word signs' },
  { mode: 'letters', label: 'Letters', hint: 'A-Z and 1-9, for spelling' },
];

/** A short mixed demo: a greeting, a few words, then a fingerspelled word. */
export const DEMO_SCRIPT = ['hello', 'i', 'sick', 'doctor', 'thank you', 'H', 'E', 'L', 'P'];

interface Props {
  stage: Stage;
  engine: SignEngine | null;
  mode: EngineMode;
  onMode: (m: EngineMode) => void;
  convo: Conversation;
  recent: Token[];
  sosArmed: boolean;
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

const Bars: React.FC<{ items: Candidate[] }> = ({ items }) => (
  <ul className="space-y-1.5">
    {[0, 1, 2].map((i) => {
      const c = items[i];
      return (
        <li key={i} className="grid grid-cols-[minmax(0,7.5rem)_1fr_3rem] items-center gap-2 text-[13px]">
          <span className="truncate font-semibold uppercase">{c ? vocab(c.label).text : '·'}</span>
          <span className="h-2.5 border-[1.5px] border-ink bg-card">
            <span className="block h-full bg-ink" style={{ width: c ? pct(c.score) : 0 }} />
          </span>
          <span className="num text-right text-[12px]">{c ? pct(c.score) : ''}</span>
        </li>
      );
    })}
  </ul>
);

/**
 * The station board: what the models are reading right now. It samples the
 * engine a few times a second on its own, so nothing else re-renders.
 */
const NowReading: React.FC<{ stage: Stage; engine: SignEngine | null; last: Token | null; mode: EngineMode }> = ({
  stage,
  engine,
  last,
  mode,
}) => {
  const snap = useSnapshot(engine, stage.stats, 15);
  const running = stage.camera.isActive || stage.replay !== null;

  let label: string | null = null;
  let progress = 0;
  let status = running ? 'Show a sign' : 'Camera is off';
  let items: Candidate[] = [];
  if (snap && running) {
    if (snap.word.label) {
      label = snap.word.label;
      progress = snap.word.score;
      status = 'Reading a word';
      items = snap.word.top;
    } else if (snap.letter.label) {
      label = snap.letter.label;
      progress = snap.letter.progress;
      status = snap.letter.progress >= 1 ? 'Got it. Change the sign for the next one' : 'Hold still';
      items = snap.letter.top;
    } else if (snap.hands > 0) {
      status = mode === 'letters' ? 'Hold a letter still' : snap.speed > 1.6 ? 'Watching the movement' : 'Hands in view';
      items = snap.letter.top.length && mode !== 'words' ? snap.letter.top : snap.word.top;
    } else status = 'No hands in view';
  }
  const shown = label ?? (last && running ? last.label : null);
  const entry = shown ? vocab(shown) : null;

  return (
    <section className="board overflow-hidden" aria-label="Now reading">
      <div className="flex items-center justify-between gap-2 border-b-2 border-ink px-3.5 py-2">
        <span className="tag">Now reading</span>
        <span className="tag" aria-live="polite">
          {status}
        </span>
      </div>
      <div className="px-3.5 pb-3.5 pt-3">
        <div className="flex min-h-[92px] items-end justify-between gap-3">
          <p className={`display min-w-0 break-words text-[clamp(44px,6.4vw,84px)] ${label ? '' : 'opacity-35'}`}>
            {entry ? entry.text : '— —'}
          </p>
          {entry?.hindi && <p className={`deva shrink-0 pb-1 text-[26px] font-bold leading-none ${label ? '' : 'opacity-35'}`}>{entry.hindi}</p>}
        </div>
        <div className="mt-2.5 h-3 border-2 border-ink bg-card" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Confidence">
          <div className={`h-full ${progress >= 1 ? 'bg-go' : 'bg-ink'}`} style={{ width: pct(Math.min(1, progress)) }} />
        </div>
        <div className="mt-3">
          <Bars items={items} />
        </div>
      </div>
    </section>
  );
};

const ModeSwitch: React.FC<{ mode: EngineMode; onMode: (m: EngineMode) => void; engine: SignEngine | null }> = ({
  mode,
  onMode,
  engine,
}) => (
  <div className="flex items-stretch overflow-hidden rounded-md border-2 border-ink" role="radiogroup" aria-label="What to read">
    {MODES.map(({ mode: m, label, hint }, i) => {
      const missing = (m === 'words' && engine && !engine.wordsActive && mode !== 'letters') || false;
      return (
        <button
          key={m}
          role="radio"
          aria-checked={mode === m}
          title={hint}
          disabled={missing}
          onClick={() => onMode(m)}
          className={`flex-1 px-3 py-2 text-left ${i ? 'border-l-2 border-ink' : ''} ${mode === m ? 'bg-ink text-paper' : 'bg-card hover:bg-white'}`}
        >
          <span className="flex items-center justify-between gap-2">
            <span className="text-[15px] font-bold">{label}</span>
            <span className={`num text-[11px] ${mode === m ? 'text-signal' : 'text-mute'}`}>{i + 1}</span>
          </span>
          <span className={`mt-0.5 hidden text-[12px] leading-tight sm:block ${mode === m ? 'text-paper/70' : 'text-mute'}`}>{hint}</span>
        </button>
      );
    })}
  </div>
);

/** The sentence being built, with the keys that edit it. */
const Sentence: React.FC<{ convo: Conversation }> = ({ convo }) => {
  const { draft, suggestions } = convo;
  const tail = spellingTail(draft);
  const words = draft.split(' ');

  return (
    <section className="plate" aria-label="Your sentence">
      <div className="flex items-center justify-between border-b-2 border-ink px-3.5 py-2">
        <span className="tag">Your sentence</span>
        <span className="tag text-mute">{tail ? `Spelling ${tail.length} letter${tail.length === 1 ? '' : 's'}` : `${draft.trim() ? draft.trim().split(/\s+/).length : 0} words`}</span>
      </div>

      <div className="min-h-[76px] px-3.5 py-3 text-[26px] font-semibold leading-snug" aria-live="polite">
        {draft ? (
          words.map((w, i) => (
            <React.Fragment key={`${i}-${w}`}>
              {i > 0 && ' '}
              <span className={`flap inline-block ${i === words.length - 1 && tail ? 'border-b-[3px] border-signal-deep tracking-[.08em]' : ''}`}>{w}</span>
            </React.Fragment>
          ))
        ) : (
          <span className="text-[19px] font-normal text-mute">Signs you make appear here. Press Speak to say them aloud.</span>
        )}
        <span className="caret ml-0.5 inline-block h-[1em] w-[3px] translate-y-[3px] bg-ink" aria-hidden="true" />
      </div>

      <div className="flex min-h-[46px] flex-wrap items-center gap-1.5 border-t-2 border-dashed border-ink/35 px-3.5 py-2">
        <span className="tag mr-1 text-mute">{tail ? 'Did you mean' : 'Next'}</span>
        {suggestions.length === 0 && <span className="text-[13px] text-mute">No suggestions yet</span>}
        {suggestions.map((s) => (
          <button key={`${s.kind}-${s.text}`} className="btn btn-sm" onClick={() => convo.applySuggestion(s)}>
            {s.text}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2 border-t-2 border-ink p-2.5">
        <button className="btn btn-ink" onClick={convo.speakDraft} disabled={!draft.trim()}>
          <Volume2 className="h-[18px] w-[18px]" /> {convo.speaking ? 'Speaking…' : 'Speak'}
          <CornerDownLeft className="hidden h-4 w-4 opacity-60 sm:block" />
        </button>
        <button className="btn btn-icon" onClick={convo.space} aria-label="Add a space" title="Space">
          <Space className="h-5 w-5" />
        </button>
        <button className="btn btn-icon" onClick={convo.undo} disabled={!draft} aria-label="Undo the last sign" title="Backspace">
          <Delete className="h-5 w-5" />
        </button>
        <button className="btn btn-icon" onClick={convo.clearDraft} disabled={!draft} aria-label="Clear the sentence" title="Escape">
          <Eraser className="h-5 w-5" />
        </button>
      </div>
    </section>
  );
};

/** Both sides of the conversation: spoken sentences from the signer, captions of the hearing person's speech. */
const Thread: React.FC<{ convo: Conversation }> = ({ convo }) => {
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'nearest' });
  }, [convo.messages.length, convo.interim]);

  return (
    <section className="plate flex min-h-0 flex-col" aria-label="Conversation">
      <div className="flex items-center justify-between gap-2 border-b-2 border-ink px-3.5 py-2">
        <span className="tag">Conversation</span>
        <div className="flex items-center gap-1.5">
          {convo.messages.length > 0 && (
            <button className="btn btn-bare btn-sm" onClick={convo.clearThread} aria-label="Clear the conversation">
              <Trash2 className="h-4 w-4" />
            </button>
          )}
          <button
            className={`btn btn-sm ${convo.listening ? 'btn-signal' : ''}`}
            onClick={convo.toggleListening}
            disabled={!convo.sttSupported}
            title={convo.sttSupported ? 'Caption what the other person says' : 'Speech recognition needs Chrome or Edge'}
          >
            {convo.listening ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
            {convo.listening ? 'Listening' : 'Caption speech'}
          </button>
        </div>
      </div>
      <div className="max-h-[260px] min-h-[120px] flex-1 space-y-2 overflow-y-auto p-3.5">
        {convo.messages.length === 0 && !convo.interim && (
          <p className="text-[15px] text-mute">
            Spoken sentences line up here. Turn on <b>Caption speech</b> and the other person's words appear as text.
          </p>
        )}
        {convo.messages.map((m) => (
          <div key={m.id} className={`flex ${m.who === 'me' ? 'justify-end' : 'justify-start'}`}>
            <p className={`max-w-[88%] rounded-md border-2 border-ink px-3 py-1.5 text-[18px] font-medium leading-snug ${m.who === 'me' ? 'bg-signal' : 'bg-white'}`}>
              <span className="tag mr-2 align-middle text-ink/55">{m.who === 'me' ? 'Signed' : 'Heard'}</span>
              {m.text}
            </p>
          </div>
        ))}
        {convo.interim && <p className="max-w-[88%] rounded-md border-2 border-dashed border-ink/50 px-3 py-1.5 text-[18px] text-mute">{convo.interim}</p>}
        {convo.micError && <p role="alert" className="text-sm font-semibold text-alarm">{convo.micError}</p>}
        <div ref={end} />
      </div>
    </section>
  );
};

export const TranslateView: React.FC<Props> = ({ stage, engine, mode, onMode, convo, recent, sosArmed }) => {
  // Keyboard: Enter speaks, Space/Backspace/Escape edit, 1-3 switch mode. Ignored while typing in a field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'BUTTON' || el.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'Enter') convo.speakDraft();
      else if (e.key === ' ') convo.space();
      else if (e.key === 'Backspace') convo.undo();
      else if (e.key === 'Escape') convo.clearDraft();
      else if (e.key === '1') onMode('auto');
      else if (e.key === '2') onMode('words');
      else if (e.key === '3') onMode('letters');
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [convo.speakDraft, convo.space, convo.undo, convo.clearDraft, onMode]);

  return (
    <div className="grid gap-[var(--pad)] lg:grid-cols-[minmax(0,1.18fr)_minmax(0,1fr)]">
      <div className="space-y-3">
        <CameraStage stage={stage} demo={DEMO_SCRIPT} />

        {sosArmed && (
          <div role="alert" className="hazard hazard-live rounded-md border-2 border-ink p-[3px]">
            <p className="bg-signal px-3 py-2 text-[15px] font-bold">Signal for Help seen. Close your fingers over your thumb to open SOS.</p>
          </div>
        )}

        <ModeSwitch mode={mode} onMode={onMode} engine={engine} />

        <div className="flex min-h-[34px] items-center gap-1.5 overflow-x-auto no-scrollbar" aria-label="Recently recognised">
          <span className="tag shrink-0 text-mute">Recognised</span>
          {recent.length === 0 && <span className="text-[13px] text-mute">Nothing yet</span>}
          {recent.map((t, i) => (
            <span key={`${t.time}-${i}`} className={`chip shrink-0 ${i === 0 ? 'flap bg-ink text-paper' : 'bg-card'}`} title={`${Math.round(t.latencyMs)} ms after the sign ended`}>
              {vocab(t.label).text} <span className="opacity-60">{pct(t.confidence)}</span>
            </span>
          ))}
        </div>
      </div>

      <div className="flex min-w-0 flex-col gap-3">
        <NowReading stage={stage} engine={engine} last={convo.lastToken} mode={mode} />
        <Sentence convo={convo} />
        <Thread convo={convo} />
        <section aria-label="Quick phrases">
          <p className="tag mb-1.5 text-mute">Say it now</p>
          <div className="flex flex-wrap gap-1.5">
            {QUICK_PHRASES.map((p) => (
              <button key={p.id} className="btn btn-sm h-auto flex-col items-start gap-0 py-1.5 text-left" onClick={() => convo.sayPhrase(p.speak)}>
                <span>{p.label}</span>
                <span className="deva text-[12px] font-medium text-mute">{p.hindi}</span>
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
};

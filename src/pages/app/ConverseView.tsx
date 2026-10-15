import React, { useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowUp, Delete, Eraser, Mic, MicOff, Space } from 'lucide-react';
import { CameraStage } from '../../components/app/CameraStage';
import { QUICK_PHRASES } from '../../data/quickPhrases';
import type { Conversation } from '../../hooks/useConversation';
import type { Prediction, Predictor } from '../../lib/predictor';

interface Props {
  predictor: Predictor | null;
  convo: Conversation;
  onSignAccepted: (p: Prediction) => void;
}

const EASE = [0.22, 0.61, 0.36, 1] as const;
const time = (ts: number) => new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

/** Listening indicator: five bars like the five rays of the mark. */
const VoiceBars: React.FC = () => (
  <span className="flex h-4 items-center gap-[3px]" aria-hidden="true">
    {[0, 1, 2, 3, 4].map((i) => (
      <motion.span
        key={i}
        className="w-[3px] rounded-full bg-current"
        animate={{ height: ['30%', '100%', '45%', '80%', '30%'] }}
        transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.12, ease: 'easeInOut' }}
      />
    ))}
  </span>
);

export const ConverseView: React.FC<Props> = ({ predictor, convo, onSignAccepted }) => {
  const threadRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: 'smooth' });
  }, [convo.messages.length, convo.interim]);

  // Enter speaks the draft; keyboard users can drive the whole composer.
  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      convo.speakDraft();
    }
  };

  return (
    <div className="mx-auto grid max-w-[1440px] gap-5 px-5 pt-4 sm:px-8 lg:h-[calc(100dvh-72px-40px)] lg:grid-cols-[minmax(0,1.45fr)_minmax(380px,1fr)]">
      {/* Left: camera and phrases */}
      <div className="flex min-h-0 min-w-0 flex-col gap-4">
        <CameraStage predictor={predictor} onSignAccepted={onSignAccepted} className="aspect-[4/5] sm:aspect-[4/3] lg:aspect-auto lg:min-h-0 lg:flex-1" />
        <div className="thin-scroll -mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="toolbar" aria-label="Quick phrases">
          {QUICK_PHRASES.map((p) => (
            <button
              key={p.id}
              onClick={() => convo.sayPhrase(p.label)}
              className="group shrink-0 rounded-2xl border border-white/[.08] bg-white/[.02] px-4 py-2.5 text-left transition-colors hover:border-saffron/40 hover:bg-saffron/[.06]"
            >
              <span className="block text-sm font-medium text-white/90">{p.label}</span>
              <span className="block font-deva text-xs text-white/40 group-hover:text-white/60">{p.hindi.split(' (')[0]}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Right: the conversation */}
      <section className="surface flex min-h-[560px] min-w-0 flex-col overflow-hidden rounded-[28px]" aria-label="Conversation">
        <header className="flex items-center justify-between px-6 pb-3 pt-5">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[.24em] text-saffron">Conversation</p>
            <p className="mt-1 text-xs text-white/40">Your signs on the right · their words on the left</p>
          </div>
          {convo.messages.length > 0 && (
            <button onClick={convo.clearThread} className="text-xs text-white/40 hover:text-white">
              Clear
            </button>
          )}
        </header>

        <div ref={threadRef} className="thin-scroll flex-1 space-y-3 overflow-y-auto px-6 py-3">
          {convo.messages.length === 0 && !convo.interim && (
            <div className="grid h-full place-items-center py-10 text-center">
              <div>
                <p className="font-serif text-[34px] leading-tight text-white/90">
                  Start with a <em className="text-glow">sign.</em>
                </p>
                <p className="mx-auto mt-3 max-w-xs text-sm text-white/45">
                  Signs build a sentence below. Press speak and Sanket says it aloud. Tap listen to see the reply as captions.
                </p>
              </div>
            </div>
          )}
          <AnimatePresence initial={false}>
            {convo.messages.map((m) => (
              <motion.div
                key={m.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, ease: EASE }}
                className={`flex ${m.who === 'me' ? 'justify-end' : 'justify-start'}`}
              >
                <div className={`max-w-[85%] ${m.who === 'me' ? 'text-right' : ''}`}>
                  <div
                    className={
                      m.who === 'me'
                        ? 'rounded-[22px] rounded-br-md bg-gradient-to-br from-saffron to-saffron-deep px-4 py-2.5 text-[17px] font-medium text-[#1a0d02]'
                        : 'rounded-[22px] rounded-bl-md border border-white/10 bg-white/[.04] px-4 py-3 text-[22px] leading-snug text-white'
                    }
                  >
                    {m.text}
                  </div>
                  <p className="mt-1 px-1 text-[10px] text-white/30">
                    {m.who === 'me' ? 'Signed' : 'Heard'} · {time(m.ts)}
                  </p>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
          {convo.interim && (
            <div className="flex justify-start">
              <div className="max-w-[85%] rounded-[22px] rounded-bl-md border border-dashed border-white/15 px-4 py-3 text-[22px] leading-snug text-white/55">
                {convo.interim}
              </div>
            </div>
          )}
        </div>

        {/* Composer */}
        <div className="border-t border-white/[.06] p-4">
          <div className="rounded-[22px] border border-white/[.08] bg-black/40 p-3 focus-within:border-saffron/50">
            <div className="flex h-6 items-center px-2">
              <AnimatePresence>
                {convo.lastAdded && (
                  <motion.span
                    key={convo.lastAdded + convo.draft.length}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="rounded-full bg-saffron/15 px-2.5 py-0.5 text-[11px] font-medium text-saffron"
                  >
                    + {convo.lastAdded}
                  </motion.span>
                )}
              </AnimatePresence>
            </div>
            <label className="sr-only" htmlFor="draft">
              Sentence to speak
            </label>
            <textarea
              id="draft"
              value={convo.draft}
              onChange={(e) => convo.setDraft(e.target.value)}
              onKeyDown={onKeyDown}
              rows={2}
              placeholder="Sign, or type, to build a sentence"
              className="w-full resize-none bg-transparent px-2 py-1 text-[24px] font-medium leading-snug text-white placeholder:text-[18px] placeholder:font-normal placeholder:text-white/25 focus:outline-none"
            />
            <div className="mt-2 flex items-center gap-1.5">
              <button onClick={convo.space} title="Space" aria-label="Add a space" className="grid h-9 w-9 place-items-center rounded-full text-white/50 hover:bg-white/[.06] hover:text-white">
                <Space className="h-4 w-4" />
              </button>
              <button onClick={convo.undo} title="Undo last word" aria-label="Undo last word" className="grid h-9 w-9 place-items-center rounded-full text-white/50 hover:bg-white/[.06] hover:text-white">
                <Delete className="h-4 w-4" />
              </button>
              <button onClick={convo.clearDraft} title="Clear" aria-label="Clear the sentence" className="grid h-9 w-9 place-items-center rounded-full text-white/50 hover:bg-white/[.06] hover:text-white">
                <Eraser className="h-4 w-4" />
              </button>

              <div className="ml-auto flex items-center gap-2">
                {convo.sttSupported && (
                  <button
                    onClick={convo.toggleListening}
                    aria-pressed={convo.listening}
                    className={`flex h-10 items-center gap-2 rounded-full px-4 text-sm font-medium transition-colors ${
                      convo.listening ? 'bg-periwinkle text-black' : 'border border-white/12 text-white/80 hover:border-white/30'
                    }`}
                  >
                    {convo.listening ? <VoiceBars /> : <Mic className="h-4 w-4" />}
                    {convo.listening ? 'Listening' : 'Listen'}
                  </button>
                )}
                <button
                  onClick={convo.speakDraft}
                  disabled={!convo.draft.trim()}
                  className="flex h-10 items-center gap-2 rounded-full bg-white py-1 pl-4 pr-1 text-sm font-semibold text-black transition-opacity disabled:opacity-30"
                >
                  {convo.speaking ? 'Speaking' : 'Speak'}
                  <span className="grid h-8 w-8 place-items-center rounded-full bg-saffron-deep">
                    <ArrowUp className="h-4 w-4 text-white" />
                  </span>
                </button>
              </div>
            </div>
          </div>
          {convo.micError && (
            <p className="mt-2 flex items-center gap-1.5 px-2 text-xs text-rose-300">
              <MicOff className="h-3.5 w-3.5" /> {convo.micError}
            </p>
          )}
        </div>
      </section>
    </div>
  );
};

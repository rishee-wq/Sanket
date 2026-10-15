import React, { Suspense, lazy, useCallback, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, ArrowRight, Check, Info } from 'lucide-react';
import { CameraStage } from '../../components/app/CameraStage';
import { LEARN_LESSONS } from '../../data/learnLessons';
import { SIGN_ANIMATIONS } from '../../data/signAnimations';
import type { LiveState } from '../../hooks/useRecognition';
import type { Prediction, Predictor } from '../../lib/predictor';
import { recordSign, summarize, useSignHistory } from '../../lib/signHistory';

const TutorStage = lazy(() => import('../../components/app/TutorStage'));
const EASE = [0.22, 0.61, 0.36, 1] as const;

interface Props {
  predictor: Predictor | null;
  target: string;
  onTarget: (label: string) => void;
}

/** Match ring: the predictor's probability for the target sign. */
const ScoreRing: React.FC<{ score: number; matched: boolean }> = ({ score, matched }) => {
  const R = 52;
  const C = 2 * Math.PI * R;
  return (
    <div className="relative grid h-[132px] w-[132px] place-items-center">
      <svg viewBox="0 0 120 120" className="absolute inset-0 -rotate-90" aria-hidden="true">
        <circle cx="60" cy="60" r={R} fill="none" stroke="rgba(255,255,255,.07)" strokeWidth="6" />
        <circle
          cx="60"
          cy="60"
          r={R}
          fill="none"
          stroke={matched ? '#ffffff' : score >= 80 ? '#ff9a3c' : 'rgba(255,154,60,.55)'}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={C * (1 - score / 100)}
          style={{ transition: 'stroke-dashoffset .2s ease, stroke .3s' }}
        />
      </svg>
      <div className="text-center">
        <p className="font-mono text-3xl text-white">{score}</p>
        <p className="text-[10px] uppercase tracking-[.2em] text-white/40">match</p>
      </div>
    </div>
  );
};

export const LearnView: React.FC<Props> = ({ predictor, target, onTarget }) => {
  const events = useSignHistory();
  const practised = useMemo(() => summarize(events).practised, [events]);
  const idx = Math.max(0, LEARN_LESSONS.findIndex((l) => l.label === target));
  const lesson = LEARN_LESSONS[idx];
  const [score, setScore] = useState(0);
  const [matched, setMatched] = useState(false);
  const [step, setStep] = useState({ index: 0, captions: [] as string[] });

  const go = (d: number) => {
    const next = LEARN_LESSONS[(idx + d + LEARN_LESSONS.length) % LEARN_LESSONS.length];
    setMatched(false);
    setScore(0);
    onTarget(next.label);
  };

  const onLive = useCallback(
    (l: LiveState) => {
      const p = l.prediction;
      const i = p ? predictor?.labels.indexOf(target) ?? -1 : -1;
      setScore(p && i >= 0 ? Math.round(p.probabilities[i] * 100) : 0);
    },
    [predictor, target]
  );

  const onAccepted = useCallback(
    (p: Prediction) => {
      if (p.label !== target) return;
      setMatched(true);
      recordSign(p.label, 'learn');
    },
    [target]
  );

  const onStep = useCallback((index: number, captions: string[]) => setStep({ index, captions }), []);
  const reviewed = SIGN_ANIMATIONS[lesson.label]?.reviewed;

  return (
    <div className="mx-auto max-w-[1440px] px-5 pt-4 sm:px-8">
      {/* Lesson rail */}
      <div className="thin-scroll -mx-1 mb-6 flex gap-2 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Lessons">
        {LEARN_LESSONS.map((l, i) => {
          const active = l.label === lesson.label;
          const done = practised.has(l.label);
          return (
            <button
              key={l.id}
              role="tab"
              aria-selected={active}
              onClick={() => {
                setMatched(false);
                onTarget(l.label);
              }}
              className={`flex shrink-0 items-center gap-2.5 rounded-full border py-1.5 pl-1.5 pr-4 text-sm transition-colors ${
                active ? 'border-white bg-white text-black' : 'border-white/10 text-white/65 hover:border-white/25 hover:text-white'
              }`}
            >
              <span
                className={`grid h-7 w-7 place-items-center rounded-full font-mono text-[11px] ${
                  done ? 'bg-saffron text-black' : active ? 'bg-black/10' : 'bg-white/[.06]'
                }`}
              >
                {done ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : i + 1}
              </span>
              {l.label}
            </button>
          );
        })}
      </div>

      {/* Lesson header */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <AnimatePresence mode="wait">
          <motion.div
            key={lesson.label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.35, ease: EASE }}
          >
            <p className="text-[10px] font-semibold uppercase tracking-[.24em] text-saffron">
              Lesson {idx + 1} of {LEARN_LESSONS.length} · {lesson.category}
            </p>
            <h1 className="mt-2 font-serif text-6xl leading-none sm:text-7xl">{lesson.label}</h1>
            <p className="mt-3 max-w-xl text-[15px] text-white/55">{lesson.description}</p>
          </motion.div>
        </AnimatePresence>
        <div className="flex gap-2">
          <button onClick={() => go(-1)} aria-label="Previous lesson" className="surface-glass grid h-11 w-11 place-items-center rounded-full text-white/70 hover:text-white">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <button onClick={() => go(1)} className="flex h-11 items-center gap-2 rounded-full bg-white pl-5 pr-1.5 text-sm font-semibold text-black">
            Next sign
            <span className="grid h-8 w-8 place-items-center rounded-full bg-saffron-deep">
              <ArrowRight className="h-4 w-4 text-white" />
            </span>
          </button>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Watch */}
        <div className="flex min-w-0 flex-col gap-4">
          <p className="text-[10px] font-semibold uppercase tracking-[.24em] text-white/40">01 · Watch</p>
          <Suspense fallback={<div className="surface aspect-[4/3] animate-pulse rounded-[28px]" />}>
            <TutorStage key={lesson.label} label={lesson.label} onStep={onStep} className="aspect-[4/3]" />
          </Suspense>
          <ol className="space-y-2" aria-live="polite">
            {step.captions.map((c, i) => (
              <li key={c} className={`flex gap-3 text-[15px] transition-colors ${i === step.index ? 'text-white' : 'text-white/35'}`}>
                <span
                  className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full font-mono text-[11px] transition-colors ${
                    i === step.index ? 'bg-saffron text-black' : i < step.index ? 'bg-white/15 text-white/70' : 'border border-white/15'
                  }`}
                >
                  {i + 1}
                </span>
                {c}
              </li>
            ))}
          </ol>
        </div>

        {/* Your turn */}
        <div className="flex min-w-0 flex-col gap-4">
          <p className="text-[10px] font-semibold uppercase tracking-[.24em] text-white/40">02 · Your turn</p>
          <div className="relative">
            <CameraStage predictor={predictor} onSignAccepted={onAccepted} onLive={onLive} hud="minimal" className="aspect-[4/5] sm:aspect-[4/3]" />
            <div className="surface-glass absolute bottom-4 right-4 rounded-full p-1.5">
              <ScoreRing score={matched ? 100 : score} matched={matched} />
            </div>
          </div>
          <AnimatePresence mode="wait">
            {matched ? (
              <motion.div
                key="matched"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="surface flex items-center justify-between gap-4 rounded-[22px] p-5"
              >
                <div>
                  <p className="font-serif text-3xl">
                    That’s <em className="text-glow">{lesson.label}.</em>
                  </p>
                  <p className="text-sm text-white/50">Saved to your learning path.</p>
                </div>
                <button onClick={() => go(1)} className="rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-black">
                  Next sign
                </button>
              </motion.div>
            ) : (
              <motion.div key="tip" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="surface rounded-[22px] p-5">
                <p className="text-sm text-white/80">{lesson.instruction}</p>
                <p className="mt-1.5 text-sm text-white/45">Tip: {lesson.tips}</p>
              </motion.div>
            )}
          </AnimatePresence>
          {!reviewed && (
            <p className="flex gap-2 text-xs leading-relaxed text-white/35">
              <Info className="mt-px h-3.5 w-3.5 shrink-0" />
              The 3D guide shows the hand shape Sanket's demo recognises. It hasn't been reviewed by an ISL signer yet; check
              the ISLRTC dictionary for the full sign.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

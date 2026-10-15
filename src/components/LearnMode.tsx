import React, { Suspense, lazy, useState } from 'react';
import { LEARN_LESSONS } from '../data/learnLessons';
import { LearnLesson } from '../types/isl';
import {
  Trophy,
  ChevronRight,
  ChevronLeft,
  Sparkles,
  CheckCircle2,
  HelpCircle,
  Lightbulb,
} from 'lucide-react';
import { soundEffects } from '../services/soundEffects';

const SignTutor = lazy(() => import('./SignTutor'));

interface LearnModeProps {
  /** Label of the lesson being practised. */
  targetLabel: string;
  currentMatchScore: number;
  lastRecognizedSign?: string | null;
  onSelectTargetSign: (signLabel: string) => void;
}

export const LearnMode: React.FC<LearnModeProps> = ({
  targetLabel,
  currentMatchScore,
  lastRecognizedSign,
  onSelectTargetSign,
}) => {
  const selectedIdx = Math.max(0, LEARN_LESSONS.findIndex((l) => l.label === targetLabel));
  const [completedSigns, setCompletedSigns] = useState<string[]>([]);

  const currentLesson: LearnLesson = LEARN_LESSONS[selectedIdx] || LEARN_LESSONS[0];

  const handleNext = () => {
    const nextIdx = (selectedIdx + 1) % LEARN_LESSONS.length;
    onSelectTargetSign(LEARN_LESSONS[nextIdx].label);
  };

  const handlePrev = () => {
    const prevIdx = (selectedIdx - 1 + LEARN_LESSONS.length) % LEARN_LESSONS.length;
    onSelectTargetSign(LEARN_LESSONS[prevIdx].label);
  };

  const handleSelectLesson = (idx: number) => {
    onSelectTargetSign(LEARN_LESSONS[idx].label);
  };

  // Check if current sign matched
  const isCurrentlyMatching =
    lastRecognizedSign &&
    lastRecognizedSign.toLowerCase() === currentLesson.label.toLowerCase() &&
    currentMatchScore >= 80;

  return (
    <div className="sk-plate rounded-[22px] p-5  space-y-5">
      {/* Header with Progress */}
      <div className="flex items-center justify-between border-b border-white/[.08] pb-3">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-400">
            <Trophy className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">
              Interactive Sign Trainer
            </h3>
            <span className="text-xs text-white/50">
              Practice Indian Sign Language gestures in real time
            </span>
          </div>
        </div>

        {/* Carousel buttons */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={handlePrev}
            className="p-1.5 rounded-lg bg-white/[.06] hover:bg-white/10 text-white/70 hover:text-white transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-xs font-mono font-bold text-white/70 px-1">
            {selectedIdx + 1} / {LEARN_LESSONS.length}
          </span>
          <button
            onClick={handleNext}
            className="p-1.5 rounded-lg bg-white/[.06] hover:bg-white/10 text-white/70 hover:text-white transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Target Sign Display Card */}
      <div className="p-4 sm:p-5 rounded-[18px] bg-black/50 border border-white/[.08] flex flex-col gap-5">
        {/* Animated 3D guide (three.js loads only here) */}
        <Suspense
          fallback={<div className="aspect-[4/3] w-full animate-pulse rounded-2xl border border-white/[.08] bg-white/[.03]" />}
        >
          <SignTutor label={currentLesson.label} />
        </Suspense>

        {/* Details & Live Match Meter */}
        <div className="flex-1 w-full space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/30">
                Target Sign
              </span>
              <h2 className="text-2xl sm:text-3xl font-black text-white mt-1">
                {currentLesson.label}
              </h2>
            </div>

            {/* Live Match Score Indicator */}
            <div className="flex flex-col items-end">
              <span className="text-[11px] uppercase tracking-wider text-white/50 font-semibold">
                Match Score
              </span>
              <span
                className={`text-2xl font-black font-mono tracking-tight ${
                  currentMatchScore >= 80 ? 'text-emerald-400' : 'text-orange-400'
                }`}
              >
                {Math.round(currentMatchScore)}%
              </span>
            </div>
          </div>

          <p className="text-xs text-white/70 font-medium leading-relaxed">
            {currentLesson.instruction}
          </p>

          {/* Match Score Bar */}
          <div className="space-y-1">
            <div className="w-full h-2.5 bg-white/[.06] rounded-full overflow-hidden p-0.5">
              <div
                className={`h-full rounded-full transition-all duration-150 ${
                  currentMatchScore >= 80
                    ? 'bg-emerald-400 shadow-sm shadow-emerald-400/80'
                    : currentMatchScore >= 50
                    ? 'bg-orange-400'
                    : 'bg-white/30'
                }`}
                style={{ width: `${Math.min(100, Math.max(5, currentMatchScore))}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-white/40 font-mono">
              <span>0%</span>
              <span className="text-emerald-400 font-semibold">Goal: 80%+</span>
              <span>100%</span>
            </div>
          </div>

          {/* Tips Box */}
          <div className="p-2.5 rounded-xl bg-white/[.03] border border-white/[.08] flex items-start gap-2 text-xs text-white/70">
            <Lightbulb className="w-4 h-4 text-orange-400 shrink-0 mt-0.5" />
            <span>
              <strong>Tip:</strong> {currentLesson.tips}
            </span>
          </div>
        </div>
      </div>

      {/* Lesson Selector Ribbon */}
      <div className="space-y-2">
        <span className="text-xs font-semibold text-white/50 uppercase tracking-wider">
          Practice Library
        </span>
        <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
          {LEARN_LESSONS.map((lesson, idx) => {
            const isSelected = idx === selectedIdx;
            return (
              <button
                key={lesson.id}
                onClick={() => handleSelectLesson(idx)}
                className={`px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap border transition-all ${
                  isSelected
                    ? 'bg-indigo-500 text-black border-indigo-400 shadow-md shadow-indigo-500/20'
                    : 'bg-black/60 text-white/70 border-white/[.08] hover:border-white/15 hover:text-white'
                }`}
              >
                {lesson.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

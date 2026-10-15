import React, { useState } from 'react';
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

interface LearnModeProps {
  currentMatchScore: number;
  lastRecognizedSign?: string | null;
  onSelectTargetSign: (signLabel: string) => void;
}

export const LearnMode: React.FC<LearnModeProps> = ({
  currentMatchScore,
  lastRecognizedSign,
  onSelectTargetSign,
}) => {
  const [selectedIdx, setSelectedIdx] = useState<number>(0);
  const [completedSigns, setCompletedSigns] = useState<string[]>([]);

  const currentLesson: LearnLesson = LEARN_LESSONS[selectedIdx] || LEARN_LESSONS[0];

  const handleNext = () => {
    const nextIdx = (selectedIdx + 1) % LEARN_LESSONS.length;
    setSelectedIdx(nextIdx);
    onSelectTargetSign(LEARN_LESSONS[nextIdx].label);
  };

  const handlePrev = () => {
    const prevIdx = (selectedIdx - 1 + LEARN_LESSONS.length) % LEARN_LESSONS.length;
    setSelectedIdx(prevIdx);
    onSelectTargetSign(LEARN_LESSONS[prevIdx].label);
  };

  const handleSelectLesson = (idx: number) => {
    setSelectedIdx(idx);
    onSelectTargetSign(LEARN_LESSONS[idx].label);
  };

  // Check if current sign matched
  const isCurrentlyMatching =
    lastRecognizedSign &&
    lastRecognizedSign.toLowerCase() === currentLesson.label.toLowerCase() &&
    currentMatchScore >= 80;

  // Render SVG Hand diagram matching pose type
  const renderPoseGraphic = (poseType: string) => {
    return (
      <div className="w-28 h-28 sm:w-36 sm:h-36 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-center p-3 relative overflow-hidden group">
        <svg viewBox="0 0 100 100" className="w-full h-full text-amber-400">
          {/* Base Palm */}
          <path
            d="M 32 50 C 30 70 38 85 50 85 C 62 85 70 70 68 50 Z"
            fill="rgba(245, 158, 11, 0.15)"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinejoin="round"
          />

          {poseType === 'open-palm' && (
            <>
              {/* 5 fingers extended */}
              <line x1="26" y1="58" x2="16" y2="44" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
              <line x1="38" y1="50" x2="36" y2="22" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
              <line x1="46" y1="48" x2="46" y2="18" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
              <line x1="54" y1="50" x2="56" y2="22" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
              <line x1="62" y1="54" x2="66" y2="30" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
            </>
          )}

          {poseType === 'thumbs-up' && (
            <>
              {/* Thumb pointing straight up, fingers curled */}
              <line x1="42" y1="55" x2="42" y2="24" stroke="currentColor" strokeWidth="5.5" strokeLinecap="round" />
              <circle cx="54" cy="55" r="4" fill="currentColor" />
              <circle cx="56" cy="65" r="4" fill="currentColor" />
              <circle cx="54" cy="74" r="4" fill="currentColor" />
            </>
          )}

          {poseType === 'fist' && (
            <>
              {/* Curled fingers into palm */}
              <rect x="36" y="44" width="28" height="28" rx="8" fill="rgba(245, 158, 11, 0.3)" stroke="currentColor" strokeWidth="3" />
              <line x1="34" y1="58" x2="44" y2="58" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
            </>
          )}

          {poseType === 'index-up' && (
            <>
              {/* Only index up */}
              <line x1="44" y1="50" x2="44" y2="20" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
              <circle cx="54" cy="54" r="3.5" fill="currentColor" />
              <circle cx="54" cy="63" r="3.5" fill="currentColor" />
              <circle cx="54" cy="71" r="3.5" fill="currentColor" />
            </>
          )}

          {poseType === 'peace' && (
            <>
              {/* Index & middle spread */}
              <line x1="42" y1="50" x2="36" y2="22" stroke="currentColor" strokeWidth="4.5" strokeLinecap="round" />
              <line x1="52" y1="50" x2="58" y2="22" stroke="currentColor" strokeWidth="4.5" strokeLinecap="round" />
              <circle cx="48" cy="64" r="4" fill="currentColor" />
            </>
          )}

          {poseType === 'three' && (
            <>
              <line x1="38" y1="50" x2="32" y2="22" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
              <line x1="48" y1="48" x2="48" y2="18" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
              <line x1="58" y1="50" x2="64" y2="22" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
            </>
          )}

          {poseType === 'splayed-sos' && (
            <>
              {/* Thumb, index, and pinky extended */}
              <line x1="28" y1="58" x2="16" y2="44" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
              <line x1="42" y1="50" x2="40" y2="22" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
              <circle cx="48" cy="56" r="3.5" fill="currentColor" />
              <circle cx="54" cy="58" r="3.5" fill="currentColor" />
              <line x1="62" y1="54" x2="68" y2="30" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
            </>
          )}
        </svg>

        <span className="absolute bottom-1 right-2 text-[10px] font-mono text-slate-500 uppercase">
          ISL Sign
        </span>
      </div>
    );
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-5">
      {/* Header with Progress */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
            <Trophy className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white font-['Plus_Jakarta_Sans']">
              Interactive Sign Trainer
            </h3>
            <span className="text-xs text-slate-400">
              Practice Indian Sign Language gestures in real time
            </span>
          </div>
        </div>

        {/* Carousel buttons */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={handlePrev}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-xs font-mono font-bold text-slate-300 px-1">
            {selectedIdx + 1} / {LEARN_LESSONS.length}
          </span>
          <button
            onClick={handleNext}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Target Sign Display Card */}
      <div className="p-4 sm:p-5 rounded-2xl bg-slate-950 border border-slate-800 flex flex-col sm:flex-row items-center gap-5">
        {/* Hand Illustration */}
        {renderPoseGraphic(currentLesson.svgPoseType)}

        {/* Details & Live Match Meter */}
        <div className="flex-1 w-full space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
                Target Sign
              </span>
              <h2 className="text-2xl sm:text-3xl font-black text-white mt-1 font-['Plus_Jakarta_Sans']">
                {currentLesson.label}
              </h2>
            </div>

            {/* Live Match Score Indicator */}
            <div className="flex flex-col items-end">
              <span className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
                Match Score
              </span>
              <span
                className={`text-2xl font-black font-mono tracking-tight ${
                  currentMatchScore >= 80 ? 'text-emerald-400' : 'text-amber-400'
                }`}
              >
                {Math.round(currentMatchScore)}%
              </span>
            </div>
          </div>

          <p className="text-xs text-slate-300 font-medium leading-relaxed">
            {currentLesson.instruction}
          </p>

          {/* Match Score Bar */}
          <div className="space-y-1">
            <div className="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden p-0.5">
              <div
                className={`h-full rounded-full transition-all duration-150 ${
                  currentMatchScore >= 80
                    ? 'bg-emerald-400 shadow-sm shadow-emerald-400/80'
                    : currentMatchScore >= 50
                    ? 'bg-amber-400'
                    : 'bg-slate-600'
                }`}
                style={{ width: `${Math.min(100, Math.max(5, currentMatchScore))}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-slate-500 font-mono">
              <span>0%</span>
              <span className="text-emerald-400 font-semibold">Goal: 80%+</span>
              <span>100%</span>
            </div>
          </div>

          {/* Tips Box */}
          <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 flex items-start gap-2 text-xs text-slate-300">
            <Lightbulb className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <span>
              <strong>Tip:</strong> {currentLesson.tips}
            </span>
          </div>
        </div>
      </div>

      {/* Lesson Selector Ribbon */}
      <div className="space-y-2">
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
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
                    ? 'bg-cyan-500 text-slate-950 border-cyan-400 shadow-md shadow-cyan-500/20'
                    : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700 hover:text-white'
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

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useCallback } from 'react';
import { AppMode, QuickPhrase } from '../types/isl';
import { Navbar } from '../components/Navbar';
import { CameraView } from '../components/CameraView';
import { SentenceBuilder } from '../components/SentenceBuilder';
import { ReverseCaptions } from '../components/ReverseCaptions';
import { QuickPhrases } from '../components/QuickPhrases';
import { SosView } from '../components/SosView';
import { LearnMode } from '../components/LearnMode';
import { GuideModal } from '../components/GuideModal';
import { soundEffects } from '../services/soundEffects';
import { useSignPredictor } from '../hooks/useSignPredictor';
import type { LiveState } from '../hooks/useRecognition';
import type { Prediction, PredictorKind } from '../lib/predictor';

/**
 * Appends an accepted sign. Fingerspelled letters and digits join into one word
 * (H, E, L, L, O -> HELLO) as long as the current word is itself spelled out;
 * word signs are always separated by a space.
 */
function appendSign(sentence: string, label: string): string {
  if (!sentence.trim()) return label;
  const lastWord = sentence.split(' ').pop() ?? '';
  const spelling = label.length === 1 && /^[A-Z0-9]+$/.test(lastWord);
  if (spelling) return sentence + label;
  return sentence.endsWith(' ') ? sentence + label : `${sentence} ${label}`;
}

/** /app?mode=learn opens Learn mode; SOS is never opened from a link, so it can't start a countdown by surprise. */
function initialMode(): AppMode {
  return new URLSearchParams(location.search).get('mode') === 'learn' ? 'learn' : 'conversation';
}

export default function TranslatorPage() {
  const [currentMode, setCurrentMode] = useState<AppMode>(initialMode);
  const [predictorKind, setPredictorKind] = useState<PredictorKind>('tfjs');
  const { predictor, fallbackReason } = useSignPredictor(predictorKind);
  const [sentence, setSentence] = useState<string>('');
  const [lastAddedSign, setLastAddedSign] = useState<string | null>(null);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [isGuideOpen, setIsGuideOpen] = useState<boolean>(false);

  // Learn Mode states
  const [targetSignForLearn, setTargetSignForLearn] = useState<string>('Hello');
  const [learnMatchScore, setLearnMatchScore] = useState<number>(0);
  const [learnLastAccepted, setLearnLastAccepted] = useState<string | null>(null);

  // Match score = the predictor's probability for the target sign (0 if it can't recognize it).
  const handleLearnLiveUpdate = useCallback(
    (live: LiveState) => {
      const p = live.prediction;
      const idx = p ? predictor?.labels.indexOf(targetSignForLearn) ?? -1 : -1;
      setLearnMatchScore(p && idx >= 0 ? Math.round(p.probabilities[idx] * 100) : 0);
    },
    [predictor, targetSignForLearn]
  );

  const handleLearnAccepted = useCallback((prediction: Prediction) => {
    setLearnLastAccepted(prediction.label);
  }, []);

  // Triggered SOS state
  const [isSosEmergencyActive, setIsSosEmergencyActive] = useState<boolean>(false);

  const handleToggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    soundEffects.enabled = next;
  };

  // Called when camera detection holds a sign > 80% confidence for 1.0 second
  const handleSignAccepted = useCallback(
    (prediction: Prediction) => {
      // Check for Emergency distress sign in any mode
      if (prediction.label === 'SOS') {
        setCurrentMode('sos');
        setIsSosEmergencyActive(true);
        return;
      }

      setLastAddedSign(prediction.label);
      setTimeout(() => setLastAddedSign(null), 2500);

      setSentence((prev) => appendSign(prev, prediction.label));
    },
    []
  );

  const handleAddSpace = () => {
    setSentence((prev) => (prev.endsWith(' ') ? prev : `${prev} `));
  };

  const handleUndo = () => {
    setSentence((prev) => {
      const trimmed = prev.trimEnd();
      const lastSpaceIdx = trimmed.lastIndexOf(' ');
      if (lastSpaceIdx === -1) {
        return '';
      }
      return trimmed.substring(0, lastSpaceIdx);
    });
  };

  const handleClear = () => {
    setSentence('');
    setLastAddedSign(null);
  };

  const handleSelectQuickPhrase = (phrase: QuickPhrase) => {
    setSentence((prev) => {
      if (!prev.trim()) return phrase.label;
      return prev.endsWith(' ') ? `${prev}${phrase.label}` : `${prev} ${phrase.label}`;
    });
    setLastAddedSign(phrase.label);
    setTimeout(() => setLastAddedSign(null), 2000);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-amber-500/30 selection:text-amber-200">
      {/* Top App Bar */}
      <Navbar
        currentMode={currentMode}
        onSelectMode={(mode) => {
          setCurrentMode(mode);
          if (mode === 'sos') {
            setIsSosEmergencyActive(true);
          }
        }}
        predictorKind={predictorKind}
        activePredictorKind={predictor?.kind ?? null}
        fallbackReason={fallbackReason}
        onChangePredictorKind={setPredictorKind}
        soundEnabled={soundEnabled}
        onToggleSound={handleToggleSound}
        onOpenHelp={() => setIsGuideOpen(true)}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
        {/* CONVERSATION MODE */}
        {currentMode === 'conversation' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left Column: Real-time Camera Feed & Detection HUD */}
            <div className="lg:col-span-6 space-y-4">
              <CameraView predictor={predictor} onSignAccepted={handleSignAccepted} />
              <div className="hidden lg:block">
                <QuickPhrases onSelectPhrase={handleSelectQuickPhrase} />
              </div>
            </div>

            {/* Right Column: Sentence Builder & Reverse Captions */}
            <div className="lg:col-span-6 space-y-6">
              {/* Sentence Builder */}
              <SentenceBuilder
                sentence={sentence}
                onSentenceChange={setSentence}
                onAddSpace={handleAddSpace}
                onUndo={handleUndo}
                onClear={handleClear}
                lastAddedSign={lastAddedSign}
              />

              {/* Reverse Mode: Hearing Person Speech to Text Captions */}
              <ReverseCaptions />

              {/* Mobile Quick Phrases */}
              <div className="block lg:hidden">
                <QuickPhrases onSelectPhrase={handleSelectQuickPhrase} />
              </div>
            </div>
          </div>
        )}

        {/* LEARN MODE */}
        {currentMode === 'learn' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-6 space-y-4">
              <CameraView
                predictor={predictor}
                onSignAccepted={handleLearnAccepted}
                onLiveUpdate={handleLearnLiveUpdate}
              />
            </div>
            <div className="lg:col-span-6">
              <LearnMode
                currentMatchScore={learnMatchScore}
                lastRecognizedSign={learnLastAccepted}
                onSelectTargetSign={(sign) => {
                  setTargetSignForLearn(sign);
                  setLearnMatchScore(0);
                  setLearnLastAccepted(null);
                }}
              />
            </div>
          </div>
        )}

        {/* SOS EMERGENCY MODE */}
        {currentMode === 'sos' && (
          <div className="max-w-4xl mx-auto">
            <SosView
              isTriggeredDirectly={isSosEmergencyActive}
              onBackToNormal={() => {
                setIsSosEmergencyActive(false);
                setCurrentMode('conversation');
              }}
            />
          </div>
        )}
      </main>

      {/* Guide & Help Modal */}
      <GuideModal isOpen={isGuideOpen} onClose={() => setIsGuideOpen(false)} />

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950 py-4 px-6 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>Sanket — Accessible Indian Sign Language (ISL) Recognition Engine</span>
          <span className="font-mono text-[11px] text-slate-400">MediaPipe Vision • TensorFlow.js • Web Speech API</span>
        </div>
      </footer>
    </div>
  );
}

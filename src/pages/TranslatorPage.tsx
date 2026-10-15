import React, { useCallback, useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { AppMode, QuickPhrase } from '../types/isl';
import { Navbar } from '../components/Navbar';
import { CameraView } from '../components/CameraView';
import { SentenceBuilder } from '../components/SentenceBuilder';
import { ReverseCaptions } from '../components/ReverseCaptions';
import { QuickPhrases } from '../components/QuickPhrases';
import { SosView } from '../components/SosView';
import { LearnMode } from '../components/LearnMode';
import { GuideModal } from '../components/GuideModal';
import { DashboardHome } from '../components/dashboard/DashboardHome';
import { LiveStrip } from '../components/dashboard/LiveStrip';
import { soundEffects } from '../services/soundEffects';
import { useSignPredictor } from '../hooks/useSignPredictor';
import type { LiveState, PipelineStats } from '../hooks/useRecognition';
import type { Prediction, PredictorKind } from '../lib/predictor';
import { recordSign } from '../lib/signHistory';

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

/** ?mode= picks the opening view. SOS is never opened from a link, so a link can't start an alert. */
function initialMode(): AppMode {
  const m = new URLSearchParams(location.search).get('mode');
  return m === 'conversation' || m === 'learn' ? m : 'home';
}

const EMPTY_LIVE: LiveState = { prediction: null, handsCount: 0, candidate: null, progress: 0 };
const EMPTY_STATS: PipelineStats = { fps: 0, detectMs: 0, inferMs: 0 };

const SectionTitle: React.FC<{ kicker: string; title: React.ReactNode; children?: React.ReactNode }> = ({ kicker, title, children }) => (
  <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[.24em] text-saffron">{kicker}</p>
      <h1 className="mt-2 font-serif text-4xl leading-none sm:text-5xl">{title}</h1>
    </div>
    {children}
  </div>
);

export default function TranslatorPage() {
  const [currentMode, setCurrentMode] = useState<AppMode>(initialMode);
  const [predictorKind, setPredictorKind] = useState<PredictorKind>('tfjs');
  const { predictor, fallbackReason } = useSignPredictor(predictorKind);
  const [sentence, setSentence] = useState('');
  const [lastAddedSign, setLastAddedSign] = useState<string | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const [live, setLive] = useState<LiveState>(EMPTY_LIVE);
  const [stats, setStats] = useState<PipelineStats>(EMPTY_STATS);
  const [scrolled, setScrolled] = useState(false);

  // Learn mode
  const [targetSignForLearn, setTargetSignForLearn] = useState('Hello');
  const [learnMatchScore, setLearnMatchScore] = useState(0);
  const [learnLastAccepted, setLearnLastAccepted] = useState<string | null>(null);

  // SOS: true when the SOS sign was made (starts the countdown); false when opened from the tab.
  const [isSosEmergencyActive, setIsSosEmergencyActive] = useState(false);

  const goTo = useCallback((mode: AppMode) => {
    setCurrentMode(mode);
    if (mode !== 'sos') history.replaceState(null, '', mode === 'home' ? '/app' : `/app?mode=${mode}`);
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Match score = the predictor's probability for the target sign (0 if it can't recognise it).
  const handleLearnLiveUpdate = useCallback(
    (l: LiveState) => {
      const p = l.prediction;
      const idx = p ? predictor?.labels.indexOf(targetSignForLearn) ?? -1 : -1;
      setLearnMatchScore(p && idx >= 0 ? Math.round(p.probabilities[idx] * 100) : 0);
    },
    [predictor, targetSignForLearn]
  );

  const handleLearnAccepted = useCallback(
    (prediction: Prediction) => {
      setLearnLastAccepted(prediction.label);
      if (prediction.label === targetSignForLearn) recordSign(prediction.label, 'learn');
    },
    [targetSignForLearn]
  );

  const practise = useCallback(
    (label?: string) => {
      if (label) {
        setTargetSignForLearn(label);
        setLearnMatchScore(0);
        setLearnLastAccepted(null);
      }
      goTo('learn');
    },
    [goTo]
  );

  const handleToggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    soundEffects.enabled = next;
  };

  // Called when a sign is held above 80% confidence for a second.
  const handleSignAccepted = useCallback((prediction: Prediction) => {
    if (prediction.label === 'SOS') {
      setCurrentMode('sos');
      setIsSosEmergencyActive(true);
      return;
    }
    recordSign(prediction.label, 'conversation');
    setLastAddedSign(prediction.label);
    setTimeout(() => setLastAddedSign(null), 2500);
    setSentence((prev) => appendSign(prev, prediction.label));
  }, []);

  const handleAddSpace = () => setSentence((prev) => (prev.endsWith(' ') ? prev : `${prev} `));

  const handleUndo = () => {
    setSentence((prev) => {
      const trimmed = prev.trimEnd();
      const lastSpaceIdx = trimmed.lastIndexOf(' ');
      return lastSpaceIdx === -1 ? '' : trimmed.substring(0, lastSpaceIdx);
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

  const enter = { initial: { opacity: 0, y: 14 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.45 } };

  return (
    <div className="flex min-h-screen flex-col bg-black text-ink">
      <Navbar
        currentMode={currentMode}
        onSelectMode={(mode) => {
          // Opening the SOS tab shows the screen; only the SOS sign or its button starts the countdown.
          if (mode === 'sos') setIsSosEmergencyActive(false);
          goTo(mode);
        }}
        predictorKind={predictorKind}
        activePredictorKind={predictor?.kind ?? null}
        fallbackReason={fallbackReason}
        onChangePredictorKind={setPredictorKind}
        soundEnabled={soundEnabled}
        onToggleSound={handleToggleSound}
        onOpenHelp={() => setIsGuideOpen(true)}
        overHero={currentMode === 'home' && !scrolled}
      />

      <main className="flex-1">
        {currentMode === 'home' && (
          <DashboardHome
            predictorKind={predictor?.kind ?? null}
            fallback={!!fallbackReason}
            onTranslate={() => goTo('conversation')}
            onPractise={practise}
          />
        )}

        {currentMode === 'conversation' && (
          <motion.div key="conversation" {...enter} className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
            <SectionTitle
              kicker="Conversation"
              title={
                <>
                  Sign, and be <em className="text-glow">heard.</em>
                </>
              }
            />
            <div className="mb-6">
              <LiveStrip live={live} stats={stats} />
            </div>
            <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
              <div className="space-y-6 lg:col-span-6">
                <CameraView predictor={predictor} onSignAccepted={handleSignAccepted} onLiveUpdate={setLive} onStats={setStats} />
                <div className="hidden lg:block">
                  <QuickPhrases onSelectPhrase={handleSelectQuickPhrase} />
                </div>
              </div>
              <div className="space-y-6 lg:col-span-6">
                <SentenceBuilder
                  sentence={sentence}
                  onSentenceChange={setSentence}
                  onAddSpace={handleAddSpace}
                  onUndo={handleUndo}
                  onClear={handleClear}
                  lastAddedSign={lastAddedSign}
                />
                <ReverseCaptions />
                <div className="block lg:hidden">
                  <QuickPhrases onSelectPhrase={handleSelectQuickPhrase} />
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {currentMode === 'learn' && (
          <motion.div key="learn" {...enter} className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
            <SectionTitle
              kicker="Learn ISL"
              title={
                <>
                  Watch it, then <em className="text-glow">sign it.</em>
                </>
              }
            />
            <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
              <div className="space-y-4 lg:col-span-6">
                <CameraView predictor={predictor} onSignAccepted={handleLearnAccepted} onLiveUpdate={handleLearnLiveUpdate} />
              </div>
              <div className="lg:col-span-6">
                <LearnMode
                  targetLabel={targetSignForLearn}
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
          </motion.div>
        )}

        {currentMode === 'sos' && (
          <motion.div key="sos" {...enter} className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
            <SosView
              isTriggeredDirectly={isSosEmergencyActive}
              onBackToNormal={() => {
                setIsSosEmergencyActive(false);
                goTo('conversation');
              }}
            />
          </motion.div>
        )}
      </main>

      <GuideModal isOpen={isGuideOpen} onClose={() => setIsGuideOpen(false)} />

      <footer className="border-t border-white/[.06] px-6 py-6 text-xs text-white/35">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 sm:flex-row">
          <span>
            Sanket <span className="font-deva">संकेत</span> · Indian Sign Language, understood in real time
          </span>
          <span className="font-mono text-[11px]">MediaPipe · TensorFlow.js · Web Speech API</span>
        </div>
      </footer>
    </div>
  );
}

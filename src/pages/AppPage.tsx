import React, { useCallback, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useAuth } from '../auth/AuthProvider';
import { AppShell, AppView } from '../components/app/AppShell';
import { useConversation } from '../hooks/useConversation';
import { useSignPredictor } from '../hooks/useSignPredictor';
import type { Prediction, PredictorKind } from '../lib/predictor';
import { recordSign } from '../lib/signHistory';
import { soundEffects } from '../services/soundEffects';
import { ConverseView } from './app/ConverseView';
import { HomeView } from './app/HomeView';
import { LearnView } from './app/LearnView';
import { SosView } from './app/SosView';

/** ?view= picks the opening view (old ?mode= links still work). SOS never opens from a link. */
function initialView(): AppView {
  const q = new URLSearchParams(location.search);
  const v = q.get('view') ?? q.get('mode');
  if (v === 'converse' || v === 'conversation') return 'converse';
  if (v === 'learn') return 'learn';
  return 'home';
}

const EASE = [0.22, 0.61, 0.36, 1] as const;

export default function AppPage() {
  const { profile } = useAuth();
  const [view, setView] = useState<AppView>(initialView);
  const [predictorKind, setPredictorKind] = useState<PredictorKind>('tfjs');
  const { predictor, fallbackReason } = useSignPredictor(predictorKind);
  const [soundOn, setSoundOn] = useState(true);
  const [learnTarget, setLearnTarget] = useState('Hello');
  // Bumped when the SOS sign is made, which opens SOS straight into its countdown.
  const [sosTrigger, setSosTrigger] = useState(0);
  const convo = useConversation(profile?.preferred_language ?? 'en-IN');

  const go = useCallback((v: AppView, lesson?: string) => {
    if (lesson) setLearnTarget(lesson);
    if (v === 'sos') setSosTrigger(0);
    setView(v);
    if (v !== 'sos') history.replaceState(null, '', v === 'home' ? '/app' : `/app?view=${v}`);
    window.scrollTo({ top: 0 });
  }, []);

  const onConverseSign = useCallback(
    (p: Prediction) => {
      if (p.label === 'SOS') {
        setSosTrigger((n) => n + 1);
        setView('sos');
        return;
      }
      recordSign(p.label, 'conversation');
      convo.addSign(p.label);
    },
    [convo.addSign]
  );

  return (
    <AppShell
      view={view}
      onView={(v) => go(v)}
      predictorKind={predictorKind}
      activeKind={predictor?.kind ?? null}
      fallbackReason={fallbackReason}
      onPredictorKind={setPredictorKind}
      soundOn={soundOn}
      onToggleSound={() => {
        soundEffects.enabled = !soundOn;
        setSoundOn(!soundOn);
      }}
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={view === 'sos' ? `sos-${sosTrigger}` : view}
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.35, ease: EASE }}
        >
          {view === 'home' && <HomeView predictorKind={predictor?.kind ?? null} onGo={go} />}
          {view === 'converse' && <ConverseView predictor={predictor} convo={convo} onSignAccepted={onConverseSign} />}
          {view === 'learn' && <LearnView predictor={predictor} target={learnTarget} onTarget={setLearnTarget} />}
          {view === 'sos' && <SosView triggered={sosTrigger > 0} onExit={() => go('converse')} />}
        </motion.div>
      </AnimatePresence>
    </AppShell>
  );
}

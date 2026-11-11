import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { AppShell, type AppView } from '../components/app/AppShell';
import { useStage } from '../components/app/CameraStage';
import { vocab } from '../data/vocabulary';
import type { EngineMode, Token } from '../engine/engine';
import type { DetectedHand } from '../engine/features';
import { useConversation } from '../hooks/useConversation';
import { useSignEngine } from '../hooks/useSignEngine';
import { HelpSignalDetector, helpShape } from '../lib/helpSignal';
import { useCustomSigns, usePrototypes } from '../lib/mySigns';
import { recordSign } from '../lib/signHistory';
import { soundEffects } from '../services/soundEffects';
import { LabView } from './app/LabView';
import { LearnView } from './app/LearnView';
import { MySignsView } from './app/MySignsView';
import { SosView } from './app/SosView';
import { TranslateView } from './app/TranslateView';

/** ?view= picks the opening view (old links still work). SOS never opens from a link. */
function initialView(): AppView {
  const v = new URLSearchParams(location.search).get('view') ?? new URLSearchParams(location.search).get('mode');
  if (v === 'learn') return 'learn';
  if (v === 'lab') return 'lab';
  if (v === 'mysigns') return 'mysigns';
  return 'translate';
}

const RECENT = 10;
const EMPTY: string[] = [];

export default function AppPage() {
  const { profile } = useAuth();
  const [view, setView] = useState<AppView>(initialView);
  const [mode, setMode] = useState<EngineMode>('auto');
  const [soundOn, setSoundOn] = useState(true);
  const [learnTarget, setLearnTarget] = useState('hello');
  const [attempt, setAttempt] = useState<Token | null>(null);
  const [recent, setRecent] = useState<Token[]>([]);
  // Bumped when the Signal for Help is made, which opens SOS straight into its countdown.
  const [sosTrigger, setSosTrigger] = useState(0);
  const [sosArmed, setSosArmed] = useState(false);

  // In Learn the engine reads only what the target needs: letters or words.
  const targetGroup = vocab(learnTarget).group;
  const learnMode: EngineMode = targetGroup === 'letter' || targetGroup === 'number' ? 'letters' : 'words';
  const viewRef = useRef(view);
  viewRef.current = view;
  const targetRef = useRef(learnTarget);
  targetRef.current = learnTarget;

  const onTokenRef = useRef<(t: Token) => void>(() => {});
  // My signs listens for both kinds of taught sign, so it runs letters and words together.
  const engineMode: EngineMode = view === 'learn' ? learnMode : view === 'mysigns' ? 'auto' : mode;
  const { status, bundle, engine } = useSignEngine(engineMode, (t) => onTokenRef.current(t));
  const customSigns = useCustomSigns();
  const prototypes = usePrototypes(engine, bundle, customSigns);

  const words = useMemo(
    () => (bundle?.dynamicModel ? bundle.dynamicModel.labels.filter((l) => l !== bundle.dynamicModel!.config.background) : EMPTY),
    [bundle]
  );
  const labels = useMemo(
    () => [...words, ...(bundle?.staticModel?.labels.filter((l) => l !== bundle.staticModel!.config.background) ?? EMPTY)],
    [bundle, words]
  );
  const convo = useConversation(profile?.preferred_language ?? 'en-IN', words);

  onTokenRef.current = (token) => {
    stage.stats.current.acceptedAt = performance.now();
    if (viewRef.current === 'learn') {
      setAttempt(token);
      if (token.label === targetRef.current) {
        soundEffects.playAccepted();
        recordSign(token.label, 'learn');
      }
      return;
    }
    soundEffects.playAccepted();
    setRecent((r) => [token, ...r].slice(0, RECENT));
    if (viewRef.current === 'mysigns') return;
    recordSign(token.label, 'conversation');
    convo.addToken(token);
  };

  // Emergency: only the full two-step Signal for Help (thumb tucked, then fist) opens SOS.
  const helpSignal = useRef(new HelpSignalDetector());
  const onHands = useCallback((hands: DetectedHand[], now: number) => {
    if (viewRef.current !== 'translate') return;
    let shape: ReturnType<typeof helpShape> = null;
    for (const hand of hands) shape ??= helpShape(hand.landmarks);
    const state = helpSignal.current.update(shape, now);
    setSosArmed((armed) => (armed === (state === 'armed') ? armed : state === 'armed'));
    if (state === 'triggered') {
      setSosTrigger((n) => n + 1);
      setView('sos');
    }
  }, []);

  const stage = useStage({ engine, onHands });

  const go = useCallback(
    (v: AppView) => {
      if (v === 'sos') setSosTrigger(0);
      // The camera and demo belong to the view that started them.
      stage.camera.stop();
      stage.stopDemo();
      setAttempt(null);
      setSosArmed(false);
      helpSignal.current.reset();
      setView(v);
      if (v !== 'sos') history.replaceState(null, '', v === 'translate' ? '/app' : `/app?view=${v}`);
      window.scrollTo({ top: 0 });
    },
    [stage.camera.stop, stage.stopDemo]
  );

  useEffect(() => setAttempt(null), [learnTarget]);
  useEffect(() => {
    if (labels.length && !learnTarget.startsWith('sentence:') && !labels.includes(learnTarget)) setLearnTarget(labels[0]);
  }, [labels, learnTarget]);

  return (
    <AppShell
      view={view}
      onView={go}
      status={status}
      bundle={bundle}
      soundOn={soundOn}
      onToggleSound={() => {
        soundEffects.enabled = !soundOn;
        setSoundOn(!soundOn);
      }}
    >
      {status === 'error' && view !== 'sos' && (
        <div role="alert" className="mb-3 rounded-md border-2 border-alarm bg-white p-3 text-[15px]">
          <b>No trained model could be loaded.</b> {bundle?.problems.join(' ')} Train and export with the scripts in <code className="num">ml/</code> (see the README).
        </div>
      )}
      {view === 'translate' && (
        <TranslateView stage={stage} engine={engine} mode={mode} onMode={setMode} convo={convo} recent={recent} sosArmed={sosArmed} />
      )}
      {view === 'learn' && (
        <LearnView stage={stage} engine={engine} labels={labels} target={learnTarget} onTarget={setLearnTarget} attempt={attempt} />
      )}
      {view === 'mysigns' && (
        <MySignsView stage={stage} engine={engine} bundle={bundle} signs={customSigns} prototypes={prototypes} recent={recent} />
      )}
      {view === 'lab' && <LabView bundle={bundle} engine={engine} language={convo.language} />}
      {view === 'sos' && <SosView key={sosTrigger} triggered={sosTrigger > 0} onExit={() => go('translate')} />}
    </AppShell>
  );
}

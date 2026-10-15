import React, { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { ArrowRight, Check, Minus } from 'lucide-react';
import { LEARN_LESSONS } from '../../data/learnLessons';
import { SIGN_ANIMATIONS } from '../../data/signAnimations';
import { useHandLandmarker } from '../../hooks/useHandLandmarker';
import type { PredictorKind } from '../../lib/predictor';
import { Link } from '../../lib/router';
import { SignEvent, relativeTime, summarize } from '../../lib/signHistory';
import { LiveBadge, Panel, PanelHeader } from '../ui/Panel';

const MiniHand = lazy(() => import('./MiniHand'));

// ---------------------------------------------------------------------------
// Signal check: is every part of the pipeline ready? Shown as signal bars.
// ---------------------------------------------------------------------------

type Level = 0 | 1 | 2 | 3 | 4;
type PermissionLevel = 'granted' | 'prompt' | 'denied' | 'unknown';

function usePermission(name: 'camera' | 'microphone' | 'geolocation'): PermissionLevel {
  const [state, setState] = useState<PermissionLevel>('unknown');
  useEffect(() => {
    let status: PermissionStatus | null = null;
    const update = () => status && setState(status.state as PermissionLevel);
    navigator.permissions
      ?.query({ name: name as PermissionName })
      .then((s) => {
        status = s;
        update();
        s.addEventListener('change', update);
      })
      .catch(() => setState('unknown'));
    return () => status?.removeEventListener('change', update);
  }, [name]);
  return state;
}

const permissionRow = (p: PermissionLevel): { level: Level; text: string } =>
  p === 'granted'
    ? { level: 4, text: 'Allowed' }
    : p === 'prompt'
    ? { level: 2, text: 'Will ask' }
    : p === 'denied'
    ? { level: 0, text: 'Blocked' }
    : { level: 2, text: 'Unknown' };

const SignalBars: React.FC<{ level: Level; busy?: boolean }> = ({ level, busy }) => (
  <span className="flex h-4 items-end gap-[3px]" aria-hidden="true">
    {[1, 2, 3, 4].map((i) => (
      <span
        key={i}
        className={`w-[4px] rounded-sm ${busy ? 'animate-pulse' : ''} ${
          i <= level ? (level <= 1 ? 'bg-rose-400' : level === 2 ? 'bg-amber-300' : 'bg-saffron') : 'bg-white/12'
        }`}
        style={{ height: `${i * 25}%` }}
      />
    ))}
  </span>
);

export const SignalCheck: React.FC<{ predictorKind: PredictorKind | null; fallback: boolean }> = ({ predictorKind, fallback }) => {
  const landmarker = useHandLandmarker(); // also warms up hand tracking for the translator
  const camera = usePermission('camera');
  const mic = usePermission('microphone');
  const [voices, setVoices] = useState(0);
  const sttSupported = typeof window !== 'undefined' && !!(window.SpeechRecognition || window.webkitSpeechRecognition);

  useEffect(() => {
    if (!('speechSynthesis' in window)) return;
    const read = () => setVoices(window.speechSynthesis.getVoices().length);
    read();
    window.speechSynthesis.addEventListener('voiceschanged', read);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', read);
  }, []);

  const rows: { label: string; level: Level; text: string; busy?: boolean }[] = [
    {
      label: 'Hand tracking',
      level: landmarker.status === 'ready' ? 4 : landmarker.status === 'loading' ? 2 : 0,
      text: landmarker.status === 'ready' ? 'Ready' : landmarker.status === 'loading' ? 'Loading' : 'Failed',
      busy: landmarker.status === 'loading',
    },
    {
      label: 'Recognition',
      level: predictorKind === 'tfjs' ? 4 : predictorKind === 'mock' ? 3 : 1,
      text: predictorKind === 'tfjs' ? 'Trained model' : predictorKind === 'mock' ? (fallback ? 'Mock (no model yet)' : 'Mock') : 'Loading',
      busy: predictorKind === null,
    },
    { label: 'Camera', ...permissionRow(camera) },
    { label: 'Microphone', ...permissionRow(mic) },
    { label: 'Voice', level: voices > 0 ? 4 : 1, text: voices > 0 ? `${voices} voices` : 'No voices' },
    { label: 'Live captions', level: sttSupported ? 4 : 0, text: sttSupported ? 'Supported' : 'Not in this browser' },
  ];
  const ready = rows.filter((r) => r.level >= 3).length;

  return (
    <Panel className="h-full">
      <PanelHeader index="01" kicker="Signal check" title={<>{ready} of {rows.length} <em className="text-glow">ready</em></>} action={<LiveBadge on={landmarker.status !== 'error'} />} />
      <ul className="mt-4 divide-y divide-white/[.06] px-6 pb-5">
        {rows.map((r) => (
          <li key={r.label} className="flex items-center justify-between gap-3 py-2.5 text-sm">
            <span className="text-white/75">{r.label}</span>
            <span className="flex items-center gap-3">
              <span className={`text-xs ${r.level <= 1 ? 'text-rose-300' : 'text-white/45'}`}>{r.text}</span>
              <SignalBars level={r.level} busy={r.busy} />
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  );
};

// ---------------------------------------------------------------------------
// Sign of the day: a turning 3D hand, a new lesson each day.
// ---------------------------------------------------------------------------

export const SignOfTheDay: React.FC<{ onPractise: (label: string) => void }> = ({ onPractise }) => {
  const lessons = LEARN_LESSONS.filter((l) => SIGN_ANIMATIONS[l.label]);
  const day = Math.floor(Date.now() / 86_400_000);
  const lesson = lessons[day % lessons.length];

  return (
    <Panel className="relative flex h-full min-h-[360px] flex-col">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_60%_45%,rgba(255,140,40,.16),transparent_60%)]" />
      <div className="absolute inset-y-0 right-0 w-[58%]">
        <Suspense fallback={null}>
          <MiniHand label={lesson.label} />
        </Suspense>
      </div>
      <div className="relative">
        <PanelHeader index="02" kicker="Sign of the day" />
      </div>
      <div className="relative mt-auto max-w-[56%] p-6">
        <p className="font-deva text-sm text-saffron/80">आज का संकेत</p>
        <h3 className="font-serif text-5xl leading-none">{lesson.label}</h3>
        <p className="mt-2 text-sm text-white/55">{lesson.instruction}</p>
        <button
          onClick={() => onPractise(lesson.label)}
          className="group mt-4 flex items-center gap-2 rounded-full bg-white py-1.5 pl-4 pr-1.5 text-sm font-semibold text-black"
        >
          Practise it
          <span className="grid h-7 w-7 place-items-center rounded-full bg-saffron-deep">
            <ArrowRight className="h-3.5 w-3.5 text-white transition-transform group-hover:translate-x-0.5" />
          </span>
        </button>
      </div>
    </Panel>
  );
};

// ---------------------------------------------------------------------------
// Today's conversation: the signs made today, as a ribbon of words.
// ---------------------------------------------------------------------------

export const TodayRibbon: React.FC<{ events: SignEvent[]; onStart: () => void }> = ({ events, onStart }) => {
  const today = new Date().toDateString();
  const todays = events.filter((e) => e.source === 'conversation' && new Date(e.ts).toDateString() === today).slice(0, 18);
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30_000); // keep "2 min ago" fresh
    return () => clearInterval(t);
  }, []);

  return (
    <Panel className="h-full">
      <PanelHeader
        index="03"
        kicker="Today's conversation"
        title={todays.length ? <>{todays.length} sign{todays.length === 1 ? '' : 's'} <em className="text-glow">spoken</em></> : 'Quiet so far'}
        action={todays[0] && <span className="text-xs text-white/40">{relativeTime(todays[0].ts)}</span>}
      />
      {todays.length ? (
        <div className="relative mt-5 px-6 pb-6">
          <div className="absolute left-6 right-6 top-[18px] h-px bg-gradient-to-r from-saffron/50 via-white/10 to-transparent" />
          <ol className="relative flex flex-wrap gap-2" aria-label="Signs made today, newest first">
            {todays.map((e, i) => (
              <motion.li
                key={e.ts}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                className={`rounded-full border px-3.5 py-1.5 text-sm ${
                  i === 0 ? 'border-saffron/60 bg-saffron/15 text-white' : 'border-white/10 bg-black/60 text-white/70'
                }`}
                title={new Date(e.ts).toLocaleTimeString()}
              >
                {e.label}
              </motion.li>
            ))}
          </ol>
        </div>
      ) : (
        <div className="px-6 pb-6 pt-3">
          <p className="text-sm text-white/50">Signs you make in Conversation mode appear here, newest first.</p>
          <button onClick={onStart} className="mt-4 text-sm font-medium text-saffron hover:text-glow">
            Start a conversation →
          </button>
        </div>
      )}
    </Panel>
  );
};

// ---------------------------------------------------------------------------
// Week pulse: activity per day drawn as a signal waveform.
// ---------------------------------------------------------------------------

export const WeekPulse: React.FC<{ events: SignEvent[] }> = ({ events }) => {
  const { week, streak } = useMemo(() => summarize(events), [events]);
  const total = week.reduce((s, d) => s + d.count, 0);
  const max = Math.max(1, ...week.map((d) => d.count));
  const W = 320;
  const H = 96;
  const pts = week.map((d, i) => [12 + (i * (W - 24)) / 6, H - 14 - (d.count / max) * (H - 30)] as const);
  // Smooth curve through the day points.
  const path = pts.reduce((acc, [x, y], i) => {
    if (i === 0) return `M${x},${y}`;
    const [px, py] = pts[i - 1];
    const cx = (px + x) / 2;
    return `${acc} C${cx},${py} ${cx},${y} ${x},${y}`;
  }, '');

  return (
    <Panel className="h-full">
      <PanelHeader
        index="04"
        kicker="Week pulse"
        title={<>{total} <em className="text-glow">this week</em></>}
        action={<span className="font-mono text-xs text-white/45">{streak} day streak</span>}
      />
      <div className="px-4 pb-5 pt-2">
        <svg viewBox={`0 0 ${W} ${H + 18}`} className="w-full" role="img" aria-label={`Signs per day this week: ${week.map((d) => d.count).join(', ')}`}>
          <defs>
            <linearGradient id="pulse-fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="#ff9a3c" stopOpacity="0.28" />
              <stop offset="1" stopColor="#ff9a3c" stopOpacity="0" />
            </linearGradient>
          </defs>
          <line x1="12" x2={W - 12} y1={H - 14} y2={H - 14} stroke="rgba(244,242,239,.08)" />
          <motion.path
            d={`${path} L${pts[6][0]},${H - 14} L${pts[0][0]},${H - 14} Z`}
            fill="url(#pulse-fill)"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6, duration: 0.8 }}
          />
          <motion.path
            d={path}
            fill="none"
            stroke="#ff9a3c"
            strokeWidth="2"
            strokeLinecap="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 1.2, ease: [0.22, 0.61, 0.36, 1] }}
          />
          {pts.map(([x, y], i) => (
            <g key={week[i].key}>
              <circle cx={x} cy={y} r={i === 6 ? 4 : 2.5} fill={i === 6 ? '#fff' : '#ff9a3c'} />
              <text x={x} y={H + 12} textAnchor="middle" fontSize="10" fill={i === 6 ? '#f4f2ef' : 'rgba(244,242,239,.4)'}>
                {week[i].label}
              </text>
            </g>
          ))}
        </svg>
      </div>
    </Panel>
  );
};

// ---------------------------------------------------------------------------
// Learning path: lessons as stations along a curve; practised ones light up.
// ---------------------------------------------------------------------------

export const LearningPath: React.FC<{ events: SignEvent[]; onPractise: (label: string) => void }> = ({ events, onPractise }) => {
  const practised = useMemo(() => summarize(events).practised, [events]);
  const done = LEARN_LESSONS.filter((l) => practised.has(l.label)).length;
  const next = LEARN_LESSONS.find((l) => !practised.has(l.label));
  const n = LEARN_LESSONS.length;
  const W = 640;
  const H = 120;
  const stations = LEARN_LESSONS.map((l, i) => {
    const t = i / (n - 1);
    return { lesson: l, x: 30 + t * (W - 60), y: H / 2 + Math.sin(t * Math.PI * 2) * 26 };
  });
  const curve = stations.reduce((acc, s, i) => {
    if (i === 0) return `M${s.x},${s.y}`;
    const p = stations[i - 1];
    const cx = (p.x + s.x) / 2;
    return `${acc} C${cx},${p.y} ${cx},${s.y} ${s.x},${s.y}`;
  }, '');

  return (
    <Panel>
      <PanelHeader
        index="05"
        kicker="Learning path"
        title={<>{done} of {n} <em className="text-glow">practised</em></>}
        action={
          next && (
            <button onClick={() => onPractise(next.label)} className="flex items-center gap-1.5 text-sm font-medium text-saffron hover:text-glow">
              Next: {next.label} <ArrowRight className="h-4 w-4" />
            </button>
          )
        }
      />
      <div className="overflow-x-auto px-2 pb-4">
        <svg viewBox={`0 0 ${W} ${H + 24}`} className="min-w-[560px] w-full">
          <path d={curve} fill="none" stroke="rgba(244,242,239,.12)" strokeWidth="2" strokeDasharray="3 6" />
          {stations.map(({ lesson, x, y }, i) => {
            const isDone = practised.has(lesson.label);
            const isNext = lesson === next;
            return (
              <g
                key={lesson.id}
                role="button"
                tabIndex={0}
                aria-label={`${lesson.label}${isDone ? ', practised' : ''}`}
                onClick={() => onPractise(lesson.label)}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onPractise(lesson.label)}
                className="cursor-pointer outline-none [&:focus-visible>circle]:stroke-white"
              >
                {isNext && (
                  <circle cx={x} cy={y} r="17" fill="none" stroke="#ff9a3c" strokeOpacity="0.5">
                    <animate attributeName="r" values="13;20;13" dur="2.4s" repeatCount="indefinite" />
                    <animate attributeName="stroke-opacity" values="0.6;0;0.6" dur="2.4s" repeatCount="indefinite" />
                  </circle>
                )}
                <circle
                  cx={x}
                  cy={y}
                  r="12"
                  fill={isDone ? '#ff9a3c' : '#0b0a09'}
                  stroke={isDone ? '#ffd2a8' : isNext ? '#ff9a3c' : 'rgba(244,242,239,.25)'}
                  strokeWidth="1.5"
                  style={isDone ? { filter: 'drop-shadow(0 0 8px rgba(255,154,60,.7))' } : undefined}
                />
                <text x={x} y={y + 4} textAnchor="middle" fontSize="11" fontWeight="600" fill={isDone ? '#0a0400' : 'rgba(244,242,239,.7)'}>
                  {i + 1}
                </text>
                <text x={x} y={y + 32} textAnchor="middle" fontSize="12" fill={isDone || isNext ? '#f4f2ef' : 'rgba(244,242,239,.45)'}>
                  {lesson.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </Panel>
  );
};

// ---------------------------------------------------------------------------
// SOS readiness: what will work if the SOS sign is made right now.
// ---------------------------------------------------------------------------

export const SosReadiness: React.FC<{ signedIn: boolean; accountsEnabled: boolean; contacts: number }> = ({
  signedIn,
  accountsEnabled,
  contacts,
}) => {
  const location = usePermission('geolocation');
  const items = [
    { label: 'Location can be shared', ok: location === 'granted', hint: location === 'denied' ? 'Blocked in browser settings' : 'Asked when SOS opens' },
    { label: 'Signed in', ok: signedIn, hint: accountsEnabled ? 'Keeps contacts on this screen' : 'Accounts not set up' },
    { label: 'Emergency contacts', ok: contacts > 0, hint: contacts ? `${contacts} saved` : 'None yet' },
  ];
  const ok = items.filter((i) => i.ok).length;
  const R = 26;
  const C = 2 * Math.PI * R;

  return (
    <Panel className="h-full">
      <PanelHeader index="06" kicker="SOS readiness" title={ok === items.length ? <>Ready <em className="text-glow">to help</em></> : 'Worth setting up'} />
      <div className="flex items-center gap-5 px-6 pb-2 pt-4">
        <svg viewBox="0 0 64 64" className="h-16 w-16 shrink-0 -rotate-90" aria-hidden="true">
          <circle cx="32" cy="32" r={R} fill="none" stroke="rgba(244,242,239,.08)" strokeWidth="5" />
          <motion.circle
            cx="32"
            cy="32"
            r={R}
            fill="none"
            stroke={ok === items.length ? '#ff9a3c' : '#fbbf24'}
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray={C}
            initial={{ strokeDashoffset: C }}
            animate={{ strokeDashoffset: C * (1 - ok / items.length) }}
            transition={{ duration: 1, ease: [0.22, 0.61, 0.36, 1] }}
          />
        </svg>
        <ul className="flex-1 space-y-2.5">
          {items.map((i) => (
            <li key={i.label} className="flex items-start gap-2.5 text-sm">
              <span className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full ${i.ok ? 'bg-saffron text-black' : 'bg-white/10 text-white/40'}`}>
                {i.ok ? <Check className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
              </span>
              <span>
                <span className={i.ok ? 'text-white/85' : 'text-white/60'}>{i.label}</span>
                <span className="block text-xs text-white/35">{i.hint}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
      {accountsEnabled && (
        <div className="px-6 pb-6 pt-3">
          <Link to={signedIn ? '/account#contacts' : '/login?next=/account'} className="text-sm font-medium text-saffron hover:text-glow">
            {signedIn ? 'Manage emergency contacts →' : 'Log in to add contacts →'}
          </Link>
        </div>
      )}
    </Panel>
  );
};

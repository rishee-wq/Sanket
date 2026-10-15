import React, { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { ArrowRight, Check, Minus } from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider';
import { useEmergencyContacts } from '../../auth/useEmergencyContacts';
import { HandField } from '../../components/landing/HandField';
import { LEARN_LESSONS } from '../../data/learnLessons';
import { SIGN_ANIMATIONS } from '../../data/signAnimations';
import { useHandLandmarker } from '../../hooks/useHandLandmarker';
import type { PredictorKind } from '../../lib/predictor';
import { relativeTime, summarize, useSignHistory } from '../../lib/signHistory';
import type { AppView } from '../../components/app/AppShell';
import { Link } from '../../lib/router';

const MiniHand = lazy(() => import('../../components/app/MiniHand'));
const EASE = [0.22, 0.61, 0.36, 1] as const;

function greeting(now = new Date()) {
  const h = now.getHours();
  return h < 5 ? 'Good night' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

function usePermission(name: 'geolocation' | 'camera'): PermissionState | 'unknown' {
  const [state, setState] = useState<PermissionState | 'unknown'>('unknown');
  useEffect(() => {
    let status: PermissionStatus | null = null;
    const update = () => status && setState(status.state);
    navigator.permissions
      ?.query({ name: name as PermissionName })
      .then((s) => {
        status = s;
        update();
        s.addEventListener('change', update);
      })
      .catch(() => undefined);
    return () => status?.removeEventListener('change', update);
  }, [name]);
  return state;
}

const Tile: React.FC<{ className?: string; children: React.ReactNode; delay?: number }> = ({ className = '', children, delay = 0 }) => (
  <motion.section
    initial={{ opacity: 0, y: 18 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.6, delay, ease: EASE }}
    className={`surface relative overflow-hidden rounded-[28px] ${className}`}
  >
    {children}
  </motion.section>
);

const Kicker: React.FC<{ children: React.ReactNode; tone?: string }> = ({ children, tone = 'text-white/40' }) => (
  <p className={`text-[10px] font-semibold uppercase tracking-[.24em] ${tone}`}>{children}</p>
);

interface Props {
  predictorKind: PredictorKind | null;
  onGo: (view: AppView, lesson?: string) => void;
}

export const HomeView: React.FC<Props> = ({ predictorKind, onGo }) => {
  const { user, profile, enabled } = useAuth();
  const { contacts } = useEmergencyContacts();
  const events = useSignHistory();
  const landmarker = useHandLandmarker(); // also warms up hand tracking
  const location = usePermission('geolocation');
  const camera = usePermission('camera');
  const s = useMemo(() => summarize(events), [events]);
  const name = profile?.full_name?.split(' ')[0];

  const lessons = LEARN_LESSONS.filter((l) => SIGN_ANIMATIONS[l.label]);
  const next = lessons.find((l) => !s.practised.has(l.label)) ?? lessons[0];
  const done = LEARN_LESSONS.filter((l) => s.practised.has(l.label)).length;
  const recent = events.filter((e) => e.source === 'conversation').slice(0, 14);

  const sosChecks = [
    { label: 'Location', ok: location === 'granted' },
    { label: 'Signed in', ok: !!user },
    { label: 'Contacts', ok: contacts.length > 0 },
  ];
  const sosReady = sosChecks.every((c) => c.ok);

  // Week waveform
  const W = 320;
  const H = 90;
  const max = Math.max(1, ...s.week.map((d) => d.count));
  const pts = s.week.map((d, i) => [10 + (i * (W - 20)) / 6, H - 12 - (d.count / max) * (H - 26)] as const);
  const wave = pts.reduce((acc, [x, y], i) => {
    if (i === 0) return `M${x},${y}`;
    const [px, py] = pts[i - 1];
    const cx = (px + x) / 2;
    return `${acc} C${cx},${py} ${cx},${y} ${x},${y}`;
  }, '');

  const status = [
    landmarker.status === 'ready' ? 'Hand tracking ready' : landmarker.status === 'loading' ? 'Starting hand tracking' : 'Hand tracking unavailable',
    predictorKind === 'tfjs' ? 'Trained model' : 'Demo model',
    camera === 'denied' ? 'Camera blocked' : null,
  ].filter(Boolean);

  return (
    <div className="mx-auto max-w-[1440px] px-5 pt-6 sm:px-8">
      <motion.header initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: EASE }} className="mb-8">
        <Kicker tone="text-saffron">{new Date().toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })}</Kicker>
        <h1 className="mt-3 font-serif text-[clamp(44px,6vw,80px)] leading-[0.95]">
          {greeting()}
          {name ? (
            <>
              , <em className="text-glow">{name}.</em>
            </>
          ) : (
            '.'
          )}
        </h1>
      </motion.header>

      <div className="grid auto-rows-[minmax(190px,auto)] gap-4 md:grid-cols-2 xl:grid-cols-4">
        {/* Converse */}
        <Tile className="flex flex-col md:col-span-2 md:row-span-2">
          <div className="absolute inset-0 opacity-70">
            <HandField density={0.9} />
          </div>
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-black/20" />
          <div className="pointer-events-none absolute -left-20 -top-24 h-[420px] w-[420px] rounded-full bg-orange-900/30 blur-[100px]" />
          <div className="relative flex flex-1 flex-col p-8">
            <Kicker tone="text-saffron">Converse</Kicker>
            <div className="mt-auto">
              <h2 className="font-serif text-[clamp(44px,5vw,72px)] leading-[0.95]">
                Talk with
                <br />
                your <em className="text-glow">hands.</em>
              </h2>
              <p className="mt-4 max-w-sm text-[15px] text-white/60">Signs become speech. Replies become large captions.</p>
              <div className="mt-7 flex flex-wrap items-center gap-4">
                <button onClick={() => onGo('converse')} className="group flex items-center gap-3 rounded-full bg-white py-1.5 pl-5 pr-1.5 font-semibold text-black">
                  Start a conversation
                  <span className="grid h-9 w-9 place-items-center rounded-full bg-saffron-deep">
                    <ArrowRight className="h-4 w-4 text-white transition-transform group-hover:translate-x-0.5" />
                  </span>
                </button>
                <span className="flex items-center gap-2 text-xs text-white/50">
                  <span className={`live-dot ${landmarker.status === 'ready' ? 'on' : 'opacity-40 shadow-none'}`} />
                  {status.join(' · ')}
                </span>
              </div>
            </div>
          </div>
        </Tile>

        {/* Continue learning */}
        <Tile className="md:col-span-2" delay={0.05}>
          <div className="absolute inset-y-0 right-0 w-1/2">
            <Suspense fallback={null}>
              <MiniHand label={next.label} />
            </Suspense>
          </div>
          <div className="pointer-events-none absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(ellipse_at_60%_50%,rgba(255,140,40,.14),transparent_65%)]" />
          <div className="relative flex h-full max-w-[55%] flex-col p-7">
            <Kicker>Continue learning</Kicker>
            <p className="mt-3 font-serif text-5xl leading-none">{next.label}</p>
            <p className="mt-2 text-sm text-white/50">{next.instruction}</p>
            <div className="mt-auto pt-5">
              <div className="flex items-center justify-between text-xs text-white/45">
                <span>
                  {done} of {LEARN_LESSONS.length} practised
                </span>
              </div>
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/[.07]">
                <motion.div
                  className="h-full rounded-full bg-saffron"
                  initial={{ width: 0 }}
                  animate={{ width: `${(done / LEARN_LESSONS.length) * 100}%` }}
                  transition={{ duration: 1, delay: 0.3, ease: EASE }}
                />
              </div>
              <button onClick={() => onGo('learn', next.label)} className="mt-4 text-sm font-medium text-saffron hover:text-glow">
                Practise {next.label} →
              </button>
            </div>
          </div>
        </Tile>

        {/* Today */}
        <Tile className="p-7" delay={0.1}>
          <Kicker>Today</Kicker>
          <p className="mt-4 font-serif text-[88px] leading-none">{s.signsToday}</p>
          <p className="text-sm text-white/45">signs spoken</p>
        </Tile>

        {/* Streak */}
        <Tile className="p-7" delay={0.15}>
          <Kicker>Streak</Kicker>
          <p className="mt-4 font-serif text-[88px] leading-none">{s.streak}</p>
          <div className="flex items-center justify-between">
            <p className="text-sm text-white/45">{s.streak === 1 ? 'day' : 'days'} in a row</p>
            <div className="flex gap-1" aria-hidden="true">
              {s.week.map((d) => (
                <span key={d.key} className={`h-1.5 w-1.5 rounded-full ${d.count ? 'bg-saffron' : 'bg-white/15'}`} />
              ))}
            </div>
          </div>
        </Tile>

        {/* SOS */}
        <Tile className="md:col-span-2" delay={0.2}>
          <div className="pointer-events-none absolute -right-16 -top-16 h-72 w-72 rounded-full bg-rose-600/20 blur-[80px]" />
          <div className="relative flex h-full flex-col p-7">
            <Kicker tone="text-rose-300">SOS</Kicker>
            <p className="mt-3 font-serif text-4xl leading-none">{sosReady ? 'Ready to help.' : 'Worth setting up.'}</p>
            <div className="mt-5 flex flex-wrap gap-2">
              {sosChecks.map((c) => (
                <span
                  key={c.label}
                  className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs ${
                    c.ok ? 'border-white/15 text-white/80' : 'border-white/[.08] text-white/40'
                  }`}
                >
                  {c.ok ? <Check className="h-3 w-3 text-saffron" /> : <Minus className="h-3 w-3" />}
                  {c.label}
                </span>
              ))}
            </div>
            <div className="mt-auto flex items-center gap-4 pt-5">
              <button onClick={() => onGo('sos')} className="rounded-full bg-rose-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-rose-400">
                Open SOS
              </button>
              {enabled && !contacts.length && (
                <Link to={user ? '/account#contacts' : '/login?next=/account'} className="text-sm text-white/50 hover:text-white">
                  {user ? 'Add contacts' : 'Log in to add contacts'}
                </Link>
              )}
            </div>
          </div>
        </Tile>

        {/* Recent */}
        <Tile className="p-7 md:col-span-2" delay={0.25}>
          <div className="flex items-center justify-between">
            <Kicker>Recently signed</Kicker>
            {recent[0] && <span className="text-xs text-white/35">{relativeTime(recent[0].ts)}</span>}
          </div>
          {recent.length ? (
            <div className="mt-5 flex flex-wrap gap-2">
              {recent.map((e, i) => (
                <span
                  key={e.ts}
                  className={`rounded-full px-3.5 py-1.5 text-sm ${i === 0 ? 'bg-white text-black' : 'border border-white/10 text-white/70'}`}
                  title={new Date(e.ts).toLocaleString()}
                >
                  {e.label}
                </span>
              ))}
            </div>
          ) : (
            <p className="mt-5 max-w-xs text-sm text-white/45">Signs you make in Converse show up here. Everything stays on this device.</p>
          )}
        </Tile>

        {/* Week */}
        <Tile className="p-7 md:col-span-2" delay={0.3}>
          <div className="flex items-center justify-between">
            <Kicker>This week</Kicker>
            <span className="font-mono text-xs text-white/40">{s.week.reduce((n, d) => n + d.count, 0)} signs</span>
          </div>
          <svg viewBox={`0 0 ${W} ${H + 16}`} className="mt-4 w-full" role="img" aria-label={`Signs per day: ${s.week.map((d) => d.count).join(', ')}`}>
            <defs>
              <linearGradient id="home-wave" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor="#ff9a3c" stopOpacity=".25" />
                <stop offset="1" stopColor="#ff9a3c" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={`${wave} L${pts[6][0]},${H - 12} L${pts[0][0]},${H - 12} Z`} fill="url(#home-wave)" />
            <motion.path d={wave} fill="none" stroke="#ff9a3c" strokeWidth="2" strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.2, ease: EASE }} />
            {pts.map(([x, y], i) => (
              <g key={s.week[i].key}>
                <circle cx={x} cy={y} r={i === 6 ? 3.5 : 2.2} fill={i === 6 ? '#fff' : '#ff9a3c'} />
                <text x={x} y={H + 12} textAnchor="middle" fontSize="9" fill={i === 6 ? '#f4f2ef' : 'rgba(244,242,239,.35)'}>
                  {s.week[i].label}
                </text>
              </g>
            ))}
          </svg>
        </Tile>
      </div>
      <p className="mt-6 text-center text-xs text-white/25">Activity is stored only in this browser.</p>
    </div>
  );
};

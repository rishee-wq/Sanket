import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { ChevronDown, Volume2, VolumeX } from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider';
import type { PredictorKind } from '../../lib/predictor';
import { Link } from '../../lib/router';
import { SanketMark, Wordmark } from '../Logo';

export type AppView = 'home' | 'converse' | 'learn' | 'sos';

const NAV: { view: AppView; label: string }[] = [
  { view: 'home', label: 'Home' },
  { view: 'converse', label: 'Converse' },
  { view: 'learn', label: 'Learn' },
  { view: 'sos', label: 'SOS' },
];

interface ShellProps {
  view: AppView;
  onView: (v: AppView) => void;
  predictorKind: PredictorKind;
  activeKind: PredictorKind | null;
  fallbackReason: string | null;
  onPredictorKind: (k: PredictorKind) => void;
  soundOn: boolean;
  onToggleSound: () => void;
  children: React.ReactNode;
}

/** Segmented pill nav with a sliding highlight. */
const PillNav: React.FC<{ view: AppView; onView: (v: AppView) => void; id: string }> = ({ view, onView, id }) => (
  <nav className="surface-glass flex items-center rounded-full p-1" aria-label="App sections">
    {NAV.map(({ view: v, label }) => {
      const active = v === view;
      const sos = v === 'sos';
      return (
        <button
          key={v}
          onClick={() => onView(v)}
          aria-current={active ? 'page' : undefined}
          className={`relative rounded-full px-4 py-2 text-sm font-medium transition-colors sm:px-5 ${
            active ? (sos ? 'text-white' : 'text-black') : sos ? 'text-rose-300/90 hover:text-rose-200' : 'text-white/60 hover:text-white'
          }`}
        >
          {active && (
            <motion.span
              layoutId={`pill-${id}`}
              className={`absolute inset-0 rounded-full ${sos ? 'bg-rose-500' : 'bg-white'}`}
              transition={{ type: 'spring', stiffness: 420, damping: 34 }}
            />
          )}
          <span className="relative">{label}</span>
        </button>
      );
    })}
  </nav>
);

/** Which recognizer is running, with a small menu to switch. */
const EngineChip: React.FC<Pick<ShellProps, 'predictorKind' | 'activeKind' | 'fallbackReason' | 'onPredictorKind'>> = ({
  predictorKind,
  activeKind,
  fallbackReason,
  onPredictorKind,
}) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);

  const label = activeKind === null ? 'Loading model' : activeKind === 'tfjs' ? 'Trained model' : 'Demo model';
  const options: { kind: PredictorKind; title: string; text: string }[] = [
    {
      kind: 'tfjs',
      title: 'Trained model',
      text: fallbackReason ? 'Not available yet: no model in public/model' : 'TensorFlow.js network from public/model',
    },
    { kind: 'mock', title: 'Demo model', text: 'Rule-based shapes; confidence is simulated' },
  ];

  return (
    <div ref={ref} className="relative hidden lg:block">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="surface-glass flex items-center gap-2 rounded-full px-3.5 py-2 text-xs text-white/70 hover:text-white"
      >
        <span className={`live-dot ${activeKind ? 'on' : 'opacity-40'}`} />
        {label}
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="surface-glass absolute right-0 top-full mt-2 w-72 rounded-2xl p-1.5"
        >
          {options.map((o) => (
            <button
              key={o.kind}
              onClick={() => {
                onPredictorKind(o.kind);
                setOpen(false);
              }}
              className={`w-full rounded-xl px-3.5 py-2.5 text-left transition-colors hover:bg-white/[.06] ${
                predictorKind === o.kind ? 'bg-white/[.06]' : ''
              }`}
            >
              <span className="block text-sm text-white">{o.title}</span>
              <span className="block text-xs text-white/45">{o.text}</span>
            </button>
          ))}
        </motion.div>
      )}
    </div>
  );
};

export const AppShell: React.FC<ShellProps> = ({ view, onView, soundOn, onToggleSound, children, ...engine }) => {
  const { user, profile, enabled } = useAuth();
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);
  const initials = (profile?.full_name || user?.email || '?')
    .split(/[\s@]/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');

  return (
    <div className="min-h-dvh bg-black text-ink">
      <header
        className={`fixed inset-x-0 top-0 z-50 transition-[background,border-color] duration-500 ${
          scrolled ? 'border-b border-white/[.06] bg-black/70 backdrop-blur-xl' : 'border-b border-transparent'
        }`}
      >
        <div className="mx-auto flex h-[72px] max-w-[1440px] items-center justify-between gap-4 px-5 sm:px-8">
          <Link to="/" className="flex items-center gap-2.5 text-white" aria-label="Sanket home">
            <SanketMark className="h-6 w-6" accent="#ff9a3c" />
            <Wordmark className="text-[22px]" />
          </Link>

          <div className="absolute left-1/2 hidden -translate-x-1/2 md:block">
            <PillNav view={view} onView={onView} id="top" />
          </div>

          <div className="flex items-center gap-2">
            <EngineChip {...engine} />
            <button
              onClick={onToggleSound}
              aria-label={soundOn ? 'Mute sound cues' : 'Turn on sound cues'}
              className="surface-glass grid h-9 w-9 place-items-center rounded-full text-white/70 hover:text-white"
            >
              {soundOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4 text-white/40" />}
            </button>
            {enabled &&
              (user ? (
                <Link
                  to="/account"
                  aria-label="Your account"
                  className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-saffron to-saffron-deep text-xs font-semibold text-black"
                >
                  {initials}
                </Link>
              ) : (
                <Link to="/login?next=/app" className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-black">
                  Log in
                </Link>
              ))}
          </div>
        </div>
      </header>

      {/* Mobile dock */}
      <div className="fixed inset-x-0 bottom-[calc(14px+var(--safe-bottom))] z-50 flex justify-center md:hidden">
        <PillNav view={view} onView={onView} id="dock" />
      </div>

      <main className="pb-28 pt-[72px] md:pb-10">{children}</main>
    </div>
  );
};

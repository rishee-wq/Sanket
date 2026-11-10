import React from 'react';
import { FlaskConical, GraduationCap, Languages, Siren, UserRound, Volume2, VolumeX } from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider';
import type { EngineStatus, ModelBundle } from '../../hooks/useSignEngine';
import { Link } from '../../lib/router';
import { SanketMark, Wordmark } from '../Logo';

export type AppView = 'translate' | 'learn' | 'lab' | 'sos';

const NAV: { view: AppView; label: string; hindi: string; icon: React.FC<{ className?: string }> }[] = [
  { view: 'translate', label: 'Translate', hindi: 'अनुवाद', icon: Languages },
  { view: 'learn', label: 'Learn', hindi: 'सीखें', icon: GraduationCap },
  { view: 'lab', label: 'Model lab', hindi: 'प्रयोगशाला', icon: FlaskConical },
];

interface ShellProps {
  view: AppView;
  onView: (v: AppView) => void;
  status: EngineStatus;
  bundle: ModelBundle | null;
  soundOn: boolean;
  onToggleSound: () => void;
  children: React.ReactNode;
}

/** One line saying which models are running. */
const ModelChip: React.FC<Pick<ShellProps, 'status' | 'bundle'>> = ({ status, bundle }) => {
  if (status === 'loading') return <span className="chip bg-card">Loading models…</span>;
  if (status === 'error' || !bundle)
    return (
      <span className="chip border-alarm bg-alarm text-white" title={bundle?.problems.join('\n')}>
        No model found
      </span>
    );
  const parts = [
    bundle.staticModel && `${bundle.staticModel.classes - (bundle.staticModel.backgroundIndex >= 0 ? 1 : 0)} letters`,
    bundle.dynamicModel && `${bundle.dynamicModel.classes - 1} words`,
  ].filter(Boolean);
  return (
    <span className="chip bg-card" title={[`Backend: ${bundle.backend}`, ...bundle.problems].join('\n')}>
      <span className="h-2 w-2 bg-go" /> {parts.join(' + ')} · {bundle.backend}
    </span>
  );
};

export const AppShell: React.FC<ShellProps> = ({ view, onView, status, bundle, soundOn, onToggleSound, children }) => {
  const { user, profile, enabled } = useAuth();
  const account = user ? '/account' : '/login?next=/app';

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 border-b-2 border-ink bg-paper pt-[var(--safe-top)]">
        <div className="mx-auto flex h-14 max-w-[1500px] items-center gap-3 px-[var(--pad)]">
          <Link to="/" className="flex shrink-0 items-center gap-2.5" aria-label="Sanket home">
            <SanketMark className="h-8 w-8" />
            <Wordmark className="hidden text-[26px] sm:inline-flex" />
          </Link>

          <nav className="ml-2 hidden h-full items-stretch md:flex" aria-label="App sections">
            {NAV.map(({ view: v, label, icon: Icon }) => (
              <button
                key={v}
                onClick={() => onView(v)}
                aria-current={v === view ? 'page' : undefined}
                className={`relative flex items-center gap-2 px-4 text-[15px] font-semibold ${
                  v === view ? 'text-ink' : 'text-mute hover:text-ink'
                }`}
              >
                <Icon className="h-[18px] w-[18px]" />
                {label}
                {v === view && <span className="absolute inset-x-3 -bottom-[2px] h-[6px] bg-signal ring-2 ring-ink" />}
              </button>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <span className="hidden lg:block">
              <ModelChip status={status} bundle={bundle} />
            </span>
            <button className="btn btn-bare btn-icon" onClick={onToggleSound} aria-label={soundOn ? 'Mute sounds' : 'Unmute sounds'} aria-pressed={!soundOn}>
              {soundOn ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
            </button>
            {enabled && (
              <Link to={account} className="btn btn-bare btn-icon" aria-label={user ? `Account: ${profile?.full_name ?? user.email}` : 'Log in'}>
                <UserRound className="h-5 w-5" />
              </Link>
            )}
            <button
              onClick={() => onView('sos')}
              aria-current={view === 'sos' ? 'page' : undefined}
              className={`btn btn-alarm ${view === 'sos' ? 'ring-2 ring-ink ring-offset-2 ring-offset-paper' : ''}`}
            >
              <Siren className="h-[18px] w-[18px]" /> SOS
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1500px] flex-1 px-[var(--pad)] pb-[calc(76px+var(--safe-bottom))] pt-[var(--pad)] md:pb-[var(--pad)]">
        {children}
      </main>

      {/* Phones: the sections move to a bottom bar within thumb reach. */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-3 border-t-2 border-ink bg-paper pb-[var(--safe-bottom)] md:hidden"
        aria-label="App sections"
      >
        {NAV.map(({ view: v, label, icon: Icon }) => (
          <button
            key={v}
            onClick={() => onView(v)}
            aria-current={v === view ? 'page' : undefined}
            className={`flex h-[60px] flex-col items-center justify-center gap-0.5 text-[12px] font-semibold ${
              v === view ? 'bg-signal text-ink' : 'text-mute'
            }`}
          >
            <Icon className="h-5 w-5" />
            {label}
          </button>
        ))}
      </nav>
    </div>
  );
};

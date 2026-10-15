import React from 'react';
import { AppMode } from '../types/isl';
import { Home, MessageSquare, AlertTriangle, GraduationCap, Volume2, VolumeX, HelpCircle, UserRound } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import type { PredictorKind } from '../lib/predictor';
import { Link } from '../lib/router';
import { SanketMark, Wordmark } from './Logo';

interface NavbarProps {
  currentMode: AppMode;
  onSelectMode: (mode: AppMode) => void;
  /** Requested predictor. */
  predictorKind: PredictorKind;
  /** Predictor actually in use (null while loading). */
  activePredictorKind: PredictorKind | null;
  fallbackReason: string | null;
  onChangePredictorKind: (kind: PredictorKind) => void;
  soundEnabled: boolean;
  onToggleSound: () => void;
  onOpenHelp: () => void;
  /** Transparent over the dashboard hero, solid elsewhere. */
  overHero: boolean;
}

const TABS: { mode: AppMode; label: string; Icon: typeof Home }[] = [
  { mode: 'home', label: 'Home', Icon: Home },
  { mode: 'conversation', label: 'Conversation', Icon: MessageSquare },
  { mode: 'learn', label: 'Learn', Icon: GraduationCap },
  { mode: 'sos', label: 'SOS', Icon: AlertTriangle },
];

const iconBtn = 'grid h-9 w-9 place-items-center rounded-full text-white/70 transition-colors hover:bg-white/[.08] hover:text-white';

export const Navbar: React.FC<NavbarProps> = ({
  currentMode,
  onSelectMode,
  predictorKind,
  activePredictorKind,
  fallbackReason,
  onChangePredictorKind,
  soundEnabled,
  onToggleSound,
  onOpenHelp,
  overHero,
}) => {
  const { user, enabled } = useAuth();

  return (
    <header
      className={`sticky top-0 z-40 h-[72px] transition-colors duration-500 ${
        overHero ? 'bg-transparent' : 'border-b border-white/[.07] bg-black/75 backdrop-blur-xl'
      }`}
    >
      <div className="mx-auto flex h-full max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        <Link to="/" className="flex items-center gap-2.5 text-white" aria-label="Sanket home">
          <SanketMark className="h-6 w-6" accent="#ff9a3c" />
          <Wordmark className="hidden text-[22px] sm:inline" />
        </Link>

        {/* Mode switcher */}
        <nav className="flex items-center rounded-full border border-white/10 bg-black/50 p-1 backdrop-blur" aria-label="Modes">
          {TABS.map(({ mode, label, Icon }) => {
            const active = currentMode === mode;
            const sos = mode === 'sos';
            return (
              <button
                key={mode}
                onClick={() => onSelectMode(mode)}
                aria-current={active ? 'page' : undefined}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-all sm:px-4 ${
                  active
                    ? sos
                      ? 'bg-rose-600 text-white'
                      : 'bg-white text-black'
                    : sos
                    ? 'text-rose-300 hover:bg-rose-500/10'
                    : 'text-white/65 hover:text-white'
                }`}
              >
                <Icon className="h-4 w-4" />
                <span className={active ? 'hidden sm:inline' : 'hidden md:inline'}>{label}</span>
              </button>
            );
          })}
        </nav>

        <div className="flex items-center gap-1">
          <label className="hidden items-center lg:flex">
            <span className="sr-only">Recognition model</span>
            <select
              value={predictorKind}
              onChange={(e) => onChangePredictorKind(e.target.value as PredictorKind)}
              title={
                predictorKind === 'tfjs' && activePredictorKind === 'mock'
                  ? `No trained model loaded (${fallbackReason}). Using the mock predictor.`
                  : 'Recognition model'
              }
              className="cursor-pointer rounded-full border border-white/10 bg-black/50 px-3 py-1.5 text-xs text-white/75 outline-none hover:border-white/25"
            >
              <option value="tfjs" className="bg-black">
                {activePredictorKind === 'mock' && predictorKind === 'tfjs' ? 'Model: mock (no trained model)' : 'Model: trained'}
              </option>
              <option value="mock" className="bg-black">
                Model: mock (rule-based)
              </option>
            </select>
          </label>
          <button
            onClick={onToggleSound}
            className={iconBtn}
            aria-label={soundEnabled ? 'Mute sound cues' : 'Turn on sound cues'}
            title={soundEnabled ? 'Mute sound cues' : 'Turn on sound cues'}
          >
            {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4 text-white/40" />}
          </button>
          <button onClick={onOpenHelp} className={iconBtn} aria-label="Guide and help" title="Guide and help">
            <HelpCircle className="h-4 w-4" />
          </button>
          {enabled &&
            (user ? (
              <Link to="/account" className={iconBtn} aria-label="Your account" title="Your account">
                <UserRound className="h-4 w-4" />
              </Link>
            ) : (
              <Link
                to="/login?next=/app"
                className="ml-1 rounded-full bg-white px-4 py-1.5 text-sm font-semibold text-black hover:shadow-[0_0_20px_rgba(255,255,255,0.3)]"
              >
                Log in
              </Link>
            ))}
        </div>
      </div>
    </header>
  );
};

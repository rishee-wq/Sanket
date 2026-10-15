import React from 'react';
import { AppMode } from '../types/isl';
import { MessageSquare, AlertTriangle, GraduationCap, Volume2, VolumeX, Sparkles, HelpCircle, UserRound } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { Link } from '../lib/router';
import { SanketMark, Wordmark } from './Logo';
import type { PredictorKind } from '../lib/predictor';

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
}

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
}) => {
  const { user, enabled } = useAuth();
  return (
    <header className="sticky top-0 z-40 border-b border-slate-800 bg-slate-950/90 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-2">
          {/* Logo & Branding */}
          <Link to="/" className="flex items-center gap-2.5 text-white" aria-label="Sanket home">
            <SanketMark className="w-7 h-7" accent="#ff9a3c" />
            <div>
              <Wordmark className="text-2xl" />
              <p className="text-[11px] text-slate-400 hidden sm:block mt-0.5">Indian Sign Language · voice & text</p>
            </div>
          </Link>

          {/* Navigation Modes */}
          <nav className="flex items-center p-1 bg-slate-900 border border-slate-800 rounded-xl">
            <button
              onClick={() => onSelectMode('conversation')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-all ${
                currentMode === 'conversation'
                  ? 'bg-amber-500 text-slate-950 shadow-sm shadow-amber-500/30'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <MessageSquare className="w-4 h-4" />
              <span>Conversation</span>
            </button>

            <button
              onClick={() => onSelectMode('learn')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-all ${
                currentMode === 'learn'
                  ? 'bg-cyan-500 text-slate-950 shadow-sm shadow-cyan-500/30'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <GraduationCap className="w-4 h-4" />
              <span>Learn ISL</span>
            </button>

            <button
              onClick={() => onSelectMode('sos')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-all ${
                currentMode === 'sos'
                  ? 'bg-rose-600 text-white shadow-sm shadow-rose-600/40 animate-pulse'
                  : 'text-rose-400 hover:text-rose-300 hover:bg-rose-500/10'
              }`}
            >
              <AlertTriangle className="w-4 h-4" />
              <span>SOS Alert</span>
            </button>
          </nav>

          {/* Controls: Engine Selector, Sound, Help */}
          <div className="flex items-center gap-2">
            {/* Predictor Mode Selector */}
            <div className="hidden md:flex items-center bg-slate-900 border border-slate-800 rounded-lg p-0.5 text-xs">
              <span className="px-2 text-slate-400 text-[11px] flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-amber-400" /> Model:
              </span>
              <select
                value={predictorKind}
                onChange={(e) => onChangePredictorKind(e.target.value as PredictorKind)}
                aria-label="Recognition model"
                className="bg-transparent text-slate-200 text-xs px-2 py-1 rounded outline-none cursor-pointer hover:bg-slate-800"
              >
                <option value="tfjs" className="bg-slate-900 text-slate-100">
                  Trained model (TF.js)
                </option>
                <option value="mock" className="bg-slate-900 text-slate-100">
                  Mock (rule-based)
                </option>
              </select>
              {predictorKind === 'tfjs' && activePredictorKind === 'mock' && (
                <span
                  title={`No trained model loaded (${fallbackReason}). Using the mock predictor.`}
                  className="px-2 text-[11px] text-amber-400"
                >
                  using mock
                </span>
              )}
            </div>

            {/* Sound Toggle */}
            <button
              onClick={onToggleSound}
              title={soundEnabled ? 'Mute sound chimes' : 'Enable sound chimes'}
              className={`p-2 rounded-lg border transition-colors ${
                soundEnabled
                  ? 'border-slate-800 bg-slate-900 text-amber-400 hover:bg-slate-800'
                  : 'border-slate-800 bg-slate-900 text-slate-500 hover:bg-slate-800'
              }`}
            >
              {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>

            {/* Account */}
            {enabled &&
              (user ? (
                <Link
                  to="/account"
                  title="Your account"
                  aria-label="Your account"
                  className="p-2 rounded-lg border border-slate-800 bg-slate-900 text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
                >
                  <UserRound className="w-4 h-4" />
                </Link>
              ) : (
                <Link
                  to="/login?next=/app"
                  className="px-3 py-1.5 rounded-lg border border-slate-800 bg-slate-900 text-xs font-semibold text-slate-200 hover:text-white hover:bg-slate-800 transition-colors"
                >
                  Log in
                </Link>
              ))}

            {/* Help & Guide Modal Trigger */}
            <button
              onClick={onOpenHelp}
              title="Indian Sign Language Guide & Help"
              className="p-2 rounded-lg border border-slate-800 bg-slate-900 text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <HelpCircle className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};

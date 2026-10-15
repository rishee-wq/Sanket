import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, MessageSquare, GraduationCap, AlertTriangle } from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider';
import { Link, navigate } from '../../lib/router';
import { SanketMark, Wordmark } from '../Logo';

const MODES = [
  { to: '/app?view=converse', label: 'Conversation', text: 'Signs to speech, speech to captions', Icon: MessageSquare },
  { to: '/app?view=learn', label: 'Learn ISL', text: 'Practise signs with a live match score', Icon: GraduationCap },
  { to: '/app?view=sos', label: 'SOS', text: 'Emergency alert with your location', Icon: AlertTriangle },
];

const LINKS = [
  { to: '/#signs', label: 'Who It Helps' },
  { to: '/#how', label: 'How It Works' },
  { to: '/app?view=learn', label: 'Learn ISL' },
];

/** Fixed, transparent landing navbar with a full-screen menu on small screens. */
export const LandingNav: React.FC<{ visible: boolean }> = ({ visible }) => {
  const { user, enabled } = useAuth();
  const [modesOpen, setModesOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const modesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!modesOpen) return;
    const onDown = (e: PointerEvent) => {
      if (!modesRef.current?.contains(e.target as Node)) setModesOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [modesOpen]);

  useEffect(() => {
    document.body.classList.toggle('locked', menuOpen);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenuOpen(false);
        setModesOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  const go = (to: string) => {
    setMenuOpen(false);
    navigate(to);
  };

  const signedIn = enabled && user;

  return (
    <>
      <header
        className="fixed top-0 inset-x-0 z-50 flex items-center justify-between bg-transparent px-6 py-4 pt-[calc(1rem+var(--safe-top))] transition-opacity duration-[1200ms] delay-150"
        style={{ opacity: visible ? 1 : 0 }}
      >
        <Link to="/" className="flex items-center gap-2.5 text-white" aria-label="Sanket home">
          <span id="nav-logo" className="block h-6 w-6">
            <SanketMark className="h-6 w-6" />
          </span>
          <Wordmark className="text-[22px] hidden sm:inline" />
        </Link>

        <nav className="hidden md:flex items-center gap-8 text-sm font-medium" aria-label="Main">
          <div ref={modesRef} className="relative">
            <button
              onClick={() => setModesOpen((o) => !o)}
              aria-expanded={modesOpen}
              className="flex items-center gap-1 text-white/80 hover:text-white transition-colors"
            >
              Modes <ChevronDown className={`w-4 h-4 transition-transform ${modesOpen ? 'rotate-180' : ''}`} />
            </button>
            {modesOpen && (
              <div className="absolute left-1/2 top-full mt-3 w-72 -translate-x-1/2 rounded-2xl border border-white/10 bg-[#0b0b0b]/95 p-2 shadow-2xl backdrop-blur-xl">
                {MODES.map(({ to, label, text, Icon }) => (
                  <Link
                    key={label}
                    to={to}
                    onClick={() => setModesOpen(false)}
                    className="flex items-start gap-3 rounded-xl px-3 py-2.5 hover:bg-white/5"
                  >
                    <Icon className="mt-0.5 h-4 w-4 text-saffron" />
                    <span>
                      <span className="block text-white">{label}</span>
                      <span className="block text-xs text-white/55">{text}</span>
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>
          {LINKS.map((l) => (
            <Link key={l.label} to={l.to} className="text-white/80 hover:text-white transition-colors">
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-5">
          {signedIn ? (
            <Link to="/account" className="hidden sm:block text-sm font-medium text-white/80 hover:text-white">
              Account
            </Link>
          ) : enabled ? (
            <Link to="/login" className="hidden sm:block text-sm font-medium text-white/80 hover:text-white">
              Log in
            </Link>
          ) : null}
          <Link
            to={signedIn || !enabled ? '/app' : '/signup'}
            className="rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-black transition-shadow hover:shadow-[0_0_20px_rgba(255,255,255,0.3)]"
          >
            {signedIn || !enabled ? 'Open App' : 'Get Started'}
          </Link>
          <button
            onClick={() => setMenuOpen((o) => !o)}
            aria-expanded={menuOpen}
            aria-controls="landing-menu"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            className="group md:hidden relative z-[90] flex min-h-11 min-w-11 flex-col items-end justify-center"
          >
            <span className="relative block h-5 w-10">
              <i
                className="absolute inset-x-0 top-1/2 h-px bg-white transition-transform duration-500"
                style={{ transform: menuOpen ? 'rotate(45deg)' : 'translateY(-5px)' }}
              />
              <i
                className="absolute right-0 top-1/2 h-px bg-white transition-all duration-500"
                style={{ width: menuOpen ? '100%' : '75%', transform: menuOpen ? 'rotate(-45deg)' : 'translateY(5px)' }}
              />
            </span>
          </button>
        </div>
      </header>

      {/* Full-screen menu (small screens) */}
      <div
        id="landing-menu"
        className="fixed inset-0 z-[80] grid place-items-center bg-[#050505] transition-[clip-path] duration-[850ms] ease-soft"
        style={{ clipPath: menuOpen ? 'inset(0)' : 'inset(0 0 100% 0)', pointerEvents: menuOpen ? 'auto' : 'none' }}
        aria-hidden={!menuOpen}
      >
        <nav className="flex flex-col gap-[clamp(4px,1vw,10px)] text-center" aria-label="Menu">
          {[...MODES.slice(0, 1).map((m) => ({ to: m.to, label: 'Open App' })), ...LINKS, signedIn ? { to: '/account', label: 'Account' } : enabled ? { to: '/login', label: 'Log in' } : null]
            .filter((l): l is { to: string; label: string } => l !== null)
            .map((l) => (
              <a
                key={l.label}
                href={l.to}
                tabIndex={menuOpen ? 0 : -1}
                onClick={(e) => {
                  e.preventDefault();
                  go(l.to);
                }}
                className="font-serif text-[clamp(34px,9vw,64px)] leading-[1.08] text-ink opacity-55 transition-all duration-300 hover:opacity-100 hover:tracking-[.012em]"
              >
                {l.label}
              </a>
            ))}
        </nav>
        <div className="absolute bottom-[calc(var(--pad)+var(--safe-bottom))] left-[calc(var(--pad)+var(--safe-left))] right-[calc(var(--pad)+var(--safe-right))] text-[12.5px] leading-[1.7] text-dim">
          Indian Sign Language · English · हिन्दी
          <br />
          UPES · CSAI3027P Deep Learning project
        </div>
      </div>
    </>
  );
};

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Check, Copy, MapPin, Phone, RefreshCw, Share2, Volume2, VolumeX, X } from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider';
import { useEmergencyContacts } from '../../auth/useEmergencyContacts';
import { Link } from '../../lib/router';
import { soundEffects } from '../../services/soundEffects';
import { speechService } from '../../services/speechService';

type Phase = 'idle' | 'countdown' | 'active';
interface Fix {
  lat: number;
  lng: number;
  accuracy: number;
  url: string;
}

const COUNTDOWN = 5;
const HOLD_MS = 1500;
const EASE = [0.22, 0.61, 0.36, 1] as const;

function useLocation() {
  const [fix, setFix] = useState<Fix | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(() => {
    if (!('geolocation' in navigator)) return setError('This browser cannot share location.');
    setBusy(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setFix({
          lat: coords.latitude,
          lng: coords.longitude,
          accuracy: Math.round(coords.accuracy),
          url: `https://maps.google.com/?q=${coords.latitude},${coords.longitude}`,
        });
        setBusy(false);
      },
      (e) => {
        setError(e.code === e.PERMISSION_DENIED ? 'Location permission is blocked.' : 'Location unavailable right now.');
        setBusy(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  }, []);
  useEffect(refresh, [refresh]);
  return { fix, error, busy, refresh };
}

const message = (fix: Fix | null) =>
  `EMERGENCY: I am deaf / hard of hearing and need urgent help.\n${
    fix ? `My location: ${fix.url} (±${fix.accuracy} m)` : 'My location could not be detected.'
  }\nPlease call emergency services (112) or come to me.`;

export const SosView: React.FC<{ triggered: boolean; onExit: () => void }> = ({ triggered, onExit }) => {
  const [phase, setPhase] = useState<Phase>(triggered ? 'countdown' : 'idle');
  const [count, setCount] = useState(COUNTDOWN);
  const [hold, setHold] = useState(0);
  const [siren, setSiren] = useState(true);
  const [copied, setCopied] = useState(false);
  const location = useLocation();
  const { user, enabled } = useAuth();
  const { contacts } = useEmergencyContacts();
  const holdStart = useRef<number | null>(null);
  const holdFrame = useRef(0);

  // Countdown, cancellable at any moment.
  useEffect(() => {
    if (phase !== 'countdown') return;
    if (count === 0) {
      setPhase('active');
      return;
    }
    soundEffects.playTick();
    navigator.vibrate?.(120);
    const t = setTimeout(() => setCount((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, count]);

  // Alert: speak once, then the siren repeats while it is on.
  useEffect(() => {
    if (phase !== 'active') return;
    speechService.speak('Emergency. This person is deaf and needs urgent help. Please call one one two.', 'en-IN');
    navigator.vibrate?.([300, 150, 300, 150, 600]);
  }, [phase]);
  useEffect(() => {
    if (phase !== 'active' || !siren) return;
    soundEffects.playSosAlert();
    const t = setInterval(() => soundEffects.playSosAlert(), 1800);
    return () => clearInterval(t);
  }, [phase, siren]);

  const cancel = useCallback(() => {
    speechService.stopSpeaking();
    setPhase('idle');
    setCount(COUNTDOWN);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && phase !== 'idle' && cancel();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, cancel]);

  // Press and hold to start the countdown, so a stray tap can't.
  const startHold = () => {
    holdStart.current = performance.now();
    const tick = () => {
      if (holdStart.current === null) return;
      const p = Math.min(1, (performance.now() - holdStart.current) / HOLD_MS);
      setHold(p);
      if (p >= 1) {
        holdStart.current = null;
        setHold(0);
        setCount(COUNTDOWN);
        setPhase('countdown');
        return;
      }
      holdFrame.current = requestAnimationFrame(tick);
    };
    holdFrame.current = requestAnimationFrame(tick);
  };
  const endHold = () => {
    holdStart.current = null;
    cancelAnimationFrame(holdFrame.current);
    setHold(0);
  };

  const copy = async () => {
    await navigator.clipboard.writeText(message(location.fix));
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };
  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Emergency', text: message(location.fix), url: location.fix?.url });
        return;
      } catch {
        // cancelled: fall through to copy
      }
    }
    copy();
  };

  const R = 128;
  const C = 2 * Math.PI * R;

  return (
    <div className="mx-auto max-w-[1200px] px-5 pt-4 sm:px-8">
      {/* Idle */}
      <div className="grid items-center gap-10 py-6 lg:grid-cols-[1fr_auto]">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[.24em] text-rose-300">Emergency</p>
          <h1 className="mt-3 font-serif text-6xl leading-[0.95] sm:text-7xl">
            Need help <em className="text-rose-200">fast?</em>
          </h1>
          <p className="mt-5 max-w-md text-[15px] leading-relaxed text-white/55">
            Press and hold the button, or hold the SOS sign to the camera (four fingers up, thumb folded across your palm).
            You get five seconds to cancel before the alert shows.
          </p>
        </div>

        <div className="mx-auto">
          <button
            onPointerDown={startHold}
            onPointerUp={endHold}
            onPointerLeave={endHold}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && !e.repeat && startHold()}
            onKeyUp={endHold}
            aria-label="Press and hold to send an SOS alert"
            className="group relative grid h-[280px] w-[280px] select-none place-items-center rounded-full"
          >
            <svg viewBox="0 0 280 280" className="absolute inset-0 -rotate-90" aria-hidden="true">
              <circle cx="140" cy="140" r={R} fill="none" stroke="rgba(251,113,133,.15)" strokeWidth="4" />
              <circle cx="140" cy="140" r={R} fill="none" stroke="#fb7185" strokeWidth="4" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - hold)} />
            </svg>
            <motion.span
              className="absolute inset-[26px] rounded-full bg-[radial-gradient(circle_at_35%_30%,#fb7185,#be123c_55%,#4c0519)] shadow-[0_0_80px_-10px_rgba(244,63,94,.6)]"
              animate={{ scale: hold ? 0.94 : [1, 1.03, 1] }}
              transition={hold ? { duration: 0.2 } : { duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
            />
            <span className="relative text-center text-white">
              <span className="block font-serif text-5xl">SOS</span>
              <span className="mt-1 block text-xs uppercase tracking-[.2em] text-white/80">{hold ? 'Keep holding' : 'Press & hold'}</span>
            </span>
          </button>
        </div>
      </div>

      {/* Details */}
      <div className="grid gap-4 pb-6 md:grid-cols-3">
        <section className="surface rounded-[24px] p-6">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-semibold uppercase tracking-[.24em] text-white/40">Your location</p>
            <button onClick={location.refresh} aria-label="Refresh location" className="text-white/40 hover:text-white">
              <RefreshCw className={`h-4 w-4 ${location.busy ? 'animate-spin' : ''}`} />
            </button>
          </div>
          {location.fix ? (
            <>
              <p className="mt-4 font-mono text-lg text-white">
                {location.fix.lat.toFixed(5)}, {location.fix.lng.toFixed(5)}
              </p>
              <p className="text-xs text-white/40">within about {location.fix.accuracy} m</p>
              <a href={location.fix.url} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-1.5 text-sm text-saffron hover:text-glow">
                <MapPin className="h-4 w-4" /> Open in Maps
              </a>
            </>
          ) : (
            <p className="mt-4 text-sm text-white/50">{location.error ?? 'Finding you…'}</p>
          )}
        </section>

        <section className="surface rounded-[24px] p-6">
          <p className="text-[10px] font-semibold uppercase tracking-[.24em] text-white/40">Emergency contacts</p>
          {contacts.length ? (
            <ul className="mt-3 space-y-1">
              {contacts.map((c) => (
                <li key={c.id}>
                  <a href={`tel:${c.phone.replace(/[^+\d]/g, '')}`} className="flex items-center justify-between rounded-xl px-2 py-2 hover:bg-white/[.04]">
                    <span className="text-sm text-white/85">
                      {c.name}
                      {c.relation && <span className="text-white/40"> · {c.relation}</span>}
                    </span>
                    <Phone className="h-4 w-4 text-saffron" />
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-white/50">
              {enabled ? (
                user ? (
                  <>
                    None saved yet. <Link to="/account#contacts" className="text-saffron">Add contacts</Link>
                  </>
                ) : (
                  <>
                    <Link to="/login?next=/app" className="text-saffron">Log in</Link> to keep contacts here.
                  </>
                )
              ) : (
                'Accounts are not set up on this copy of Sanket.'
              )}
            </p>
          )}
          <a href="tel:112" className="mt-4 flex items-center gap-2 text-sm font-medium text-rose-300">
            <Phone className="h-4 w-4" /> India emergency: 112
          </a>
        </section>

        <section className="surface rounded-[24px] p-6">
          <p className="text-[10px] font-semibold uppercase tracking-[.24em] text-white/40">Message</p>
          <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-white/70">{message(location.fix)}</p>
          <div className="mt-4 flex gap-2">
            <button onClick={copy} className="flex items-center gap-1.5 rounded-full border border-white/12 px-3.5 py-2 text-xs text-white/80 hover:border-white/30">
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {copied ? 'Copied' : 'Copy'}
            </button>
            <button onClick={share} className="flex items-center gap-1.5 rounded-full border border-white/12 px-3.5 py-2 text-xs text-white/80 hover:border-white/30">
              <Share2 className="h-3.5 w-3.5" /> Share
            </button>
          </div>
          <p className="mt-3 text-[11px] text-white/30">Sending SMS automatically isn't built yet.</p>
        </section>
      </div>

      {/* Countdown and active alert take over the screen */}
      <AnimatePresence>
        {phase === 'countdown' && (
          <motion.div
            key="countdown"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] grid place-items-center bg-[radial-gradient(circle_at_center,#4c0519,#0a0004_70%)] p-6 text-center"
            role="alertdialog"
            aria-label="SOS countdown"
          >
            <div>
              <p className="text-xs uppercase tracking-[.3em] text-rose-200/80">Alert in</p>
              <AnimatePresence mode="popLayout">
                <motion.p
                  key={count}
                  initial={{ opacity: 0, scale: 1.3, filter: 'blur(10px)' }}
                  animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ duration: 0.45, ease: EASE }}
                  className="font-serif text-[clamp(160px,32vw,320px)] leading-none text-white"
                >
                  {count}
                </motion.p>
              </AnimatePresence>
              <button onClick={cancel} autoFocus className="mt-6 rounded-full bg-white px-10 py-4 text-lg font-semibold text-black">
                Cancel
              </button>
              <p className="mt-3 text-xs text-white/40">or press Escape</p>
            </div>
          </motion.div>
        )}

        {phase === 'active' && (
          <motion.div
            key="active"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] overflow-y-auto bg-[#fff1f2] text-[#1a0306]"
            role="alertdialog"
            aria-label="Emergency alert"
          >
            <motion.div className="h-2 bg-rose-600" animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 1, repeat: Infinity }} />
            <div className="mx-auto flex min-h-[calc(100dvh-8px)] max-w-3xl flex-col justify-center px-6 py-10">
              <p className="text-sm font-semibold uppercase tracking-[.25em] text-rose-700">Emergency · please read</p>
              <h2 className="mt-4 font-serif text-[clamp(48px,9vw,96px)] leading-[0.95]">I am deaf and I need help.</h2>
              <p className="mt-6 text-2xl text-rose-950/80">Please call 112, or stay with me. I can read your words on this screen.</p>
              {location.fix && <p className="mt-4 font-mono text-base text-rose-950/60">Location: {location.fix.lat.toFixed(5)}, {location.fix.lng.toFixed(5)}</p>}

              <div className="mt-10 flex flex-wrap gap-3">
                <a href="tel:112" className="flex items-center gap-2 rounded-full bg-rose-600 px-7 py-4 text-lg font-semibold text-white">
                  <Phone className="h-5 w-5" /> Call 112
                </a>
                {contacts.map((c) => (
                  <a key={c.id} href={`tel:${c.phone.replace(/[^+\d]/g, '')}`} className="flex items-center gap-2 rounded-full border-2 border-rose-950/15 px-6 py-4 text-lg font-medium">
                    <Phone className="h-5 w-5" /> {c.name}
                  </a>
                ))}
                <button onClick={share} className="flex items-center gap-2 rounded-full border-2 border-rose-950/15 px-6 py-4 text-lg font-medium">
                  <Share2 className="h-5 w-5" /> Share location
                </button>
              </div>

              <div className="mt-10 flex flex-wrap items-center gap-3 border-t border-rose-950/10 pt-6">
                <button onClick={() => setSiren((s) => !s)} className="flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-rose-950/70 hover:bg-rose-950/5">
                  {siren ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />} {siren ? 'Silence siren' : 'Sound siren'}
                </button>
                <button
                  onClick={() => {
                    cancel();
                    onExit();
                  }}
                  className="ml-auto flex items-center gap-2 rounded-full bg-[#1a0306] px-6 py-3 text-sm font-semibold text-white"
                >
                  <X className="h-4 w-4" /> I'm safe now
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

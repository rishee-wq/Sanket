import React, { useCallback, useEffect, useRef, useState } from 'react';
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

  return (
    <div className="mx-auto max-w-[1100px]">
      <div className="grid items-stretch gap-[var(--pad)] lg:grid-cols-[1fr_minmax(300px,420px)]">
        <div className="flex flex-col justify-center py-2">
          <p className="tag text-alarm">Emergency · आपातकाल</p>
          <h1 className="display mt-3 text-[clamp(56px,10vw,128px)]">
            Need help
            <br />
            fast?
          </h1>
          <p className="mt-5 max-w-[46ch] text-[17px] leading-relaxed">
            Press and hold the red button. Or, in Translate, make the Signal for Help: palm out with your thumb folded
            across it, then close your fingers over the thumb. You get {COUNTDOWN} seconds to cancel before the alert
            shows.
          </p>
        </div>

        {/* The hold button fills with hazard stripes from the bottom as you hold. */}
        <button
          onPointerDown={startHold}
          onPointerUp={endHold}
          onPointerLeave={endHold}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && !e.repeat && startHold()}
          onKeyUp={endHold}
          aria-label="Press and hold to send an SOS alert"
          className="relative min-h-[260px] select-none overflow-hidden rounded-md border-2 border-ink bg-alarm text-white"
        >
          <span aria-hidden="true" className="hazard hazard-live absolute inset-x-0 bottom-0" style={{ height: `${hold * 100}%` }} />
          <span className="relative block p-6">
            <span className="display block text-[clamp(88px,14vw,150px)]" style={{ textShadow: hold ? '0 0 0 #241612, 3px 3px 0 #241612' : undefined }}>
              SOS
            </span>
            <span className="tag mt-2 inline-block border-2 border-white bg-ink px-2 py-1 text-white">{hold ? 'Keep holding…' : 'Press and hold 1.5 s'}</span>
          </span>
        </button>
      </div>

      <div className="mt-[var(--pad)] grid gap-3 md:grid-cols-3">
        <section className="plate p-4">
          <div className="flex items-center justify-between">
            <p className="tag text-mute">Your location</p>
            <button onClick={location.refresh} aria-label="Refresh location" className="btn btn-bare btn-sm btn-icon !w-[34px]">
              <RefreshCw className={`h-4 w-4 ${location.busy ? 'animate-spin' : ''}`} />
            </button>
          </div>
          {location.fix ? (
            <>
              <p className="num mt-3 text-lg font-semibold">
                {location.fix.lat.toFixed(5)}, {location.fix.lng.toFixed(5)}
              </p>
              <p className="text-sm text-mute">within about {location.fix.accuracy} m</p>
              <a href={location.fix.url} target="_blank" rel="noreferrer" className="link mt-3 inline-flex items-center gap-1.5 text-[15px]">
                <MapPin className="h-4 w-4" /> Open in Maps
              </a>
            </>
          ) : (
            <p className="mt-3 text-[15px] text-mute">{location.error ?? 'Finding you…'}</p>
          )}
        </section>

        <section className="plate p-4">
          <p className="tag text-mute">Emergency contacts</p>
          {contacts.length ? (
            <ul className="mt-2">
              {contacts.map((c) => (
                <li key={c.id} className="border-b border-ink/15 last:border-0">
                  <a href={`tel:${c.phone.replace(/[^+\d]/g, '')}`} className="flex items-center justify-between gap-2 py-2 hover:bg-ink/5">
                    <span className="text-[15px] font-semibold">
                      {c.name}
                      {c.relation && <span className="font-normal text-mute"> · {c.relation}</span>}
                    </span>
                    <Phone className="h-4 w-4" />
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-[15px] text-mute">
              {enabled ? (
                user ? (
                  <>
                    None saved yet. <Link to="/account#contacts" className="link">Add contacts</Link>
                  </>
                ) : (
                  <>
                    <Link to="/login?next=/app" className="link">Log in</Link> to keep contacts here.
                  </>
                )
              ) : (
                'Accounts are not set up on this copy of Sanket.'
              )}
            </p>
          )}
          <a href="tel:112" className="btn btn-alarm btn-sm mt-3">
            <Phone className="h-4 w-4" /> India emergency: 112
          </a>
        </section>

        <section className="plate p-4">
          <p className="tag text-mute">Message</p>
          <p className="mt-3 whitespace-pre-line text-[14px] leading-relaxed">{message(location.fix)}</p>
          <div className="mt-3 flex gap-2">
            <button onClick={copy} className="btn btn-sm">
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copied ? 'Copied' : 'Copy'}
            </button>
            <button onClick={share} className="btn btn-sm">
              <Share2 className="h-4 w-4" /> Share
            </button>
          </div>
          <p className="mt-3 text-[12px] text-mute">Sending SMS automatically isn't built yet.</p>
        </section>
      </div>

      {/* Countdown and active alert take over the screen */}
      {phase === 'countdown' && (
        <div className="fixed inset-0 z-[100] flex flex-col bg-ink text-paper" role="alertdialog" aria-label="SOS countdown">
          <div className="hazard hazard-live h-5 shrink-0" aria-hidden="true" />
          <div className="grid flex-1 place-items-center p-6 text-center">
            <div>
              <p className="tag text-signal">Alert in</p>
              <p key={count} className="display flap text-[clamp(180px,38vw,380px)] text-signal">
                {count}
              </p>
              <button onClick={cancel} autoFocus className="btn mt-4 !min-h-[60px] px-12 text-xl">
                Cancel
              </button>
              <p className="tag mt-3 text-paper/50">or press Escape</p>
            </div>
          </div>
          <div className="hazard hazard-live h-5 shrink-0" aria-hidden="true" />
        </div>
      )}

      {phase === 'active' && (
        <div className="fixed inset-0 z-[100] overflow-y-auto bg-signal text-ink" role="alertdialog" aria-label="Emergency alert">
          <div className="hazard hazard-live h-6" aria-hidden="true" />
          <div className="mx-auto flex min-h-[calc(100dvh-24px)] max-w-4xl flex-col justify-center px-6 py-8">
            <p className="tag">Emergency · please read</p>
            <h2 className="display mt-3 text-[clamp(56px,11vw,132px)]">I am deaf and I need help.</h2>
            <p className="deva mt-3 text-[clamp(22px,3.4vw,36px)] font-bold">मैं बधिर हूँ। मुझे मदद चाहिए।</p>
            <p className="mt-5 max-w-[40ch] text-2xl font-medium">Please call 112, or stay with me. I can read your words on this screen.</p>
            {location.fix && (
              <p className="num mt-4 text-base">
                Location: {location.fix.lat.toFixed(5)}, {location.fix.lng.toFixed(5)}
              </p>
            )}

            <div className="mt-8 flex flex-wrap gap-3">
              <a href="tel:112" className="btn btn-alarm !min-h-[60px] px-7 text-xl">
                <Phone className="h-5 w-5" /> Call 112
              </a>
              {contacts.map((c) => (
                <a key={c.id} href={`tel:${c.phone.replace(/[^+\d]/g, '')}`} className="btn !min-h-[60px] px-6 text-xl">
                  <Phone className="h-5 w-5" /> {c.name}
                </a>
              ))}
              <button onClick={share} className="btn !min-h-[60px] px-6 text-xl">
                <Share2 className="h-5 w-5" /> Share location
              </button>
            </div>

            <div className="mt-8 flex flex-wrap items-center gap-3 border-t-2 border-ink pt-5">
              <button onClick={() => setSiren((s) => !s)} className="btn btn-bare">
                {siren ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />} {siren ? 'Silence siren' : 'Sound siren'}
              </button>
              <button
                onClick={() => {
                  cancel();
                  onExit();
                }}
                className="btn btn-ink ml-auto"
              >
                <X className="h-5 w-5" /> I'm safe now
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

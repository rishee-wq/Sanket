import React, { useEffect, useRef, useState } from 'react';
import { SanketMark } from './Logo';

const WORD = 'SANKET';
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const FLIP_MS = 55;
const KEY = 'sanket.intro.v2';

/** Shows the intro once per browser session, never with reduced motion, never for a returning tab. */
export function shouldShowIntro(): boolean {
  try {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
    if (sessionStorage.getItem(KEY)) return false;
    sessionStorage.setItem(KEY, '1');
  } catch {
    // Storage blocked: show it, there is no way to remember.
  }
  return true;
}

/** One split-flap tile: spins through letters, then lands on its own. */
const Tile: React.FC<{ final: string; tick: number; landAt: number }> = ({ final, tick, landAt }) => {
  const landed = tick >= landAt;
  const ch = landed ? final : ALPHABET[(tick * 7 + landAt * 13) % ALPHABET.length];
  return (
    <span className="relative grid h-[clamp(64px,13vw,128px)] w-[clamp(46px,9.5vw,92px)] place-items-center overflow-hidden rounded-[5px] border-2 border-ink bg-night">
      <span key={landed ? 'final' : tick} className={`display flap text-[clamp(52px,11vw,108px)] ${landed ? 'text-signal' : 'text-paper/80'}`}>
        {ch}
      </span>
      <span className="absolute inset-x-0 top-1/2 h-[2px] -translate-y-1/2 bg-ink" aria-hidden="true" />
    </span>
  );
};

/**
 * Startup animation in the style of a railway departure board: the name flips
 * into place letter by letter, the mark's fingers rise and its waves "speak",
 * a hazard-stripe bar fills, and the board lifts away. About 2 seconds; any
 * key or click skips it.
 */
export const Intro: React.FC<{ onDone: () => void }> = ({ onDone }) => {
  const [tick, setTick] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const done = useRef(false);

  const finish = () => {
    if (done.current) return;
    done.current = true;
    setLeaving(true);
    window.setTimeout(onDone, 420);
  };

  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), FLIP_MS);
    const out = window.setTimeout(finish, 2100);
    const skip = () => finish();
    window.addEventListener('keydown', skip);
    return () => {
      window.clearInterval(id);
      window.clearTimeout(out);
      window.removeEventListener('keydown', skip);
    };
  }, []);

  const landAt = (i: number) => 6 + i * 3;
  const all = tick >= landAt(WORD.length - 1);

  return (
    <div
      role="presentation"
      onClick={finish}
      className={`fixed inset-0 z-[200] flex cursor-pointer flex-col items-center justify-center bg-signal transition-transform duration-[420ms] ease-[cubic-bezier(.7,0,.3,1)] ${leaving ? '-translate-y-full' : ''}`}
    >
      <div className="flex items-center gap-[clamp(10px,2vw,22px)]">
        <SanketMark animate className="h-[clamp(64px,13vw,128px)] w-[clamp(64px,13vw,128px)]" />
        <div className="flex gap-[clamp(3px,0.6vw,6px)]" aria-label="Sanket">
          {[...WORD].map((ch, i) => (
            <Tile key={i} final={ch} tick={tick} landAt={landAt(i)} />
          ))}
        </div>
      </div>
      <p className={`deva mt-5 text-[clamp(26px,4.6vw,46px)] font-extrabold transition-all duration-300 ${all ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0'}`}>
        संकेत · जहाँ हाथ बोलते हैं
      </p>
      <div className="mt-6 h-4 w-[min(420px,70vw)] overflow-hidden rounded-[3px] border-2 border-ink bg-card">
        <div className="hazard hazard-live h-full" style={{ width: `${Math.min(100, (tick / 36) * 100)}%` }} />
      </div>
      <p className="tag mt-3 text-ink/60">Where hands speak · tap to skip</p>
    </div>
  );
};

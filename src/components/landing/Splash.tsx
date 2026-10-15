import React, { useEffect, useRef, useState } from 'react';
import { SanketMark } from '../Logo';

const MIN_MS = 1150;
const MAX_MS = 9000;
const FADE_MS = 600;
const REMOVE_MS = 950;

interface SplashProps {
  /** 0..1 loading progress of the landing assets. */
  progress: number;
  ready: boolean;
  /** Called once the splash has started fading out. */
  onDone: () => void;
}

/** Black loading screen: wordmark, a progress hairline, and the tagline. */
export const Splash: React.FC<SplashProps> = ({ progress, ready, onDone }) => {
  const born = useRef(performance.now());
  const [out, setOut] = useState(false);
  const [gone, setGone] = useState(false);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    if (out) return;
    const elapsed = performance.now() - born.current;
    const wait = ready ? Math.max(0, MIN_MS - elapsed) : Math.max(0, MAX_MS - elapsed);
    const t = setTimeout(() => setOut(true), wait);
    return () => clearTimeout(t);
  }, [ready, out]);

  useEffect(() => {
    if (!out) return;
    doneRef.current();
    const t = setTimeout(() => setGone(true), REMOVE_MS);
    return () => clearTimeout(t);
  }, [out]);

  if (gone) return null;
  const fill = out ? 1 : progress;

  return (
    <div
      className="fixed inset-0 z-[250] grid place-items-center content-center gap-[26px] bg-black"
      style={{ opacity: out ? 0 : 1, pointerEvents: out ? 'none' : 'auto', transition: `opacity ${FADE_MS}ms ease` }}
      role="status"
      aria-label="Loading Sanket"
    >
      <div className="opacity-0 animate-[riseIn_1.1s_ease_.05s_forwards] text-ink">
        <SanketMark className="w-9 h-9" accent="#ff9a3c" />
      </div>
      <div className="font-serif text-[clamp(28px,4.4vw,52px)] tracking-[.005em] text-ink opacity-0 animate-[riseIn_1.25s_ease_.15s_forwards]">
        San<em className="not-italic text-saffron">ket</em>
      </div>
      <div className="relative h-px w-[clamp(120px,17vw,210px)] overflow-hidden bg-[rgba(244,242,239,.16)]">
        <s
          className="absolute inset-0 block origin-left bg-ink"
          style={{ transform: `scaleX(${fill})`, transition: 'transform .55s ease' }}
        />
      </div>
      <div className="text-[10px] uppercase tracking-[.26em] text-[rgba(244,242,239,.38)] opacity-0 animate-[riseIn_.9s_ease_.7s_forwards]">
        Where Hands Speak
      </div>
    </div>
  );
};

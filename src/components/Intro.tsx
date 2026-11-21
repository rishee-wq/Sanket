import React, { useEffect, useRef, useState } from 'react';

const KEY = 'sanket.intro.v4';
const LEAVE_AT = 2300;
const LEAVE_MS = 560;

/** Shows the intro once per browser session, never with reduced motion. */
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

/**
 * Startup animation: the henna-brown tile lands, सं is written onto it left to
 * right like a pen stroke, three sound waves ripple out of it (the sign
 * speaks), the name rises, and an iris opens onto the page. About 2.3 s;
 * any click or key skips it.
 */
export const Intro: React.FC<{ onDone: () => void }> = ({ onDone }) => {
  const [leaving, setLeaving] = useState(false);
  const done = useRef(false);

  const finish = () => {
    if (done.current) return;
    done.current = true;
    setLeaving(true);
    window.setTimeout(onDone, LEAVE_MS);
  };

  useEffect(() => {
    const out = window.setTimeout(finish, LEAVE_AT);
    const skip = () => finish();
    window.addEventListener('keydown', skip);
    return () => {
      window.clearTimeout(out);
      window.removeEventListener('keydown', skip);
    };
  }, []);

  return (
    <div
      role="presentation"
      onClick={finish}
      className={`intro fixed inset-0 z-[200] flex cursor-pointer flex-col items-center justify-center bg-paper text-ink ${leaving ? 'intro-leave' : ''}`}
    >
      <div className="intro-grid absolute inset-0" aria-hidden="true" />
      <svg viewBox="0 0 220 120" className="relative h-[min(30vh,210px)] w-auto overflow-visible" aria-hidden="true">
        <defs>
          <clipPath id="intro-pen">
            <rect className="intro-pen" x="10" y="0" width="100" height="120" />
          </clipPath>
        </defs>
        <rect className="intro-tile" width="120" height="120" rx="30" fill="#241612" stroke="#4a2c22" strokeWidth="2" />
        <text
          x="58"
          y="84"
          textAnchor="middle"
          fontFamily="'Anek Devanagari', 'Nirmala UI', 'Mangal', sans-serif"
          fontWeight="800"
          fontSize="66"
          fill="#f26b3a"
          clipPath="url(#intro-pen)"
        >
          सं
        </text>
        <g fill="none" strokeLinecap="round">
          {[
            ['M92 46a16 16 0 0 1 0 26', '#f7d9c4', 7, 820],
            ['M134 34a34 34 0 0 1 0 50', '#241612', 6, 960],
            ['M160 22a52 52 0 0 1 0 74', '#f26b3a', 5, 1100],
            ['M186 10a70 70 0 0 1 0 98', '#f26b3a', 4, 1240],
          ].map(([d, color, width, delay]) => (
            <path key={d as string} className="intro-wave" d={d as string} stroke={color as string} strokeWidth={width as number} style={{ animationDelay: `${delay}ms` }} />
          ))}
        </g>
      </svg>

      <div className="relative mt-6 flex flex-col items-center">
        <p className="flex text-[clamp(56px,10vw,104px)] font-extrabold leading-none tracking-[-0.03em] [font-variation-settings:'wdth'_92]" aria-label="Sanket">
          {[...'Sanket'].map((ch, i) => (
            <span key={i} className="intro-letter" style={{ animationDelay: `${1250 + i * 45}ms` }}>
              {ch}
            </span>
          ))}
        </p>
        <p className="intro-fade deva mt-1 text-[clamp(22px,3.6vw,34px)] font-semibold text-signal-deep" style={{ animationDelay: "1600ms" }}>
          संकेत · जहाँ हाथ बोलते हैं
        </p>
        <p className="intro-fade tag mt-5 text-mute" style={{ animationDelay: '1750ms' }}>
          Indian Sign Language → text and speech · tap to skip
        </p>
      </div>
    </div>
  );
};

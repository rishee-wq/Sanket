import React, { useId } from 'react';

/**
 * The Sanket mark: a flowing "S", like the path a hand traces in the air, with a dot above
 * it. The dot is the anusvara of सं (the first syllable of संकेत) and the "signal" point.
 */
export const MARK_PATH =
  'M23.2 9.4C20.9 6.8 16.6 6.1 13.5 7.5 10.2 9 9.5 12.9 12.4 14.9 14.8 16.5 19.7 16.3 21.8 18.8 24 21.4 22.5 25.6 18.7 26.6 15.3 27.5 11.5 26.4 9 23.6';
export const MARK_DOT = { cx: 25.7, cy: 5.3, r: 2.35 };
export const MARK_STROKE = 3.4;

/** Gradient stops shared by the mark and the intro animation. */
export const MarkGradient: React.FC<{ id: string }> = ({ id }) => (
  <linearGradient id={id} x1="9" y1="6" x2="23" y2="27" gradientUnits="userSpaceOnUse">
    <stop offset="0" stopColor="#ffd2a8" />
    <stop offset=".45" stopColor="#ff9a3c" />
    <stop offset="1" stopColor="#e8611a" />
  </linearGradient>
);

export const SanketMark: React.FC<{ className?: string }> = ({ className = 'h-6 w-6' }) => {
  const id = `sk-${useId().replace(/[^a-zA-Z0-9-]/g, '')}`;
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <defs>
        <MarkGradient id={id} />
      </defs>
      <path d={MARK_PATH} stroke={`url(#${id})`} strokeWidth={MARK_STROKE} strokeLinecap="round" fill="none" />
      <circle {...MARK_DOT} fill="#ffffff" />
    </svg>
  );
};

/** "San" in ink, "ket" in saffron. */
export const Wordmark: React.FC<{ className?: string }> = ({ className = '' }) => (
  <span className={`font-serif tracking-[.005em] leading-none whitespace-nowrap ${className}`}>
    San<span className="text-saffron">ket</span>
  </span>
);

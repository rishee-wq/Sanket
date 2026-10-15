import React from 'react';

/** Sanket mark: a palm with five radiating fingers, which also reads as a signal burst. */
export const SanketMark: React.FC<{ className?: string; accent?: string }> = ({
  className = 'w-6 h-6',
  accent = 'currentColor',
}) => (
  <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
    <g stroke={accent} strokeWidth="2.2" strokeLinecap="round" fill="none">
      <path d="M16 21 9 9.5" />
      <path d="M16 21 13.5 6" />
      <path d="M16 21 18.5 5.5" />
      <path d="M16 21 23 8" />
      <path d="M16 21 26.5 15" />
    </g>
    <circle cx="16" cy="22" r="3.4" fill="currentColor" />
  </svg>
);

/** "San" in ink, "ket" in saffron, like the splash wordmark. */
export const Wordmark: React.FC<{ className?: string }> = ({ className = '' }) => (
  <span className={`font-serif tracking-[.005em] leading-none whitespace-nowrap ${className}`}>
    San<span className="text-saffron">ket</span>
  </span>
);

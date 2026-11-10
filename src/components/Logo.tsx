import React from 'react';

/**
 * The Sanket mark: an open hand drawn the way the app sees one, five bones
 * fanning out from the wrist, on a signal-yellow board.
 */
export const SanketMark: React.FC<{ className?: string }> = ({ className = 'h-7 w-7' }) => (
  <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
    <rect x="1" y="1" width="30" height="30" rx="5" fill="#ffc400" stroke="#17140f" strokeWidth="2" />
    <g stroke="#17140f" strokeWidth="2.6" strokeLinecap="square" fill="none">
      <path d="M16 24 8.2 16.4" />
      <path d="M16 24 11.4 8.6" />
      <path d="M16 24V6.6" />
      <path d="M16 24 20.6 8.6" />
      <path d="M16 24 23.8 13.2" />
    </g>
    <rect x="13.2" y="21.2" width="5.6" height="5.6" fill="#17140f" />
  </svg>
);

/** SANKET in condensed capitals with the Devanagari name beside it. */
export const Wordmark: React.FC<{ className?: string; deva?: boolean }> = ({ className = '', deva = true }) => (
  <span className={`inline-flex items-baseline gap-2 whitespace-nowrap leading-none ${className}`}>
    <span className="display text-[1em] tracking-[.02em]">Sanket</span>
    {deva && <span className="deva text-[.72em] font-semibold">संकेत</span>}
  </span>
);

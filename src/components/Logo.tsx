import React from 'react';

/**
 * The Sanket mark: सं, the first syllable of संकेत ("sign", "signal"), in terracotta
 * on a henna-brown tile, with one sound wave leaving it: a sign that speaks.
 */
export const SanketMark: React.FC<{ className?: string; animate?: boolean; board?: boolean }> = ({
  className = 'h-7 w-7',
  animate = false,
  board = true,
}) => (
  <svg viewBox="0 0 120 120" className={`${className} ${animate ? 'mark-animate' : ''}`} aria-hidden="true">
    {board && <rect className="mark-tile" width="120" height="120" rx="30" fill="#241612" />}
    <text
      className="mark-glyph"
      x="58"
      y="84"
      textAnchor="middle"
      fontFamily="'Anek Devanagari', 'Nirmala UI', 'Mangal', sans-serif"
      fontWeight="800"
      fontSize="66"
      fill="#f26b3a"
    >
      सं
    </text>
    <path className="mark-wave" d="M92 46a16 16 0 0 1 0 26" fill="none" stroke="#f7d9c4" strokeWidth="7" strokeLinecap="round" />
  </svg>
);

/** "Sanket" with the Devanagari name beside it. */
export const Wordmark: React.FC<{ className?: string; deva?: boolean }> = ({ className = '', deva = true }) => (
  <span className={`inline-flex items-baseline gap-2 whitespace-nowrap leading-none ${className}`}>
    <span className="font-extrabold tracking-[-0.02em] [font-variation-settings:'wdth'_92]">Sanket</span>
    {deva && <span className="deva text-[.7em] font-semibold opacity-70">संकेत</span>}
  </span>
);

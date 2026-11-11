import React from 'react';

/**
 * The Sanket mark: a raised open hand with two sound waves coming off it
 * ("where hands speak"), in ink on a signal-yellow station board.
 * Built from the same thick, round-ended strokes as the solid hands in Learn,
 * so it still reads at 16 px.
 */
const FINGERS = [
  { x: 7.4, top: 9.6 },
  { x: 10.3, top: 6.8 },
  { x: 13.2, top: 7.6 },
  { x: 16, top: 10.4 },
];
const PALM = 'M6 17.2h11.4v5.6a3.6 3.6 0 0 1-3.6 3.6H9.6A3.6 3.6 0 0 1 6 22.8z';
const THUMB = { x1: 7, y1: 21, x2: 3.9, y2: 16.4 };
const WAVES = ['M20.6 13.3a5 5 0 0 1 0 6.4', 'M23.4 10.6a9 9 0 0 1 0 11.8'];

export const SanketMark: React.FC<{ className?: string; animate?: boolean; board?: boolean }> = ({
  className = 'h-7 w-7',
  animate = false,
  board = true,
}) => (
  <svg viewBox="0 0 32 32" className={`${className} ${animate ? 'mark-animate' : ''}`} aria-hidden="true">
    {board && <rect x="1" y="1" width="30" height="30" rx="5" fill="#ffc400" stroke="#17140f" strokeWidth="2" />}
    <g stroke="#17140f" strokeWidth="2.7" strokeLinecap="round" fill="none">
      {FINGERS.map((f, i) => (
        <line key={f.x} className="mark-finger" style={{ animationDelay: `${120 + i * 70}ms` }} x1={f.x} y1="18.5" x2={f.x} y2={f.top} />
      ))}
      <line className="mark-finger mark-thumb" style={{ animationDelay: '400ms' }} {...THUMB} />
      {WAVES.map((d, i) => (
        <path key={d} className="mark-wave" style={{ animationDelay: `${620 + i * 160}ms` }} d={d} strokeWidth="2.3" />
      ))}
    </g>
    <path className="mark-palm" d={PALM} fill="#17140f" />
  </svg>
);

/** SANKET in condensed capitals with the Devanagari name beside it. */
export const Wordmark: React.FC<{ className?: string; deva?: boolean }> = ({ className = '', deva = true }) => (
  <span className={`inline-flex items-baseline gap-2 whitespace-nowrap leading-none ${className}`}>
    <span className="display text-[1em] tracking-[.02em]">Sanket</span>
    {deva && <span className="deva text-[.72em] font-semibold">संकेत</span>}
  </span>
);

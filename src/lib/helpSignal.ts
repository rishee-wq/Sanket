/**
 * Detects the international "Signal for Help" as a deliberate two-step gesture:
 * 1. palm facing out with the thumb folded across it, held briefly;
 * 2. then the fingers fold down over the thumb (a fist).
 *
 * This is rule-based geometry on the landmarks, on purpose: an emergency
 * trigger should not depend on a learned model's vocabulary or confidence. A
 * single frame, or an ordinary open hand, never triggers anything.
 */
import type { Landmark } from '../engine/features';

export type HelpShape = 'tucked' | 'fist' | null;

function distance(a: Landmark, b: Landmark) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

/** Classifies the two shapes of the Signal for Help, or returns null for anything else. */
export function helpShape(lm: Landmark[]): HelpShape {
  if (lm.length !== 21) return null;
  const wrist = lm[0];
  // Wrist to middle-finger base: a palm size that does not change when fingers curl.
  const palm = distance(wrist, lm[9]) || 1;
  const extended = (tip: number, pip: number) => distance(lm[tip], wrist) > distance(lm[pip], wrist) * 1.15;
  const thumbOut = distance(lm[4], wrist) > distance(lm[3], wrist) * 1.08 && distance(lm[4], lm[5]) / palm > 0.45;
  // Thumb folded right across the palm, measured in the image plane (depth is too noisy for this).
  const flat = (a: Landmark, b: Landmark) => Math.hypot(a.x - b.x, a.y - b.y);
  const thumbTucked = Math.min(flat(lm[4], lm[9]), flat(lm[4], lm[13])) / palm < 0.42;
  const fingers = [extended(8, 6), extended(12, 10), extended(16, 14), extended(20, 18)];
  const up = fingers.filter(Boolean).length;

  if (up === 4 && !thumbOut && thumbTucked) return 'tucked';
  if (up === 0 && !thumbOut) return 'fist';
  return null;
}

export type HelpSignalState = 'idle' | 'armed' | 'triggered';

export interface HelpSignalOptions {
  /** How long the open, thumb-tucked shape must be held to arm. */
  holdMs: number;
  /** Time allowed after the open shape to close the fist. */
  windowMs: number;
}

export const DEFAULT_HELP_SIGNAL: HelpSignalOptions = { holdMs: 500, windowMs: 2500 };

export class HelpSignalDetector {
  private openSince: number | null = null;
  private lastOpen: number | null = null;
  private readonly options: HelpSignalOptions;

  constructor(options: HelpSignalOptions = DEFAULT_HELP_SIGNAL) {
    this.options = options;
  }

  update(shape: HelpShape, now: number): HelpSignalState {
    const { holdMs, windowMs } = this.options;

    if (shape === 'tucked') {
      this.openSince ??= now;
      if (now - this.openSince >= holdMs) this.lastOpen = now;
    } else {
      this.openSince = null;
    }

    if (this.lastOpen === null) return 'idle';
    if (now - this.lastOpen > windowMs) {
      this.lastOpen = null;
      return 'idle';
    }
    if (shape === 'fist') {
      this.reset();
      return 'triggered';
    }
    return 'armed';
  }

  reset() {
    this.openSince = null;
    this.lastOpen = null;
  }
}

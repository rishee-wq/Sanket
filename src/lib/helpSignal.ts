/**
 * Detects the international "Signal for Help" as a deliberate two-step gesture:
 * 1. palm facing out with the thumb folded across it ("SOS" shape), held briefly;
 * 2. then the fingers fold down over the thumb (a fist, "No" in the demo vocabulary).
 *
 * A single SOS-shaped frame, or an open hand, never triggers anything. This keeps an
 * ordinary raised hand in a conversation from opening the emergency screen.
 */

export type HelpSignalState = 'idle' | 'armed' | 'triggered';

export interface HelpSignalOptions {
  /** Label of the open, thumb-tucked shape. */
  openLabel: string;
  /** Label of the closed fist. */
  closedLabel: string;
  minConfidence: number;
  /** How long the open shape must be held to arm. */
  holdMs: number;
  /** Time allowed after the open shape to close the fist. */
  windowMs: number;
}

export const DEFAULT_HELP_SIGNAL: HelpSignalOptions = {
  openLabel: 'SOS',
  closedLabel: 'No',
  minConfidence: 0.8,
  holdMs: 500,
  windowMs: 2500,
};

export class HelpSignalDetector {
  private openSince: number | null = null;
  private lastOpen: number | null = null;
  private readonly options: HelpSignalOptions;

  constructor(options: HelpSignalOptions = DEFAULT_HELP_SIGNAL) {
    this.options = options;
  }

  update(label: string | null, confidence: number, now: number): HelpSignalState {
    const { openLabel, closedLabel, minConfidence, holdMs, windowMs } = this.options;
    const sure = label !== null && confidence >= minConfidence;

    if (sure && label === openLabel) {
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
    if (sure && label === closedLabel) {
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

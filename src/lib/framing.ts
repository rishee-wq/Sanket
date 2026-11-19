/**
 * Framing coach: one short, actionable hint about where the hands are in the
 * frame, or null when they are fine. The recognisers were trained on people
 * filmed from a little distance with both hands in view, so hands that are
 * cut off at the edge, or fill the whole frame, are the most common reason a
 * sign is missed.
 */
import type { DetectedHand } from '../engine/features';

export type FramingHint = 'edge' | 'close' | 'far' | null;

export const FRAMING_TEXT: Record<Exclude<FramingHint, null>, string> = {
  edge: 'Keep your hands inside the frame',
  close: 'Move back a little: show your chest and both hands',
  far: 'Come a little closer to the camera',
};

/** `aspect` = video width / height, so sizes compare the same on both axes. */
export function framingHint(hands: DetectedHand[], aspect: number): FramingHint {
  if (!hands.length) return null;
  let edge = false;
  let biggest = 0;
  for (const hand of hands) {
    let minX = 1, maxX = 0, minY = 1, maxY = 0;
    for (const p of hand.landmarks) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }
    if (minX < 0.02 || maxX > 0.98 || minY < 0.02 || maxY > 0.98) edge = true;
    // Hand height as a share of the frame height (width corrected for aspect).
    biggest = Math.max(biggest, Math.max((maxX - minX) * aspect, maxY - minY));
  }
  if (edge) return 'edge';
  if (biggest > 0.55) return 'close';
  if (biggest < 0.07) return 'far';
  return null;
}

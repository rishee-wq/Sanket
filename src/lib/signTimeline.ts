import type { HandKey, SignAnimation } from '../data/signAnimations';
import type { HandPose } from './hand3d';
import { SHAPES, Vec3, blendShapes } from './handModel';

interface Segment {
  start: number;
  moveEnd: number;
  end: number;
  caption: string;
  from: { right: HandKey | null; left: HandKey | null };
  to: { right: HandKey | null; left: HandKey | null };
}

export interface Timeline {
  duration: number;
  segments: Segment[];
  captions: string[];
}

/** Resolves carried-over keys and absolute times for an animation. */
export function buildTimeline(anim: SignAnimation): Timeline {
  let t = 0;
  let right: HandKey | null = null;
  let left: HandKey | null = null;
  const segments: Segment[] = [];
  for (const step of anim.steps) {
    const from = { right, left };
    if (step.right !== undefined) right = step.right;
    if (step.left !== undefined) left = step.left;
    const moveEnd = t + step.ms;
    const end = moveEnd + (step.hold ?? 0);
    segments.push({ start: t, moveEnd, end, caption: step.caption, from, to: { right, left } });
    t = end;
  }
  // Consecutive steps with the same caption (e.g. a wave) read as one instruction.
  const captions = segments.map((s) => s.caption).filter((c, i, all) => c !== all[i - 1]);
  return { duration: t, segments, captions };
}

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const lerp3 = (a: Vec3, b: Vec3, t: number): Vec3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

function blendKeys(a: HandKey | null, b: HandKey | null, t: number): HandPose | null {
  if (!b) return null;
  const from = a ?? b;
  return {
    shape: blendShapes(SHAPES[from.shape], SHAPES[b.shape], t),
    position: lerp3(from.at, b.at, t),
    rotation: lerp3(from.rot ?? [0, 0, 0], b.rot ?? [0, 0, 0], t),
  };
}

/** Hand poses and the active caption at time `ms` (clamped to the timeline). */
export function sampleTimeline(tl: Timeline, ms: number) {
  const time = Math.max(0, Math.min(tl.duration, ms));
  const seg = tl.segments.find((s) => time < s.end) ?? tl.segments[tl.segments.length - 1];
  const t = easeInOut(Math.min(1, (time - seg.start) / Math.max(1, seg.moveEnd - seg.start)));
  return {
    right: blendKeys(seg.from.right, seg.to.right, t),
    left: blendKeys(seg.from.left, seg.to.left, t),
    captionIndex: tl.captions.indexOf(seg.caption),
    progress: time / tl.duration,
  };
}

/** The same key seen in a mirror: for left-handed signers. */
export function mirrorPose(p: HandPose | null): HandPose | null {
  if (!p) return null;
  return { ...p, position: [-p.position[0], p.position[1], p.position[2]], rotation: [p.rotation[0], -p.rotation[1], -p.rotation[2]] };
}

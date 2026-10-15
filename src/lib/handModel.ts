/**
 * A kinematic right hand. Shapes are authored as joint angles, and forward kinematics
 * turns them into the 21 MediaPipe-ordered joint positions that the 3D renderer
 * (and anything else that wants landmarks) draws from.
 *
 * Local frame, in centimetres: wrist at the origin, fingers along +Y, palm facing +Z
 * (towards the viewer), thumb on the +X side. A left hand is the mirror image in X.
 */

export type Vec3 = [number, number, number];

export interface FingerAngles {
  /** Flexion in degrees at each joint; positive curls towards the palm. */
  mcp: number;
  pip: number;
  dip: number;
  /** Sideways spread at the knuckle in degrees; positive moves away from the middle finger. */
  spread: number;
}

export interface ThumbAngles {
  /** Angle in the palm plane, from straight up (0) out towards +X (90). */
  yaw: number;
  /** Lift out of the palm plane towards the palm side (opposition), degrees. */
  lift: number;
  /** Flexion at the two thumb joints, curling towards the palm centre. */
  mcp: number;
  ip: number;
}

export interface HandShape {
  thumb: ThumbAngles;
  index: FingerAngles;
  middle: FingerAngles;
  ring: FingerAngles;
  pinky: FingerAngles;
}

export const FINGERS = ['index', 'middle', 'ring', 'pinky'] as const;
type FingerName = (typeof FINGERS)[number];

/** Knuckle position on the palm and phalanx lengths, roughly an adult hand. */
const FINGER_GEOMETRY: Record<FingerName, { base: Vec3; lengths: [number, number, number]; radius: number }> = {
  index: { base: [2.35, 8.1, 0], lengths: [4.4, 2.5, 2.0], radius: 0.86 },
  middle: { base: [0.6, 8.45, 0], lengths: [4.9, 2.9, 2.15], radius: 0.9 },
  ring: { base: [-1.15, 8.05, 0], lengths: [4.5, 2.75, 2.05], radius: 0.84 },
  pinky: { base: [-2.75, 7.25, 0], lengths: [3.6, 2.05, 1.8], radius: 0.74 },
};
const THUMB_GEOMETRY = { base: [2.1, 1.7, 0.7] as Vec3, lengths: [4.3, 3.1, 2.5] as const, radius: 1.0 };

export const SEGMENT_RADII = {
  thumb: [THUMB_GEOMETRY.radius, 0.98, 0.9],
  index: [0.86, 0.8, 0.74],
  middle: [0.9, 0.83, 0.76],
  ring: [0.84, 0.78, 0.72],
  pinky: [0.74, 0.69, 0.64],
} as const;

const RAD = Math.PI / 180;

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a: Vec3): Vec3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

function fingerChain(name: FingerName, f: FingerAngles): Vec3[] {
  const { base, lengths } = FINGER_GEOMETRY[name];
  // Spread direction: index and middle open towards +X, ring and pinky towards -X.
  const side = name === 'index' || name === 'middle' ? 1 : -1;
  const s = f.spread * side * RAD;
  const pts: Vec3[] = [base];
  let theta = 0;
  let p = base;
  [f.mcp, f.pip, f.dip].forEach((flex, k) => {
    theta += flex * RAD;
    // In the finger's plane: straight is +Y, curling rotates towards +Z (the palm side).
    const local: Vec3 = [0, Math.cos(theta), Math.sin(theta)];
    const dir: Vec3 = [local[1] * Math.sin(s), local[1] * Math.cos(s), local[2]];
    p = add(p, scale(dir, lengths[k]));
    pts.push(p);
  });
  return pts;
}

function thumbChain(t: ThumbAngles): Vec3[] {
  const yaw = t.yaw * RAD;
  const lift = t.lift * RAD;
  let dir: Vec3 = norm([Math.sin(yaw) * Math.cos(lift), Math.cos(yaw) * Math.cos(lift), Math.sin(lift)]);
  // Flexing curls the thumb towards a point in front of the palm centre.
  const towards: Vec3 = norm([-1, 0.35, 0.75]);
  const pts: Vec3[] = [THUMB_GEOMETRY.base];
  let p = THUMB_GEOMETRY.base;
  [0, t.mcp, t.ip].forEach((flex, k) => {
    if (flex) {
      const b = norm(add(towards, scale(dir, -dot(towards, dir))));
      const a = flex * RAD;
      dir = norm(add(scale(dir, Math.cos(a)), scale(b, Math.sin(a))));
    }
    p = add(p, scale(dir, THUMB_GEOMETRY.lengths[k]));
    pts.push(p);
  });
  return pts;
}

/**
 * 21 joint positions in MediaPipe order: 0 wrist, 1-4 thumb (CMC, MCP, IP, tip),
 * 5-8 index, 9-12 middle, 13-16 ring, 17-20 pinky.
 */
export function handJoints(shape: HandShape): Vec3[] {
  return [[0, 0, 0], ...thumbChain(shape.thumb), ...FINGERS.flatMap((f) => fingerChain(f, shape[f]))];
}

// ---------------------------------------------------------------------------
// Hand shapes. Names describe the shape, not a meaning; signs pick shapes.
// ---------------------------------------------------------------------------

const straight = (spread = 0): FingerAngles => ({ mcp: 4, pip: 6, dip: 4, spread });
const curled = (spread = 0): FingerAngles => ({ mcp: 88, pip: 100, dip: 62, spread });
const tuckedThumb: ThumbAngles = { yaw: 18, lift: 50, mcp: 42, ip: 30 };

export const SHAPES = {
  /** Open palm, fingers spread (Hello, 5). */
  open: {
    thumb: { yaw: 58, lift: 14, mcp: 4, ip: 4 },
    index: straight(9),
    middle: straight(2),
    ring: straight(6),
    pinky: straight(14),
  },
  /** Flat hand, fingers together, thumb alongside. */
  flat: {
    thumb: { yaw: 22, lift: 8, mcp: 6, ip: 4 },
    index: straight(1),
    middle: straight(0),
    ring: straight(1),
    pinky: straight(3),
  },
  /** Four fingers up, thumb folded across the palm (SOS). */
  flatThumbTucked: {
    thumb: { yaw: 8, lift: 58, mcp: 58, ip: 40 },
    index: straight(2),
    middle: straight(0),
    ring: straight(2),
    pinky: straight(5),
  },
  /** Closed fist, thumb across the fingers (No, A). */
  fist: {
    thumb: tuckedThumb,
    index: curled(),
    middle: curled(),
    ring: curled(),
    pinky: curled(),
  },
  /** Fist with the thumb straight up (Yes). */
  thumbUp: {
    thumb: { yaw: -4, lift: 22, mcp: -6, ip: -8 },
    index: curled(),
    middle: curled(),
    ring: curled(),
    pinky: curled(),
  },
  /** Index finger up (1, D). */
  point: {
    thumb: { yaw: 14, lift: 52, mcp: 46, ip: 32 },
    index: straight(2),
    middle: curled(),
    ring: curled(),
    pinky: curled(),
  },
  /** Index and middle up in a V (2, V). */
  vee: {
    thumb: { yaw: 14, lift: 52, mcp: 46, ip: 34 },
    index: straight(11),
    middle: straight(10),
    ring: curled(),
    pinky: curled(),
  },
  /** Index, middle and ring up (3, W). */
  three: {
    thumb: { yaw: 6, lift: 58, mcp: 56, ip: 40 },
    index: straight(10),
    middle: straight(1),
    ring: straight(9),
    pinky: curled(),
  },
  /** Thumb and index out in an L (Doctor in the demo vocabulary). */
  ell: {
    thumb: { yaw: 84, lift: 4, mcp: 0, ip: 0 },
    index: straight(2),
    middle: curled(),
    ring: curled(),
    pinky: curled(),
  },
  /** Thumb, index and little finger out (Help in the demo vocabulary). */
  horns: {
    thumb: { yaw: 72, lift: 8, mcp: 2, ip: 0 },
    index: straight(8),
    middle: curled(),
    ring: curled(),
    pinky: straight(12),
  },
  /** Little finger up (Water, I). */
  pinkyUp: {
    thumb: tuckedThumb,
    index: curled(),
    middle: curled(),
    ring: curled(),
    pinky: straight(4),
  },
  /** Thumb and index tips touching, other fingers up (OK; Thank you in the demo vocabulary). */
  okay: {
    thumb: { yaw: 30, lift: 46, mcp: 22, ip: 18 },
    index: { mcp: 46, pip: 62, dip: 36, spread: 4 },
    middle: straight(4),
    ring: straight(8),
    pinky: straight(14),
  },
  /** All fingertips curved to meet the thumb (O). */
  oh: {
    thumb: { yaw: 26, lift: 52, mcp: 20, ip: 16 },
    index: { mcp: 40, pip: 58, dip: 34, spread: 2 },
    middle: { mcp: 42, pip: 60, dip: 34, spread: 0 },
    ring: { mcp: 44, pip: 60, dip: 34, spread: 2 },
    pinky: { mcp: 48, pip: 58, dip: 32, spread: 4 },
  },
  /** Relaxed, slightly curled: the resting hand between signs. */
  rest: {
    thumb: { yaw: 34, lift: 26, mcp: 14, ip: 10 },
    index: { mcp: 16, pip: 22, dip: 10, spread: 4 },
    middle: { mcp: 20, pip: 26, dip: 12, spread: 1 },
    ring: { mcp: 24, pip: 30, dip: 14, spread: 4 },
    pinky: { mcp: 28, pip: 30, dip: 14, spread: 8 },
  },
} satisfies Record<string, HandShape>;

export type ShapeName = keyof typeof SHAPES;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Blends two shapes joint by joint, so fingers bend rather than shrink. */
export function blendShapes(a: HandShape, b: HandShape, t: number): HandShape {
  const finger = (x: FingerAngles, y: FingerAngles): FingerAngles => ({
    mcp: lerp(x.mcp, y.mcp, t),
    pip: lerp(x.pip, y.pip, t),
    dip: lerp(x.dip, y.dip, t),
    spread: lerp(x.spread, y.spread, t),
  });
  return {
    thumb: {
      yaw: lerp(a.thumb.yaw, b.thumb.yaw, t),
      lift: lerp(a.thumb.lift, b.thumb.lift, t),
      mcp: lerp(a.thumb.mcp, b.thumb.mcp, t),
      ip: lerp(a.thumb.ip, b.thumb.ip, t),
    },
    index: finger(a.index, b.index),
    middle: finger(a.middle, b.middle),
    ring: finger(a.ring, b.ring),
    pinky: finger(a.pinky, b.pinky),
  };
}

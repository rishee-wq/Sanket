import type { ShapeName, Vec3 } from '../lib/handModel';

/**
 * Animated lessons for the 3D tutor.
 *
 * Positions are in signing space (cm): the chest centre is the origin, +Y is up and +Z
 * points towards the viewer. The signer faces the viewer, so their right hand is on the
 * viewer's left (negative X). Rotations are wrist degrees: [pitch, yaw, roll]; [0, 0, 0]
 * is the palm facing the viewer with the fingers up.
 *
 * IMPORTANT: these follow Sanket's demo vocabulary (the shapes the mock recognizer knows).
 * They have not been checked by an ISL signer. Before teaching real users, verify each one
 * against the ISLRTC dictionary or with an ISL teacher, then set `reviewed: true`.
 */

export interface HandKey {
  shape: ShapeName;
  at: Vec3;
  rot?: Vec3;
}

export interface SignStep {
  caption: string;
  /** Time to move into this step's pose. */
  ms: number;
  /** Time to hold the pose afterwards. */
  hold?: number;
  /** Omitted: keep the previous key. null: hide the hand. */
  right?: HandKey | null;
  left?: HandKey | null;
}

export interface SignAnimation {
  label: string;
  steps: SignStep[];
  /** Optional real reference clip (e.g. public/signs/hello.mp4), shown alongside the 3D hand. */
  videoUrl?: string;
  reviewed: boolean;
}

const REST: HandKey = { shape: 'rest', at: [-10, -18, 8], rot: [-12, 10, 0] };
const CHEST: Vec3 = [-8, 2, 12];

const start: SignStep = { caption: 'Start with your hand relaxed', ms: 450, hold: 250, right: REST };
const finish: SignStep = { caption: 'Relax your hand', ms: 750, hold: 500, right: REST };

/** Two small rocks of the wrist around `rot`, on `axis` (0 pitch, 1 yaw, 2 roll). */
function rock(key: HandKey, axis: 0 | 1 | 2, degrees: number, caption: string): SignStep[] {
  const base = key.rot ?? [0, 0, 0];
  const at = (d: number): HandKey => ({ ...key, rot: base.map((r, i) => (i === axis ? r + d : r)) as Vec3 });
  return [
    { caption, ms: 240, right: at(degrees) },
    { caption, ms: 280, right: at(-degrees) },
    { caption, ms: 280, right: at(degrees) },
    { caption, ms: 240, hold: 500, right: key },
  ];
}

const helloKey: HandKey = { shape: 'open', at: [-13, 21, 5], rot: [0, 0, 6] };
const yesKey: HandKey = { shape: 'thumbUp', at: CHEST, rot: [0, 55, 0] };
const noKey: HandKey = { shape: 'fist', at: CHEST, rot: [0, 25, 0] };

export const SIGN_ANIMATIONS: Record<string, SignAnimation> = {
  Hello: {
    label: 'Hello',
    reviewed: false,
    steps: [
      start,
      { caption: 'Raise your open hand beside your head, palm facing out', ms: 800, hold: 300, right: helloKey },
      ...rock(helloKey, 2, 12, 'Wave gently from the wrist'),
      finish,
    ],
  },
  Yes: {
    label: 'Yes',
    reviewed: false,
    steps: [
      start,
      { caption: 'Make a fist in front of your chest', ms: 700, hold: 200, right: { ...yesKey, shape: 'fist' } },
      { caption: 'Raise your thumb straight up', ms: 500, hold: 500, right: yesKey },
      ...rock(yesKey, 0, 10, 'Hold it steady for a second'),
      finish,
    ],
  },
  No: {
    label: 'No',
    reviewed: false,
    steps: [
      start,
      { caption: 'Close your hand into a fist in front of your chest', ms: 800, hold: 500, right: noKey },
      ...rock(noKey, 1, 14, 'Keep the fingers curled tight; the camera should see your knuckles'),
      finish,
    ],
  },
  '1': {
    label: '1',
    reviewed: false,
    steps: [
      start,
      { caption: 'Raise your hand in front of your chest', ms: 650, right: { shape: 'fist', at: CHEST, rot: [0, 0, 0] } },
      { caption: 'Point your index finger straight up', ms: 500, hold: 1400, right: { shape: 'point', at: CHEST, rot: [0, 0, 0] } },
      finish,
    ],
  },
  '2': {
    label: '2',
    reviewed: false,
    steps: [
      start,
      { caption: 'Raise your hand in front of your chest', ms: 650, right: { shape: 'fist', at: CHEST } },
      { caption: 'Lift your index and middle fingers in a V', ms: 550, hold: 1400, right: { shape: 'vee', at: CHEST } },
      finish,
    ],
  },
  '3': {
    label: '3',
    reviewed: false,
    steps: [
      start,
      { caption: 'Raise your hand in front of your chest', ms: 650, right: { shape: 'fist', at: CHEST } },
      { caption: 'Lift your index, middle and ring fingers', ms: 550, hold: 600, right: { shape: 'three', at: CHEST } },
      { caption: 'Your thumb holds the little finger down', ms: 400, hold: 900, right: { shape: 'three', at: CHEST, rot: [0, 20, 0] } },
      finish,
    ],
  },
  Help: {
    label: 'Help',
    reviewed: false,
    steps: [
      start,
      { caption: 'Raise your hand in front of your chest', ms: 650, right: { shape: 'fist', at: CHEST } },
      { caption: 'Extend your thumb, index and little finger', ms: 550, hold: 1400, right: { shape: 'horns', at: CHEST } },
      finish,
    ],
  },
  SOS: {
    label: 'SOS',
    reviewed: false,
    steps: [
      start,
      { caption: 'Hold your hand up, palm facing out', ms: 750, hold: 300, right: { shape: 'flat', at: [-9, 8, 12] } },
      {
        caption: 'Fold your thumb across your palm. Holding this opens the SOS screen',
        ms: 550,
        hold: 900,
        right: { shape: 'flatThumbTucked', at: [-9, 8, 12] },
      },
      {
        caption: 'Then fold your fingers down over the thumb: the international Signal for Help',
        ms: 600,
        hold: 900,
        right: { shape: 'fist', at: [-9, 8, 12] },
      },
      finish,
    ],
  },
};

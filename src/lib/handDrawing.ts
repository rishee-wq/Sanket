import type { DetectedHand } from '../engine/features';

export const HAND_CONNECTIONS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4], // thumb
  [0, 5], [5, 6], [6, 7], [7, 8], // index
  [0, 9], [9, 10], [10, 11], [11, 12], // middle
  [0, 13], [13, 14], [14, 15], [15, 16], // ring
  [0, 17], [17, 18], [18, 19], [19, 20], // pinky
  [5, 9], [9, 13], [13, 17], // palm
];

const FINGERTIPS = new Set([4, 8, 12, 16, 20]);

export interface HandStyle {
  /** Bone colour per hand. */
  colors: string[];
  joint: string;
  /** Line width in canvas pixels for a 640px-wide frame. */
  weight: number;
}

export const ON_VIDEO: HandStyle = { colors: ['#ffc400', '#ffffff'], joint: '#17140f', weight: 4 };
export const ON_PAPER: HandStyle = { colors: ['#17140f', '#1b3fb5'], joint: '#fffcf4', weight: 5 };
const ACCEPTED = '#2be07f';
const WHOLE = { x0: 0, y0: 0, x1: 1, y1: 1 };

/** Draws one skeleton from pixel-space points. */
export function drawSkeleton(
  ctx: CanvasRenderingContext2D,
  pts: { x: number; y: number }[],
  color: string,
  joint: string,
  unit: number,
  weight: number
) {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = color;
  ctx.lineWidth = weight * unit;
  ctx.beginPath();
  for (const [a, b] of HAND_CONNECTIONS) {
    ctx.moveTo(pts[a].x, pts[a].y);
    ctx.lineTo(pts[b].x, pts[b].y);
  }
  ctx.stroke();

  for (let i = 0; i < pts.length; i++) {
    const tip = FINGERTIPS.has(i);
    const r = (tip ? weight * 1.35 : weight * 0.85) * unit;
    ctx.beginPath();
    ctx.rect(pts[i].x - r, pts[i].y - r, r * 2, r * 2); // square joints, like map markers
    ctx.fillStyle = tip ? color : joint;
    ctx.fill();
    ctx.lineWidth = Math.max(1, weight * 0.4 * unit);
    ctx.strokeStyle = tip ? joint : color;
    ctx.stroke();
  }
}

/** Draws landmarks over a canvas whose pixel size matches the video frame. */
export function drawHands(
  ctx: CanvasRenderingContext2D,
  hands: DetectedHand[],
  mirrored: boolean,
  accepted: boolean,
  style: HandStyle = ON_VIDEO,
  /** Part of the image (0..1 coordinates) to stretch over the canvas; the whole image by default. */
  view: { x0: number; y0: number; x1: number; y1: number } = WHOLE
) {
  const { width, height } = ctx.canvas;
  ctx.clearRect(0, 0, width, height);
  const sx = 1 / (view.x1 - view.x0);
  const sy = 1 / (view.y1 - view.y0);
  hands.forEach((hand, h) => {
    const pts = hand.landmarks.map((p) => {
      const x = (p.x - view.x0) * sx;
      return { x: (mirrored ? 1 - x : x) * width, y: (p.y - view.y0) * sy * height };
    });
    // Line weight follows the hand's size on screen, so a far-away hand is not a blob.
    let size = 0;
    for (const p of pts) size = Math.max(size, Math.hypot(p.x - pts[0].x, p.y - pts[0].y));
    const unit = Math.min(Math.max(width, height) / 640, Math.max(0.3, size / 150));
    drawSkeleton(ctx, pts, accepted ? ACCEPTED : style.colors[h % style.colors.length], style.joint, unit, style.weight);
  });
}

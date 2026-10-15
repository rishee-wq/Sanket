import type { DetectedHand } from '../types/isl';

export const HAND_CONNECTIONS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4], // thumb
  [0, 5], [5, 6], [6, 7], [7, 8], // index
  [0, 9], [9, 10], [10, 11], [11, 12], // middle
  [0, 13], [13, 14], [14, 15], [15, 16], // ring
  [0, 17], [17, 18], [18, 19], [19, 20], // pinky
  [5, 9], [9, 13], [13, 17], // palm
];

const FINGERTIPS = new Set([4, 8, 12, 16, 20]);
const SLOT_COLORS = ['#06b6d4', '#f59e0b'];
const ACCEPTED_COLOR = '#10b981';

/** Draws landmarks over a canvas whose pixel size matches the video frame. */
export function drawHands(ctx: CanvasRenderingContext2D, hands: DetectedHand[], mirrored: boolean, accepted: boolean) {
  const { width, height } = ctx.canvas;
  ctx.clearRect(0, 0, width, height);

  hands.forEach((hand, h) => {
    const color = accepted ? ACCEPTED_COLOR : SLOT_COLORS[h % SLOT_COLORS.length];
    const pts = hand.landmarks.map((p) => ({ x: (mirrored ? 1 - p.x : p.x) * width, y: p.y * height }));
    const unit = Math.max(width, height) / 640;

    ctx.strokeStyle = color;
    ctx.lineWidth = 3.5 * unit;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (const [a, b] of HAND_CONNECTIONS) {
      ctx.moveTo(pts[a].x, pts[a].y);
      ctx.lineTo(pts[b].x, pts[b].y);
    }
    ctx.stroke();

    pts.forEach((p, i) => {
      const tip = FINGERTIPS.has(i);
      ctx.beginPath();
      ctx.arc(p.x, p.y, (tip ? 7 : i === 0 ? 8 : 4) * unit, 0, 2 * Math.PI);
      ctx.fillStyle = tip ? '#ffffff' : color;
      ctx.fill();
      if (tip || i === 0) {
        ctx.lineWidth = 2.5 * unit;
        ctx.strokeStyle = tip ? color : '#ffffff';
        ctx.stroke();
      }
    });
  });
}

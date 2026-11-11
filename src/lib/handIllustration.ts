/**
 * Draws hand landmarks as a solid, shaded hand instead of a stick figure.
 *
 * Each finger is a thick, tapering stroke with an ink outline, the palm is a
 * filled polygon, and every part is painted back to front by depth (the
 * painter's algorithm), so a finger in front of the palm covers it, as it would
 * in real life. The whole scene can be turned in 3-D (yaw / pitch), because
 * MediaPipe gives a depth value for every point.
 */
import type { DetectedHand } from '../engine/features';

const INK = '#17140f';
export const SKIN_TONES = ['#f1c9a5', '#dba47a', '#b97c54', '#8a5636'];

const PALM = [0, 1, 5, 9, 13, 17];
const FINGERS: { chain: number[]; width: number }[] = [
  { chain: [1, 2, 3, 4], width: 0.15 },
  { chain: [5, 6, 7, 8], width: 0.125 },
  { chain: [9, 10, 11, 12], width: 0.13 },
  { chain: [13, 14, 15, 16], width: 0.12 },
  { chain: [17, 18, 19, 20], width: 0.105 },
];

type P3 = [number, number, number];

export interface FigureOptions {
  /** Turn left/right and up/down, in radians. */
  yaw: number;
  pitch: number;
  mirror: boolean;
  skin: string;
  /** Image aspect (width / height) the landmarks were measured in. */
  aspect: number;
}

function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(c * (1 + amount))));
  // Hex out as well as in, so shades can be shaded again.
  return `#${((f(n >> 16) << 16) | (f((n >> 8) & 255) << 8) | f(n & 255)).toString(16).padStart(6, '0')}`;
}

/** Centre and radius of a set of hands, measured once so the view does not jump while the hand turns. */
export function handsBounds(frames: DetectedHand[][], aspect: number): { centre: P3; radius: number } {
  let sx = 0;
  let sy = 0;
  let sz = 0;
  let n = 0;
  for (const hands of frames)
    for (const h of hands)
      for (const p of h.landmarks) {
        sx += p.x * aspect;
        sy += p.y;
        sz += p.z * aspect;
        n++;
      }
  const centre: P3 = n ? [sx / n, sy / n, sz / n] : [0.5, 0.5, 0];
  let radius = 1e-3;
  for (const hands of frames)
    for (const h of hands)
      for (const p of h.landmarks)
        radius = Math.max(radius, Math.hypot(p.x * aspect - centre[0], p.y - centre[1], p.z * aspect - centre[2]));
  return { centre, radius };
}

export function drawFigure(
  ctx: CanvasRenderingContext2D,
  hands: DetectedHand[],
  bounds: { centre: P3; radius: number },
  opts: FigureOptions
) {
  const { width, height } = ctx.canvas;
  ctx.clearRect(0, 0, width, height);
  const fit = (Math.min(width, height) * 0.42) / bounds.radius;
  const [cx, cy, cz] = bounds.centre;
  const cyaw = Math.cos(opts.yaw);
  const syaw = Math.sin(opts.yaw);
  const cpit = Math.cos(opts.pitch);
  const spit = Math.sin(opts.pitch);

  // Rotate about the centre, then project straight onto the screen (orthographic).
  const project = (p: { x: number; y: number; z: number }): P3 => {
    let x = p.x * opts.aspect - cx;
    const y = p.y - cy;
    let z = p.z * opts.aspect - cz;
    [x, z] = [x * cyaw + z * syaw, -x * syaw + z * cyaw];
    const y2 = y * cpit - z * spit;
    const z2 = y * spit + z * cpit;
    return [width / 2 + (opts.mirror ? -x : x) * fit, height / 2 + y2 * fit, z2];
  };

  type Part = { depth: number; draw: () => void };
  const parts: Part[] = [];

  hands.forEach((hand, h) => {
    const pts = hand.landmarks.map(project);
    let size = 0;
    for (const p of pts) size = Math.max(size, Math.hypot(p[0] - pts[0][0], p[1] - pts[0][1], p[2] - pts[0][2]));
    // Keep fingers a believable width even when the hand is seen edge-on.
    const unit = Math.max(size, bounds.radius * fit * 0.6);
    const skin = h === 0 ? opts.skin : shade(opts.skin, -0.08);
    const outline = Math.max(2, unit * 0.022);

    parts.push({
      depth: PALM.reduce((a, i) => a + pts[i][2], 0) / PALM.length,
      draw: () => {
        ctx.beginPath();
        PALM.forEach((i, k) => (k ? ctx.lineTo(pts[i][0], pts[i][1]) : ctx.moveTo(pts[i][0], pts[i][1])));
        ctx.closePath();
        ctx.lineJoin = 'round';
        ctx.lineWidth = unit * 0.12 + outline * 2;
        ctx.strokeStyle = INK;
        ctx.stroke();
        ctx.lineWidth = unit * 0.12;
        ctx.strokeStyle = skin;
        ctx.stroke();
        ctx.fillStyle = skin;
        ctx.fill();
        // Wrist stub, so the hand does not end in mid-air.
        const w = pts[0];
        const dx = w[0] - (pts[5][0] + pts[17][0]) / 2;
        const dy = w[1] - (pts[5][1] + pts[17][1]) / 2;
        const len = Math.hypot(dx, dy) || 1;
        ctx.lineCap = 'butt';
        ctx.beginPath();
        ctx.moveTo(w[0], w[1]);
        ctx.lineTo(w[0] + (dx / len) * unit * 0.35, w[1] + (dy / len) * unit * 0.35);
        ctx.lineWidth = unit * 0.36 + outline * 2;
        ctx.strokeStyle = INK;
        ctx.stroke();
        ctx.lineWidth = unit * 0.36;
        ctx.strokeStyle = shade(skin, -0.12);
        ctx.stroke();
      },
    });

    for (const { chain, width: fw } of FINGERS) {
      parts.push({
        depth: chain.reduce((a, i) => a + pts[i][2], 0) / chain.length - 1e-4,
        draw: () => {
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          // Ink pass for the whole finger first, then skin, so segments join without seams.
          for (const pass of [0, 1]) {
            for (let k = 0; k < chain.length - 1; k++) {
              const a = pts[chain[k]];
              const b = pts[chain[k + 1]];
              const taper = 1 - k * 0.12;
              ctx.beginPath();
              ctx.moveTo(a[0], a[1]);
              ctx.lineTo(b[0], b[1]);
              ctx.lineWidth = unit * fw * taper + (pass ? 0 : outline * 2);
              ctx.strokeStyle = pass ? skin : INK;
              ctx.stroke();
            }
          }
          // Nail on the fingertip.
          const tip = pts[chain[chain.length - 1]];
          const prev = pts[chain[chain.length - 2]];
          const nx = tip[0] + (prev[0] - tip[0]) * 0.18;
          const ny = tip[1] + (prev[1] - tip[1]) * 0.18;
          ctx.beginPath();
          ctx.arc(nx, ny, unit * fw * 0.26, 0, Math.PI * 2);
          ctx.fillStyle = shade(skin, 0.18);
          ctx.fill();
        },
      });
    }
  });

  // Painter's algorithm: farthest first. MediaPipe's z grows away from the camera.
  parts.sort((a, b) => b.depth - a.depth);
  for (const part of parts) part.draw();
}

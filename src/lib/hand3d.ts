/**
 * A sculpted 3-D hand for the cover: the same 21 MediaPipe landmarks the
 * models read, drawn as porcelain. Bones are shaded like cylinders, joints
 * like glossy spheres, the palm is a translucent shell, and everything is
 * seen through a perspective camera that slowly orbits the hand.
 *
 * MediaPipe gives every point a depth (z), so the hand really is 3-D: turning
 * the camera shows its true shape. Parts are painted far to near (the
 * painter's algorithm), and far parts fade into the background, like haze.
 */
import type { DetectedHand } from '../engine/features';

const BONES: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [9, 10], [10, 11], [11, 12],
  [13, 14], [14, 15], [15, 16],
  [0, 17], [17, 18], [18, 19], [19, 20],
  [5, 9], [9, 13], [13, 17],
];
const PALM = [0, 1, 5, 9, 13, 17];
const TIPS = new Set([4, 8, 12, 16, 20]);

/** Porcelain on terracotta: highlight, body, shadow. */
const LIGHT = '#fffaf3';
const BODY = '#f3d9c4';
const SHADE = '#8f4426';
const GLOW = '#8ee08a';

export interface Camera {
  /** Centre of the hands in image units (x already multiplied by the aspect). */
  cx: number;
  cy: number;
  /** Half the height of the region to fit in the canvas. */
  radius: number;
  yaw: number;
  pitch: number;
  mirror: boolean;
  aspect: number;
}

type P = { x: number; y: number; z: number; s: number };

export function drawHands3D(ctx: CanvasRenderingContext2D, hands: DetectedHand[], cam: Camera, accepted: boolean) {
  const { width, height } = ctx.canvas;
  ctx.clearRect(0, 0, width, height);
  if (!hands.length) return;

  const fit = (Math.min(width, height) * 0.5) / cam.radius;
  const dist = cam.radius * 4; // camera distance: mild, natural perspective
  const cy = Math.cos(cam.yaw);
  const sy = Math.sin(cam.yaw);
  const cp = Math.cos(cam.pitch);
  const sp = Math.sin(cam.pitch);

  const project = (lx: number, ly: number, lz: number): P => {
    let x = lx * cam.aspect - cam.cx;
    const y = ly - cam.cy;
    let z = lz * cam.aspect;
    if (cam.mirror) x = -x;
    [x, z] = [x * cy + z * sy, -x * sy + z * cy];
    const y2 = y * cp - z * sp;
    const z2 = y * sp + z * cp;
    const s = dist / (dist + z2); // nearer → bigger
    return { x: width / 2 + x * fit * s, y: height / 2 + y2 * fit * s, z: z2, s };
  };

  // The hand's own z is relative to its wrist; give each hand its wrist depth back (0 here), so both share a stage.
  const all = hands.map((h) => h.landmarks.map((p) => project(p.x, p.y, p.z)));

  // Soft shadow on the "floor" under the hands.
  let minX = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const pts of all) for (const p of pts) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  const sx = (minX + maxX) / 2;
  const sw = Math.max(40, (maxX - minX) * 0.6);
  const shadowY = Math.min(height * 0.9, maxY + height * 0.06);
  const g = ctx.createRadialGradient(sx, shadowY, 0, sx, shadowY, sw);
  g.addColorStop(0, 'rgba(36,22,18,0.35)');
  g.addColorStop(1, 'rgba(36,22,18,0)');
  ctx.save();
  ctx.translate(sx, shadowY);
  ctx.scale(1, 0.22);
  ctx.translate(-sx, -shadowY);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(sx, shadowY, sw, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  type Part = { z: number; draw: () => void };
  const parts: Part[] = [];
  let zMin = Infinity, zMax = -Infinity;
  for (const pts of all) for (const p of pts) {
    zMin = Math.min(zMin, p.z);
    zMax = Math.max(zMax, p.z);
  }
  const haze = (z: number) => 1 - 0.45 * ((z - zMin) / (zMax - zMin || 1)); // far parts fade

  all.forEach((pts) => {
    // Bone thickness follows the hand's size on screen.
    let size = 0;
    for (const p of pts) size = Math.max(size, Math.hypot(p.x - pts[0].x, p.y - pts[0].y));
    const unit = Math.max(12, size) / 16;

    // Palm shell
    parts.push({
      z: PALM.reduce((a, i) => a + pts[i].z, 0) / PALM.length + 1e-3,
      draw: () => {
        ctx.globalAlpha = 0.42 * haze(pts[9].z);
        const c = pts[9];
        const pg = ctx.createRadialGradient(c.x - unit, c.y - unit, unit * 0.5, c.x, c.y, size * 0.7);
        pg.addColorStop(0, LIGHT);
        pg.addColorStop(1, BODY);
        ctx.fillStyle = pg;
        ctx.beginPath();
        PALM.forEach((i, k) => (k ? ctx.lineTo(pts[i].x, pts[i].y) : ctx.moveTo(pts[i].x, pts[i].y)));
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = 1;
      },
    });

    // Bones: cylinders shaded across their width.
    for (const [a, b] of BONES) {
      const A = pts[a];
      const B = pts[b];
      parts.push({
        z: (A.z + B.z) / 2,
        draw: () => {
          const r = unit * 0.55 * ((A.s + B.s) / 2);
          const dx = B.x - A.x;
          const dy = B.y - A.y;
          const len = Math.hypot(dx, dy) || 1;
          const nx = -dy / len;
          const ny = dx / len;
          const mx = (A.x + B.x) / 2;
          const my = (A.y + B.y) / 2;
          const lg = ctx.createLinearGradient(mx - nx * r, my - ny * r, mx + nx * r, my + ny * r);
          lg.addColorStop(0, SHADE);
          lg.addColorStop(0.32, BODY);
          lg.addColorStop(0.48, LIGHT);
          lg.addColorStop(1, SHADE);
          ctx.globalAlpha = haze((A.z + B.z) / 2);
          ctx.strokeStyle = lg;
          ctx.lineWidth = r * 2;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(A.x, A.y);
          ctx.lineTo(B.x, B.y);
          ctx.stroke();
          ctx.globalAlpha = 1;
        },
      });
    }

    // Joints: glossy spheres, a little proud of the bones.
    pts.forEach((p, i) => {
      parts.push({
        z: p.z - 1e-4,
        draw: () => {
          const tip = TIPS.has(i);
          const r = unit * (tip ? 1.05 : i === 0 ? 1.15 : 0.85) * p.s;
          const sg = ctx.createRadialGradient(p.x - r * 0.35, p.y - r * 0.4, r * 0.1, p.x, p.y, r);
          sg.addColorStop(0, '#ffffff');
          sg.addColorStop(0.35, tip && accepted ? GLOW : BODY);
          sg.addColorStop(1, tip && accepted ? '#2e7d4f' : SHADE);
          ctx.globalAlpha = haze(p.z);
          if (tip && accepted) {
            ctx.shadowColor = GLOW;
            ctx.shadowBlur = r * 2.2;
          }
          ctx.fillStyle = sg;
          ctx.beginPath();
          ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
          ctx.globalAlpha = 1;
        },
      });
    });
  });

  parts.sort((a, b) => b.z - a.z); // far first
  for (const part of parts) part.draw();
}

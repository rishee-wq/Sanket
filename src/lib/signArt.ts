/**
 * Draws the landing-page sign cards on a canvas: a glowing hand-landmark skeleton,
 * like the live camera overlay, plus the card's title. No photos are used.
 */
import type { SphereCard } from '../data/sphereCards';
import { HAND_CONNECTIONS } from './handDrawing';
import { SimulatedPose, simulatedHand } from './simulatedPoses';

export type ArtPose = SimulatedPose | '3' | 'Water' | 'Doctor' | 'Pain' | 'Thank you' | 'O';

type Pt = [number, number];

const SIMULATED = new Set<string>(['Hello', 'Yes', 'No', '1', '2', 'Help', 'SOS']);

/** 21 (x, y) points for a pose, in the same unit space as the simulator. */
export function artPoints(pose: ArtPose): Pt[] {
  if (SIMULATED.has(pose)) return simulatedHand(pose as SimulatedPose).landmarks.map((p) => [p.x, p.y]);

  const pts = simulatedHand('Hello').landmarks.map((p) => [p.x, p.y] as Pt);
  const curl = (tips: number[]) => {
    const curled: Record<number, Pt> = { 4: [0.44, 0.63], 8: [0.46, 0.64], 12: [0.5, 0.64], 16: [0.54, 0.64], 20: [0.58, 0.65] };
    tips.forEach((t) => (pts[t] = curled[t]));
  };

  switch (pose) {
    case '3':
      curl([4, 20]);
      break;
    case 'Water':
      curl([4, 8, 12, 16]);
      break;
    case 'Doctor':
      curl([12, 16, 20]);
      pts[3] = [0.36, 0.64];
      pts[4] = [0.3, 0.6];
      break;
    case 'Pain': {
      // Thumbs-up turned upside down around the wrist.
      const up = artPoints('Yes');
      return up.map(([x, y]) => [1 - x, 1.6 - y]);
    }
    case 'Thank you':
      pts[3] = [0.39, 0.6];
      pts[4] = [0.405, 0.55];
      pts[6] = [0.44, 0.52];
      pts[7] = [0.42, 0.52];
      pts[8] = [0.41, 0.545];
      break;
    case 'O':
      pts[3] = [0.4, 0.6];
      pts[4] = [0.43, 0.535];
      pts[7] = [0.43, 0.46];
      pts[8] = [0.445, 0.505];
      pts[11] = [0.48, 0.43];
      pts[12] = [0.47, 0.49];
      pts[15] = [0.52, 0.45];
      pts[16] = [0.5, 0.5];
      pts[19] = [0.56, 0.48];
      pts[20] = [0.53, 0.52];
      break;
  }
  return pts;
}

const FINGERTIPS = new Set([4, 8, 12, 16, 20]);
const SAFFRON = '#ff9a3c';
const PERIWINKLE = '#b4c0ff';

function drawHand(ctx: CanvasRenderingContext2D, pts: Pt[], color: string, unit: number) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.shadowColor = color;

  // A wide soft pass for glow, then the crisp bones.
  for (const [width, alpha, blur] of [
    [7, 0.18, 26],
    [2.4, 0.95, 10],
  ] as const) {
    ctx.globalAlpha = alpha;
    ctx.lineWidth = width * unit;
    ctx.shadowBlur = blur * unit;
    ctx.beginPath();
    for (const [a, b] of HAND_CONNECTIONS) {
      ctx.moveTo(pts[a][0], pts[a][1]);
      ctx.lineTo(pts[b][0], pts[b][1]);
    }
    ctx.stroke();
  }

  ctx.globalAlpha = 1;
  ctx.shadowBlur = 12 * unit;
  pts.forEach(([x, y], i) => {
    ctx.beginPath();
    ctx.arc(x, y, (FINGERTIPS.has(i) ? 4.2 : i === 0 ? 5 : 2.6) * unit, 0, Math.PI * 2);
    ctx.fillStyle = FINGERTIPS.has(i) || i === 0 ? '#ffffff' : color;
    ctx.fill();
  });
  ctx.restore();
}

/** Fits one or two hands into a box, mirroring the second so they face each other. */
function layoutHands(poses: ArtPose[], box: { x: number; y: number; w: number; h: number }): Pt[][] {
  const hands = poses.map((pose, i) => {
    const pts = artPoints(pose);
    return i === 1 ? pts.map(([x, y]) => [1 - x, y] as Pt) : pts;
  });
  const slotW = box.w / hands.length;

  return hands.map((pts, i) => {
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const s = Math.min((slotW * 0.86) / (maxX - minX), (box.h * 0.92) / (maxY - minY));
    const cx = box.x + slotW * (i + 0.5);
    const cy = box.y + box.h / 2;
    return pts.map(([x, y]) => [cx + (x - (minX + maxX) / 2) * s, cy + (y - (minY + maxY) / 2) * s] as Pt);
  });
}

/** Pre-rendered 3D hands for a card, drawn into the hand box. */
export type HandPainter = (ctx: CanvasRenderingContext2D, box: { x: number; y: number; w: number; h: number }) => void;

/**
 * Renders a card to a canvas of the given pixel size. With `paintHands` the hands come from
 * the 3D renderer; without it (no WebGL) they fall back to a landmark drawing.
 */
export function drawCard(
  card: SphereCard,
  index: number,
  total: number,
  width: number,
  height: number,
  paintHands?: HandPainter
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  const unit = width / 600;
  const accent = card.kind === 'sign' ? SAFFRON : PERIWINKLE;
  const pad = 30 * unit;

  // Background: near-black with a warm (signs) or cool (places) light source.
  ctx.fillStyle = '#050505';
  ctx.fillRect(0, 0, width, height);
  const glow = ctx.createRadialGradient(width * 0.68, height * 0.36, 0, width * 0.68, height * 0.36, Math.max(width, height) * 0.75);
  glow.addColorStop(0, card.kind === 'sign' ? 'rgba(255,140,40,0.22)' : 'rgba(120,140,255,0.2)');
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);

  // Faint dot grid, like a measurement plate.
  ctx.fillStyle = 'rgba(244,242,239,0.06)';
  const step = 24 * unit;
  for (let x = step; x < width; x += step) for (let y = step; y < height; y += step) ctx.fillRect(x, y, unit, unit);

  const tall = height > width;
  const box = tall
    ? { x: width * 0.12, y: height * 0.16, w: width * 0.76, h: height * 0.5 }
    : { x: width * (card.poses.length > 1 ? 0.3 : 0.4), y: height * 0.1, w: width * (card.poses.length > 1 ? 0.66 : 0.54), h: height * 0.66 };
  if (paintHands) paintHands(ctx, box);
  else for (const pts of layoutHands(card.poses, box)) drawHand(ctx, pts, accent, unit);

  // Kicker and index.
  ctx.fillStyle = 'rgba(244,242,239,0.55)';
  ctx.font = `600 ${11 * unit}px "Instrument Sans"`;
  ctx.letterSpacing = `${2.4 * unit}px`;
  ctx.textBaseline = 'top';
  ctx.fillText(card.kind === 'sign' ? 'SIGN' : 'PLACE', pad, pad);
  ctx.textAlign = 'right';
  ctx.font = `500 ${11 * unit}px "JetBrains Mono"`;
  ctx.letterSpacing = '0px';
  ctx.fillText(`${String(index + 1).padStart(2, '0')}/${total}`, width - pad, pad);

  // Hindi word, faint, upper right under the index.
  ctx.fillStyle = 'rgba(244,242,239,0.28)';
  ctx.font = `400 ${22 * unit}px "Noto Serif Devanagari"`;
  ctx.fillText(card.hindi, width - pad, pad + 22 * unit);

  // Title.
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#f4f2ef';
  let size = (tall ? 64 : 54) * unit;
  ctx.font = `400 ${size}px "Instrument Serif"`;
  const maxW = width - pad * 2;
  while (ctx.measureText(card.title).width > maxW && size > 20 * unit) {
    size -= 2 * unit;
    ctx.font = `400 ${size}px "Instrument Serif"`;
  }
  ctx.fillText(card.title, pad, height - pad - 18 * unit);

  ctx.fillStyle = accent;
  ctx.font = `500 ${12 * unit}px "Instrument Sans"`;
  ctx.fillText(card.where, pad, height - pad);

  return canvas;
}

export const FONTS_FOR_ART = [
  '400 54px "Instrument Serif"',
  '600 11px "Instrument Sans"',
  '500 12px "Instrument Sans"',
  '500 11px "JetBrains Mono"',
  '400 22px "Noto Serif Devanagari"',
];

/** Loads the card fonts (best effort; canvas falls back to system fonts if this fails). */
export async function loadArtFonts(sample: string) {
  try {
    await Promise.all(FONTS_FOR_ART.map((f) => document.fonts.load(f, sample)));
  } catch {
    // Fonts are a nicety; drawing still works without them.
  }
}

export function canvasToUrl(canvas: HTMLCanvasElement): Promise<string> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob ? URL.createObjectURL(blob) : canvas.toDataURL()), 'image/webp', 0.88);
  });
}

import { useCallback, useEffect, useRef, useState } from 'react';
import { SPHERE_CARDS } from '../data/sphereCards';
import type { HandStillRenderer } from '../lib/handStills';
import { canvasToUrl, drawCard, loadArtFonts } from '../lib/signArt';

/** Card bitmap width by viewport, like the decode caps for sphere thumbnails. */
function cardPixelWidth() {
  const w = window.innerWidth;
  const base = w <= 380 ? 420 : w <= 640 ? 520 : w <= 900 ? 640 : 760;
  return Math.round(base * Math.min(2, window.devicePixelRatio || 1) * 0.75);
}

const heightFor = (i: number, w: number) => (SPHERE_CARDS[i].tall ? Math.round(w * 1.25) : Math.round(w / 1.5));

/**
 * Renders every sphere card to an image URL, with 3D hands when WebGL is available.
 * `progress` counts the fonts and the 3D renderer as one step and each card as one step,
 * for the splash bar. `renderLarge` draws a sharper copy for the lightbox.
 */
export function useCardArt() {
  const [urls, setUrls] = useState<(string | null)[]>(() => SPHERE_CARDS.map(() => null));
  const [done, setDone] = useState(0);
  const stills = useRef<HandStillRenderer | null>(null);

  useEffect(() => {
    let alive = true;
    const created: string[] = [];
    (async () => {
      const [, mod] = await Promise.all([
        loadArtFonts(SPHERE_CARDS.map((c) => c.hindi + c.title).join('')),
        import('../lib/handStills').catch(() => null),
      ]);
      if (!alive) return;
      try {
        stills.current = mod?.createHandStills() ?? null;
      } catch {
        stills.current = null; // No WebGL: cards fall back to landmark drawings.
      }
      setDone(1);
      const w = cardPixelWidth();
      for (let i = 0; i < SPHERE_CARDS.length; i++) {
        const card = SPHERE_CARDS[i];
        const canvas = drawCard(card, i, SPHERE_CARDS.length, w, heightFor(i, w), stills.current?.painterFor(card.poses));
        const url = await canvasToUrl(canvas);
        if (!alive) {
          URL.revokeObjectURL(url);
          return;
        }
        created.push(url);
        setUrls((prev) => prev.map((u, j) => (j === i ? url : u)));
        setDone(i + 2);
        // Yield so the splash keeps animating between cards.
        await new Promise((r) => setTimeout(r, 0));
      }
    })();
    return () => {
      alive = false;
      created.forEach((u) => URL.revokeObjectURL(u));
      stills.current?.dispose();
      stills.current = null;
    };
  }, []);

  const renderLarge = useCallback((index: number, width = 1500) => {
    const card = SPHERE_CARDS[index];
    return canvasToUrl(drawCard(card, index, SPHERE_CARDS.length, width, heightFor(index, width), stills.current?.painterFor(card.poses)));
  }, []);

  const total = SPHERE_CARDS.length + 1;
  return { urls, progress: done / total, ready: done === total, renderLarge };
}

import { useEffect, useState } from 'react';
import { SPHERE_CARDS } from '../data/sphereCards';
import { canvasToUrl, drawCard, loadArtFonts } from '../lib/signArt';

/** Card bitmap width by viewport, like the decode caps for sphere thumbnails. */
function cardPixelWidth() {
  const w = window.innerWidth;
  const base = w <= 380 ? 420 : w <= 640 ? 520 : w <= 900 ? 640 : 760;
  return Math.round(base * Math.min(2, window.devicePixelRatio || 1) * 0.75);
}

/**
 * Renders every sphere card to an image URL. `progress` counts the fonts as one step
 * and each card as one step, for the splash bar.
 */
export function useCardArt() {
  const [urls, setUrls] = useState<(string | null)[]>(() => SPHERE_CARDS.map(() => null));
  const [done, setDone] = useState(0);

  useEffect(() => {
    let alive = true;
    const created: string[] = [];
    (async () => {
      await loadArtFonts(SPHERE_CARDS.map((c) => c.hindi + c.title).join(''));
      if (!alive) return;
      setDone(1);
      const w = cardPixelWidth();
      for (let i = 0; i < SPHERE_CARDS.length; i++) {
        const card = SPHERE_CARDS[i];
        const canvas = drawCard(card, i, SPHERE_CARDS.length, w, card.tall ? Math.round(w * 1.25) : Math.round(w / 1.5));
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
    };
  }, []);

  const total = SPHERE_CARDS.length + 1;
  return { urls, progress: done / total, ready: done === total };
}

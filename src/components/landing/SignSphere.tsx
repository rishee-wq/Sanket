import React, { useCallback, useEffect, useRef, useState } from 'react';
import { SPHERE_CARDS } from '../../data/sphereCards';
import './signSphere.css';

/**
 * A Fibonacci sphere of sign and place cards with the headline at its centre.
 * Drag to rotate (with momentum), scroll to dolly in, click a card for details.
 * Everything per-frame is written straight to the DOM from one rAF loop.
 */

const N = SPHERE_CARDS.length;
const GA = Math.PI * (3 - Math.sqrt(5));
const DEG = 180 / Math.PI;
const PITCH_LIMIT = 32;
const DRAG_DEG_PER_PX = 0.13;

/** Unit vectors on a Fibonacci sphere, with the yaw/pitch that face each card outward. */
const POINTS = Array.from({ length: N }, (_, i) => {
  const y = 1 - (i / (N - 1)) * 2;
  const rad = Math.sqrt(Math.max(0, 1 - y * y));
  const theta = i * GA;
  const x = Math.cos(theta) * rad;
  const z = Math.sin(theta) * rad;
  return { x, y, z, lat: Math.asin(y) * DEG, lon: Math.atan2(x, z) * DEG };
});

function layoutFor(w: number, h: number) {
  const small = w <= 380;
  const mid = w <= 640;
  const hr = small ? 0.38 : mid ? 0.42 : 0.46;
  const wr = small ? 0.48 : mid ? 0.52 : 0.58;
  const floor = small ? 108 : mid ? 120 : 155;
  const R = Math.max(floor, Math.min(480, h * hr, w * wr));
  const scale = small ? 0.44 : mid ? 0.46 : 0.47;
  const cw = Math.round(Math.max(72, R * scale));
  const persp = small ? 620 : mid ? 760 : w <= 900 ? 920 : 1150;
  return { R, cw, persp };
}

const HEADLINE = ['Every', 'sign', 'deserves', 'to be', 'heard.'];

interface SignSphereProps {
  urls: (string | null)[];
  revealed: boolean;
  /** Renders a high-resolution copy of a card for the lightbox. */
  renderLarge: (index: number) => Promise<string>;
}

export const SignSphere: React.FC<SignSphereProps> = ({ urls, revealed, renderLarge }) => {
  const sectionRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const headlineRef = useRef<HTMLHeadingElement>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const gridRefs = useRef<(HTMLElement | null)[]>([]);
  const plateRef = useRef<HTMLDivElement>(null);
  const dotRef = useRef<HTMLDivElement>(null);

  const [gridView, setGridView] = useState(false);
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const [litSrc, setLitSrc] = useState<string | null>(null);

  // Shared with the loop without re-rendering.
  const state = useRef({
    spin: 0,
    tilt: -4,
    camZ: 0,
    dragX: 0,
    dragY: 0,
    velX: 0,
    velY: 0,
    dragging: false,
    focused: -1,
    R: 300,
    persp: 1150,
    lastSize: { w: 0, h: 0 },
    deep: false,
  });

  const applyLayout = useCallback((force = false) => {
    const section = sectionRef.current;
    if (!section) return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const s = state.current;
    if (!force && Math.abs(w - s.lastSize.w) < 20 && Math.abs(h - s.lastSize.h) < 20) return;
    s.lastSize = { w, h };
    const { R, cw, persp } = layoutFor(w, h);
    s.R = R;
    s.persp = persp;
    section.style.setProperty('--cw', `${cw}px`);
    section.style.setProperty('--persp', `${persp}px`);
    POINTS.forEach((p, i) => {
      const el = cardRefs.current[i];
      if (el) {
        el.style.transform = `translate3d(${p.x * R}px, ${-p.y * R}px, ${p.z * R}px) rotateY(${p.lon}deg) rotateX(${p.lat}deg)`;
      }
    });
  }, []);

  // Layout + camera loop.
  useEffect(() => {
    applyLayout(true);
    const s = state.current;
    const lastWritten = POINTS.map(() => ({ opacity: '', d: '' }));
    let frame = 0;

    const tick = () => {
      const section = sectionRef.current;
      const world = worldRef.current;
      const headline = headlineRef.current;
      if (!section || !world || !headline) return;

      if (!s.dragging && s.focused < 0) {
        s.dragX += s.velX;
        s.dragY += s.velY;
        s.velX *= 0.94;
        s.velY *= 0.94;
        if (Math.abs(s.velX) < 0.002) s.velX = 0;
        if (Math.abs(s.velY) < 0.002) s.velY = 0;
      }
      s.dragY = Math.max(-PITCH_LIMIT - s.tilt, Math.min(PITCH_LIMIT - s.tilt, s.dragY));

      // Scroll progress through the sticky part of the section drives the dolly.
      const rect = section.getBoundingClientRect();
      const range = section.offsetHeight - window.innerHeight;
      const p = Math.max(0, Math.min(1, -rect.top / (range * 0.6 || 1)));
      const deep = p > 0.02;
      if (deep !== s.deep) {
        s.deep = deep;
        section.classList.toggle('deep', deep);
      }

      const camZTarget = p * Math.min(64, s.R * 0.12);
      s.camZ += (camZTarget - s.camZ) * 0.075;
      const sx = s.tilt + s.dragY;
      const sy = s.spin + s.dragX;

      world.style.transform = `translateZ(${s.camZ.toFixed(2)}px) rotateY(${sy.toFixed(3)}deg) rotateX(${sx.toFixed(3)}deg)`;
      headline.style.transform = `rotateX(${(-sx).toFixed(3)}deg) rotateY(${(-sy).toFixed(3)}deg) translateZ(${(s.R * 0.62).toFixed(1)}px)`;
      headline.style.opacity = String(Math.max(0, 1 - p * 0.55));

      // Depth shading: rotate each unit vector like CSS does (rotateX first, then rotateY).
      const ax = sx / DEG;
      const ay = sy / DEG;
      const cx = Math.cos(ax), snx = Math.sin(ax), cy = Math.cos(ay), sny = Math.sin(ay);
      const shade = 1 - Math.min(1, p * 1.6);
      const near = s.persp * 0.66;
      POINTS.forEach((pt, i) => {
        const el = cardRefs.current[i];
        if (!el) return;
        // CSS point is (x, -y, z); only the depth component is needed.
        const z1 = -pt.y * snx + pt.z * cx;
        const zf = -pt.x * sny + z1 * cy;
        const base = 0.14 + 0.86 * Math.pow((zf + 1) / 2, 0.85);
        let dim = shade * (1 - base);
        const absZ = zf * s.R + s.camZ;
        let fade = absZ > near ? Math.max(0, 1 - (absZ - near) / 190) : 1;
        if (s.focused >= 0) {
          dim = Math.min(1, dim + 0.78);
          if (i === s.focused) fade = 0;
        }
        const opacity = fade.toFixed(3);
        const d = dim.toFixed(3);
        if (lastWritten[i].opacity !== opacity) {
          el.style.opacity = opacity;
          lastWritten[i].opacity = opacity;
        }
        if (lastWritten[i].d !== d) {
          el.style.setProperty('--d', d);
          lastWritten[i].d = d;
        }
      });
    };

    const loop = () => {
      tick();
      frame = requestAnimationFrame(loop);
    };
    tick();
    frame = requestAnimationFrame(loop);

    const onResize = () => applyLayout();
    const onOrientation = () => setTimeout(() => applyLayout(true), 220);
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onOrientation);
    window.visualViewport?.addEventListener('resize', onResize);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onOrientation);
      window.visualViewport?.removeEventListener('resize', onResize);
    };
  }, [applyLayout]);

  // Drag to rotate; a click without movement opens the card under the pointer.
  useEffect(() => {
    const stage = stageRef.current!;
    const s = state.current;
    let id: number | null = null;
    let startX = 0, startY = 0, lastX = 0, lastY = 0, lastT = 0;
    let moved = 0;
    let captured = false;
    let pendingTouch = false;
    let downCard = -1;

    const onDown = (e: PointerEvent) => {
      if (s.focused >= 0 || id !== null) return;
      const card = (e.target as HTMLElement).closest<HTMLElement>('.card');
      downCard = card ? Number(card.dataset.idx) : -1;
      id = e.pointerId;
      startX = lastX = e.clientX;
      startY = lastY = e.clientY;
      lastT = performance.now();
      moved = 0;
      s.velX = s.velY = 0;
      if (e.pointerType === 'touch') {
        pendingTouch = true;
        captured = false;
      } else {
        pendingTouch = false;
        captured = true;
        s.dragging = true;
        stage.setPointerCapture(e.pointerId);
        stage.classList.add('dragging');
      }
    };

    const onMove = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      moved = Math.max(moved, Math.hypot(e.clientX - startX, e.clientY - startY));

      if (pendingTouch) {
        if (moved < 10) return;
        const ax = Math.abs(e.clientX - startX);
        const ay = Math.abs(e.clientY - startY);
        if (ay > ax * 1.15) {
          // Vertical swipe: let the page scroll.
          id = null;
          pendingTouch = false;
          return;
        }
        pendingTouch = false;
        captured = true;
        s.dragging = true;
        stage.setPointerCapture(e.pointerId);
      }
      if (!captured) return;

      const now = performance.now();
      const dt = Math.max(1, now - lastT);
      s.dragX += dx * DRAG_DEG_PER_PX;
      s.dragY -= dy * DRAG_DEG_PER_PX;
      // Velocity per ~16 ms frame, for momentum after release.
      s.velX = ((dx * DRAG_DEG_PER_PX) / dt) * 16;
      s.velY = ((-dy * DRAG_DEG_PER_PX) / dt) * 16;
      lastX = e.clientX;
      lastY = e.clientY;
      lastT = now;
    };

    const onUp = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      const slop = e.pointerType === 'touch' || window.matchMedia('(pointer: coarse)').matches ? 14 : 6;
      const wasClick = moved < slop;
      if (performance.now() - lastT > 80) s.velX = s.velY = 0;
      s.dragging = false;
      stage.classList.remove('dragging');
      if (captured && stage.hasPointerCapture(e.pointerId)) stage.releasePointerCapture(e.pointerId);
      id = null;
      captured = false;
      pendingTouch = false;
      if (wasClick && downCard >= 0 && e.type === 'pointerup') openCardRef.current(downCard, cardRefs.current[downCard]);
    };

    stage.addEventListener('pointerdown', onDown);
    stage.addEventListener('pointermove', onMove);
    stage.addEventListener('pointerup', onUp);
    stage.addEventListener('pointercancel', onUp);
    return () => {
      stage.removeEventListener('pointerdown', onDown);
      stage.removeEventListener('pointermove', onMove);
      stage.removeEventListener('pointerup', onUp);
      stage.removeEventListener('pointercancel', onUp);
    };
  }, []);

  // Lightbox with a FLIP from the source card.
  const openToken = useRef(0);
  const sourceEl = useRef<HTMLElement | null>(null);

  const flipFrom = (from: HTMLElement | null) => {
    const plate = plateRef.current;
    if (!plate || !from) return;
    const a = from.getBoundingClientRect();
    plate.style.transition = 'none';
    plate.style.transform = 'none';
    const b = plate.getBoundingClientRect();
    const scale = Math.max(0.04, a.width / b.width);
    const dx = a.left + a.width / 2 - (b.left + b.width / 2);
    const dy = a.top + a.height / 2 - (b.top + b.height / 2);
    plate.style.transform = `translate(${dx}px, ${dy}px) scale(${scale})`;
    plate.style.opacity = '0';
    void plate.offsetWidth;
    plate.style.transition = '';
    plate.style.transform = '';
    plate.style.opacity = '';
  };

  const openCard = (idx: number, from: HTMLElement | null) => {
    const token = ++openToken.current;
    state.current.focused = gridView ? -1 : idx;
    sourceEl.current = from;
    setOpenIdx(idx);
    setLitSrc(urls[idx]);
    document.body.classList.add('locked');
    sectionRef.current?.classList.add('lit');
    requestAnimationFrame(() => flipFrom(from));

    // Swap in a sharper render once it is ready.
    renderLarge(idx).then((url) => {
      if (token === openToken.current) setLitSrc(url);
      else URL.revokeObjectURL(url);
    });
  };
  // The pointer handler is bound once; keep it pointed at the latest openCard.
  const openCardRef = useRef(openCard);
  openCardRef.current = openCard;

  const closeCard = useCallback(() => {
    const plate = plateRef.current;
    const from = sourceEl.current;
    state.current.focused = -1;
    openToken.current++;
    sectionRef.current?.classList.remove('lit');
    if (!gridView) document.body.classList.remove('locked');
    if (plate && from) {
      const a = from.getBoundingClientRect();
      const b = plate.getBoundingClientRect();
      const scale = Math.max(0.04, a.width / b.width);
      plate.style.transform = `translate(${a.left + a.width / 2 - (b.left + b.width / 2)}px, ${a.top + a.height / 2 - (b.top + b.height / 2)}px) scale(${scale})`;
      plate.style.opacity = '0';
    }
    setTimeout(() => {
      if (!plate) return;
      plate.style.transition = 'none';
      plate.style.transform = '';
      plate.style.opacity = '';
      void plate.offsetWidth;
      plate.style.transition = '';
      setOpenIdx(null);
    }, 640);
  }, [gridView]);

  useEffect(() => {
    sectionRef.current?.classList.toggle('gridview', gridView);
    document.body.classList.toggle('locked', gridView || openIdx !== null);
  }, [gridView]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (sectionRef.current?.classList.contains('lit')) closeCard();
      else if (gridView) setGridView(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [closeCard, gridView]);

  useEffect(() => {
    sectionRef.current?.classList.toggle('revealed', revealed);
  }, [revealed]);

  // Custom cursor (fine pointers only; hidden by CSS elsewhere).
  useEffect(() => {
    const dot = dotRef.current;
    const section = sectionRef.current;
    if (!dot || !section || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    let x = -100, y = -100, tx = -100, ty = -100, frame = 0;
    const onMove = (e: PointerEvent) => {
      tx = e.clientX;
      ty = e.clientY;
      const t = e.target as HTMLElement;
      const inside = section.contains(t);
      dot.classList.toggle('on', inside);
      dot.classList.toggle('wide', inside && !!t.closest('.card, a, button, .sphere-grid figure'));
    };
    const loop = () => {
      x += (tx - x) * 0.2;
      y += (ty - y) * 0.2;
      dot.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      frame = requestAnimationFrame(loop);
    };
    window.addEventListener('pointermove', onMove);
    frame = requestAnimationFrame(loop);
    return () => {
      window.removeEventListener('pointermove', onMove);
      cancelAnimationFrame(frame);
    };
  }, []);

  const lit = openIdx !== null ? SPHERE_CARDS[openIdx] : null;

  return (
    <section ref={sectionRef} id="signs" className="sphere-section" aria-label="Signs and the places they matter">
      <div className="sphere-sticky">
        <div ref={stageRef} id="stage">
          <div ref={worldRef} id="world">
            <div id="orb">
              {SPHERE_CARDS.map((card, i) => (
                <div
                  key={card.id}
                  ref={(el) => void (cardRefs.current[i] = el)}
                  className={`card${card.tall ? ' tall' : ''}`}
                  data-idx={i}
                  role="button"
                  tabIndex={0}
                  aria-label={`${card.title}: ${card.where}`}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      openCardRef.current(i, cardRefs.current[i]);
                    }
                  }}
                >
                  <figure>{urls[i] && <img src={urls[i]!} alt="" className="in" draggable={false} />}</figure>
                </div>
              ))}
            </div>
            <h2 ref={headlineRef} id="headline">
              <span className="inner">
                {HEADLINE.map((w, i) => (
                  <React.Fragment key={w}>
                    <span style={{ '--i': i } as React.CSSProperties}>{i === 4 ? <em>{w}</em> : w}</span>{' '}
                  </React.Fragment>
                ))}
              </span>
            </h2>
          </div>
        </div>

        <div className="sphere-vig" />

        <div className="sphere-bio sphere-chrome">
          <div className="who">
            <div className="avatar" aria-hidden="true">
              सं
            </div>
            <b>संकेत · Sanket</b>
          </div>
          <p>
            Sanket means signal, or gesture. Each card is a sign the app understands, or a place where being understood
            matters most.
          </p>
        </div>

        <div className="sphere-cue sphere-chrome" aria-hidden="true">
          <s />
          Drag to rotate
        </div>

        <div className="sphere-colophon sphere-chrome">ISL · 2026</div>

        <button
          className="gridbtn sphere-chrome"
          aria-label={gridView ? 'Back to sphere view' : 'Show all cards as a grid'}
          aria-pressed={gridView}
          onClick={() => setGridView((g) => !g)}
        >
          <b />
          <b />
          <b />
          <b />
        </button>

        {/* Flat grid */}
        <div className="sphere-grid" aria-hidden={!gridView}>
          <button
            className="grid-close rounded-full border border-white/30 px-4 py-2 text-xs uppercase tracking-[.18em] text-white/80 hover:border-white hover:text-white bg-black/50 backdrop-blur"
            onClick={() => setGridView(false)}
            tabIndex={gridView ? 0 : -1}
          >
            Back to sphere
          </button>
          <div className="rows">
            {SPHERE_CARDS.map((card, i) => (
              <figure
                key={card.id}
                ref={(el) => void (gridRefs.current[i] = el)}
                data-idx={i}
                tabIndex={gridView ? 0 : -1}
                role="button"
                aria-label={card.title}
                onClick={() => openCard(i, gridRefs.current[i])}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    openCard(i, gridRefs.current[i]);
                  }
                }}
              >
                {urls[i] && <img src={urls[i]!} alt="" loading="lazy" />}
                <figcaption>{card.title}</figcaption>
              </figure>
            ))}
          </div>
        </div>

        {/* Lightbox */}
        <div className="sphere-lit" role="dialog" aria-modal="true" aria-labelledby="litTitle" aria-hidden={openIdx === null}>
          <div className="scrim" onClick={closeCard} />
          <div ref={plateRef} className="plate">
            <div className="shot">
              {litSrc && <img src={litSrc} alt={lit ? `Illustration: ${lit.title}` : ''} />}
              <button className="close" data-close onClick={closeCard}>
                Close
              </button>
            </div>
            {lit && (
              <div className="meta">
                <div>
                  <h2 id="litTitle">{lit.title}</h2>
                  <div className="where">{lit.where}</div>
                </div>
                <p className="note">
                  {lit.note}
                  {lit.kind === 'sign' && (
                    <small>The drawing shows the hand shape Sanket's demo recognises. It is not a complete ISL reference.</small>
                  )}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
      <div ref={dotRef} className="sphere-dot" aria-hidden="true" />
    </section>
  );
};

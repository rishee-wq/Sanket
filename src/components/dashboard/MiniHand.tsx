import React, { useEffect, useRef } from 'react';
import { SIGN_ANIMATIONS } from '../../data/signAnimations';
import { HandStage } from '../../lib/hand3d';
import { buildTimeline, sampleTimeline } from '../../lib/signTimeline';

/** A small, slowly turning 3D hand that loops one sign. Decorative; pauses off screen. */
export default function MiniHand({ label }: { label: string }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const anim = SIGN_ANIMATIONS[label];
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!anim || !wrap || !canvas) return;

    let stage: HandStage;
    try {
      stage = new HandStage(canvas, { body: false });
    } catch {
      return; // No WebGL: the card simply shows its text.
    }
    const tl = buildTimeline(anim);
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const fit = () => {
      const { width, height } = wrap.getBoundingClientRect();
      if (width && height) stage.resize(width, height);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(wrap);

    let visible = true;
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting));
    io.observe(wrap);

    // Frame the sign's main pose once, so the camera doesn't chase the hand.
    const main = tl.segments.reduce((b, s) => (s.end - s.moveEnd > b.end - b.moveEnd ? s : b));
    const pose = sampleTimeline(tl, main.moveEnd);
    stage.setPoses(pose.right, pose.left);
    stage.frameHands(0.62, 0, 4);

    let frame = 0;
    const start = performance.now();
    const loop = (now: number) => {
      frame = requestAnimationFrame(loop);
      if (!visible) return;
      const t = reduced ? main.moveEnd : (now - start) % (tl.duration + 600);
      const s = sampleTimeline(tl, t);
      stage.setPoses(s.right, s.left);
      stage.render();
    };
    frame = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      io.disconnect();
      stage.dispose();
    };
  }, [label]);

  return (
    <div ref={wrapRef} className="absolute inset-0">
      <canvas ref={canvasRef} className="h-full w-full" aria-hidden="true" />
    </div>
  );
}

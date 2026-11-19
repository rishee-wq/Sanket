/**
 * LightBoost: brightens dim webcam frames before hand tracking.
 *
 * MediaPipe's palm detector was trained mostly on well-lit images; in a dim
 * room it misses hands or loses them mid-sign. A few times a second we measure
 * the frame's brightness on a tiny 48 x 27 copy. If it is dim, every frame is
 * redrawn onto a canvas with a brightness/contrast filter (done by the GPU in
 * the browser's 2-D canvas), and that canvas is what MediaPipe sees. The video
 * the person sees is not changed.
 *
 * gain = clamp(TARGET / mean_luma, 1, MAX_GAIN), smoothed over time so the
 * picture does not pump. Very dark frames still lose detail (noise gets
 * brightened too), so `level` tells the UI to ask for more light.
 */

export type LightLevel = 'good' | 'dim' | 'dark';

const TARGET = 0.42;
const MAX_GAIN = 2.6;
const CHECK_MS = 300;
const PROBE_W = 48;
const PROBE_H = 27;

export class LightBoost {
  /** Mean luma of the last probe, 0..1. */
  mean = 0.5;
  /** Current brightness multiplier (1 = untouched). */
  gain = 1;
  level: LightLevel = 'good';

  private readonly probe: HTMLCanvasElement;
  private readonly probeCtx: CanvasRenderingContext2D | null;
  private readonly out: HTMLCanvasElement;
  private readonly outCtx: CanvasRenderingContext2D | null;
  private readonly supported: boolean;
  private lastCheck = -Infinity;

  constructor() {
    this.probe = document.createElement('canvas');
    this.probe.width = PROBE_W;
    this.probe.height = PROBE_H;
    this.probeCtx = this.probe.getContext('2d', { willReadFrequently: true });
    this.out = document.createElement('canvas');
    this.outCtx = this.out.getContext('2d');
    // Canvas filters are missing in some older browsers: then we only measure.
    this.supported = !!this.outCtx && 'filter' in this.outCtx;
  }

  /** The image to give the hand tracker for this frame: the video itself, or a brightened copy. */
  frame(video: HTMLVideoElement, now: number): HTMLVideoElement | HTMLCanvasElement {
    if (now - this.lastCheck >= CHECK_MS) {
      this.lastCheck = now;
      this.measure(video);
    }
    if (!this.supported || this.gain < 1.08 || !this.outCtx) return video;
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h) return video;
    if (this.out.width !== w) this.out.width = w;
    if (this.out.height !== h) this.out.height = h;
    // A little extra contrast keeps the hand's outline from washing out when brightened.
    this.outCtx.filter = `brightness(${this.gain.toFixed(2)}) contrast(${(1 + (this.gain - 1) * 0.12).toFixed(2)})`;
    this.outCtx.drawImage(video, 0, 0, w, h);
    return this.out;
  }

  private measure(video: HTMLVideoElement) {
    const ctx = this.probeCtx;
    if (!ctx || !video.videoWidth) return;
    ctx.drawImage(video, 0, 0, PROBE_W, PROBE_H);
    const px = ctx.getImageData(0, 0, PROBE_W, PROBE_H).data;
    let sum = 0;
    for (let i = 0; i < px.length; i += 4) sum += 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
    this.mean = sum / (px.length / 4) / 255;
    const target = Math.min(MAX_GAIN, Math.max(1, TARGET / Math.max(this.mean, 0.02)));
    this.gain += 0.35 * (target - this.gain);
    this.level = this.mean < 0.12 ? 'dark' : this.mean < 0.28 ? 'dim' : 'good';
  }
}

/** Teacher video clips for word signs (written by ml/export_clips.py). */
export interface Clip {
  video: string;
  /** Three key frames: start, middle and end of the movement. */
  frames: string[];
  /** First and last source frame in the clip. */
  start: number;
  end: number;
  fps: number;
  /** Crop of the source video, in 0..1 image coordinates. */
  crop: [number, number, number, number];
}

export const CLIP_BASE = `${import.meta.env.BASE_URL}model/clips/`;
let cached: Promise<Record<string, Clip>> | null = null;

export function loadClips(): Promise<Record<string, Clip>> {
  cached ??= fetch(`${CLIP_BASE}clips.json`).then((r) => {
    if (!r.ok || !r.headers.get('content-type')?.includes('json')) throw new Error('clips.json not found');
    return r.json();
  });
  cached.catch(() => {
    cached = null;
  });
  return cached;
}

import { RefObject, useCallback, useEffect, useRef, useState } from 'react';

export type FacingMode = 'user' | 'environment';

/** Owns the webcam MediaStream attached to `videoRef`. */
export function useCamera(videoRef: RefObject<HTMLVideoElement | null>) {
  const [isActive, setIsActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<FacingMode>('user');
  const streamRef = useRef<MediaStream | null>(null);
  // Bumped on every start/stop so a slow getUserMedia from an older call is discarded.
  const requestId = useRef(0);

  const releaseStream = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  };

  const stop = useCallback(() => {
    requestId.current++;
    releaseStream();
    setIsActive(false);
  }, []);

  const start = useCallback(async (mode: FacingMode = facingMode) => {
    const id = ++requestId.current;
    setError(null);
    releaseStream();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: mode, width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      const video = videoRef.current;
      if (id !== requestId.current || !video) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;
      video.srcObject = stream;
      await video.play();
      setIsActive(true);
    } catch (err) {
      if (id !== requestId.current) return;
      setError(
        err instanceof DOMException && err.name === 'NotAllowedError'
          ? 'Camera permission was denied. Allow camera access in your browser, or try the hand simulator.'
          : `Could not start the camera${err instanceof Error ? `: ${err.message}` : ''}.`
      );
      setIsActive(false);
    }
  }, [facingMode]);

  const flip = useCallback(() => {
    const next: FacingMode = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(next);
    if (isActive) start(next);
  }, [facingMode, isActive, start]);

  useEffect(() => stop, [stop]);

  return { isActive, error, facingMode, start, stop, flip };
}

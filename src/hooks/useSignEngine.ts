import { useEffect, useRef, useState } from 'react';
import { type EngineMode, SignEngine, type Token } from '../engine/engine';
import { type SignModel, loadSignModel } from '../engine/model';

const MODEL_BASE = `${import.meta.env.BASE_URL}model/`;

export interface ModelBundle {
  staticModel: SignModel | null;
  dynamicModel: SignModel | null;
  /** TF.js backend in use ("webgl", "cpu", ...). */
  backend: string;
  /** Why a model is missing, if one is. */
  problems: string[];
  loadMs: number;
}

let bundlePromise: Promise<ModelBundle> | null = null;

/** Loads TF.js and both models once for the whole app. */
export function loadModels(): Promise<ModelBundle> {
  bundlePromise ??= (async () => {
    const t0 = performance.now();
    // Loaded lazily so the landing page never pays for the TF.js bundle.
    const tf = await import('@tensorflow/tfjs');
    await tf.ready();
    const [s, d] = await Promise.allSettled([
      loadSignModel(tf, `${MODEL_BASE}static/`),
      loadSignModel(tf, `${MODEL_BASE}dynamic/`),
    ]);
    const problems: string[] = [];
    const reason = (r: PromiseRejectedResult) => (r.reason instanceof Error ? r.reason.message : String(r.reason));
    if (s.status === 'rejected') problems.push(`Letters model: ${reason(s)}`);
    if (d.status === 'rejected') problems.push(`Words model: ${reason(d)}`);
    return {
      staticModel: s.status === 'fulfilled' ? s.value : null,
      dynamicModel: d.status === 'fulfilled' ? d.value : null,
      backend: tf.getBackend(),
      problems,
      loadMs: performance.now() - t0,
    };
  })();
  return bundlePromise;
}

export type EngineStatus = 'loading' | 'ready' | 'error';

/**
 * Owns one SignEngine for the page. `onToken` may change between renders; the
 * engine always calls the latest one.
 */
export function useSignEngine(mode: EngineMode, onToken: (token: Token) => void) {
  const [status, setStatus] = useState<EngineStatus>('loading');
  const [bundle, setBundle] = useState<ModelBundle | null>(null);
  const [engine, setEngine] = useState<SignEngine | null>(null);
  const handler = useRef(onToken);
  handler.current = onToken;
  const initialMode = useRef(mode);

  useEffect(() => {
    let alive = true;
    let created: SignEngine | null = null;
    loadModels().then(
      (b) => {
        if (!alive) return;
        setBundle(b);
        if (!b.staticModel && !b.dynamicModel) {
          setStatus('error');
          return;
        }
        created = new SignEngine({
          staticModel: b.staticModel,
          dynamicModel: b.dynamicModel,
          mode: initialMode.current,
          onToken: (t) => handler.current(t),
        });
        setEngine(created);
        setStatus('ready');
      },
      () => alive && setStatus('error')
    );
    return () => {
      alive = false;
      created?.dispose();
    };
  }, []);

  useEffect(() => {
    engine?.setMode(mode);
  }, [engine, mode]);

  return { status, bundle, engine };
}

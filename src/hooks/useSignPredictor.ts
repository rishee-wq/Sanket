import { useEffect, useState } from 'react';
import { Predictor, PredictorKind, createPredictor } from '../lib/predictor';

interface PredictorState {
  predictor: Predictor | null;
  /** Why the trained model was not used, when one was requested. */
  fallbackReason: string | null;
}

/**
 * Loads the requested predictor. Asking for 'tfjs' falls back to the mock
 * (with `fallbackReason` set) when no valid model is in public/model/.
 */
export function useSignPredictor(kind: PredictorKind) {
  const [state, setState] = useState<PredictorState>({ predictor: null, fallbackReason: null });

  useEffect(() => {
    let alive = true;
    let loaded: Predictor | null = null;
    createPredictor(kind).then(({ predictor, fallbackReason }) => {
      if (!alive) {
        predictor.dispose();
        return;
      }
      loaded = predictor;
      setState({ predictor, fallbackReason });
    });
    return () => {
      alive = false;
      loaded?.dispose();
    };
  }, [kind]);

  return state;
}

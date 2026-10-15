import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, CameraOff, RefreshCw, Hand, CheckCircle2, Play } from 'lucide-react';
import { useCamera } from '../hooks/useCamera';
import { useHandLandmarker } from '../hooks/useHandLandmarker';
import { LiveState, useRecognition } from '../hooks/useRecognition';
import type { Prediction, Predictor } from '../lib/predictor';
import { SIMULATED_POSES, SimulatedPose } from '../lib/simulatedPoses';
import { soundEffects } from '../services/soundEffects';

interface CameraViewProps {
  predictor: Predictor | null;
  onSignAccepted: (prediction: Prediction) => void;
  /** Throttled live state (a few times per second), e.g. for Learn mode scoring. */
  onLiveUpdate?: (live: LiveState) => void;
}

const ACCEPT_FLASH_MS = 500;

export const CameraView: React.FC<CameraViewProps> = ({ predictor, onSignAccepted, onLiveUpdate }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [simulatedPose, setSimulatedPose] = useState<SimulatedPose | null>(null);
  const [acceptedFlash, setAcceptedFlash] = useState(false);

  const camera = useCamera(videoRef);
  const landmarker = useHandLandmarker();

  const handleAccept = useCallback(
    (prediction: Prediction) => {
      soundEffects.playAccepted();
      navigator.vibrate?.(60);
      setAcceptedFlash(true);
      setTimeout(() => setAcceptedFlash(false), ACCEPT_FLASH_MS);
      onSignAccepted(prediction);
    },
    [onSignAccepted]
  );

  const { live } = useRecognition({
    videoRef,
    canvasRef,
    cameraActive: camera.isActive,
    mirrored: camera.facingMode === 'user',
    detect: landmarker.detect,
    predictor,
    simulatedPose,
    onAccept: handleAccept,
  });

  useEffect(() => {
    onLiveUpdate?.(live);
  }, [live, onLiveUpdate]);

  // Start the webcam once on mount.
  useEffect(() => {
    camera.start();
  }, []);

  const { prediction, handsCount } = live;
  const isAccepted = live.progress >= 1 && live.candidate === prediction?.label;
  const confidencePct = prediction ? Math.round(prediction.confidence * 100) : 0;

  const statusText =
    landmarker.status === 'loading'
      ? 'Loading hand tracking…'
      : landmarker.status === 'error'
      ? `Hand tracking failed: ${landmarker.error}`
      : handsCount > 0
      ? `${handsCount} hand${handsCount > 1 ? 's' : ''} detected`
      : camera.isActive || simulatedPose
      ? 'Show your hand to the camera'
      : 'Camera paused';

  return (
    <div className="relative bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col">
      {/* Top HUD Bar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-950/80 border-b border-slate-800/80 z-20">
        <div className="flex items-center gap-2" role="status" aria-live="polite">
          <div
            className={`w-2.5 h-2.5 rounded-full ${
              handsCount > 0 ? 'bg-emerald-400' : camera.isActive ? 'bg-amber-400' : 'bg-slate-500'
            }`}
          />
          <span className="text-xs font-medium text-slate-300">{statusText}</span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => (camera.isActive ? camera.stop() : camera.start())}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
              camera.isActive
                ? 'bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700'
                : 'bg-emerald-600 text-white hover:bg-emerald-500'
            }`}
          >
            {camera.isActive ? <CameraOff className="w-3.5 h-3.5" /> : <Camera className="w-3.5 h-3.5" />}
            <span>{camera.isActive ? 'Pause' : 'Start'}</span>
          </button>

          <button
            onClick={camera.flip}
            title="Flip camera"
            aria-label="Flip camera"
            className="p-1.5 rounded-lg text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Video & Canvas Viewport */}
      <div className="relative aspect-[4/3] max-h-[440px] w-full bg-slate-950 flex items-center justify-center overflow-hidden">
        <video
          ref={videoRef}
          playsInline
          muted
          className={`absolute inset-0 w-full h-full object-cover ${
            camera.facingMode === 'user' ? 'scale-x-[-1]' : ''
          } ${camera.isActive && !simulatedPose ? 'opacity-90' : 'opacity-0'}`}
        />

        {/* Landmark overlay; its pixel size is synced to the video frame by useRecognition */}
        <canvas
          ref={canvasRef}
          width={640}
          height={480}
          className="absolute inset-0 w-full h-full object-cover pointer-events-none z-10"
        />

        {!camera.isActive && !simulatedPose && (
          <div className="flex flex-col items-center justify-center p-6 text-center z-10 max-w-sm">
            <div className="w-14 h-14 rounded-2xl bg-slate-800/80 flex items-center justify-center text-slate-400 mb-3 border border-slate-700">
              <Camera className="w-7 h-7" />
            </div>
            <h4 className="text-sm font-semibold text-slate-200 mb-1">Webcam inactive</h4>
            <p className="text-xs text-slate-400 mb-4">
              {camera.error || 'Start the camera to begin Indian Sign Language recognition.'}
            </p>
            <button
              onClick={() => camera.start()}
              className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl transition-all shadow-md shadow-amber-500/20 flex items-center gap-1.5"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              Start webcam
            </button>
          </div>
        )}

        {acceptedFlash && (
          <div className="absolute inset-0 border-4 border-emerald-400 bg-emerald-500/10 pointer-events-none z-20" />
        )}

        {/* Live prediction card */}
        {prediction && (
          <div className="absolute bottom-3 inset-x-3 sm:inset-x-4 z-20">
            <div
              className={`p-3 rounded-xl backdrop-blur-md border transition-colors ${
                isAccepted
                  ? 'bg-emerald-950/90 border-emerald-500/60 shadow-lg shadow-emerald-500/20'
                  : 'bg-slate-950/85 border-slate-700 shadow-xl'
              }`}
            >
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`min-w-12 h-12 px-2 rounded-xl flex items-center justify-center font-black text-xl tracking-tight ${
                      isAccepted
                        ? 'bg-emerald-500 text-slate-950'
                        : 'bg-gradient-to-br from-amber-500 to-orange-500 text-slate-950'
                    }`}
                  >
                    {prediction.label}
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs uppercase tracking-wider text-slate-400 font-semibold">Sign</span>
                      <span className="text-sm font-bold text-white truncate">{prediction.label}</span>
                      {isAccepted && (
                        <span className="text-[11px] font-bold text-emerald-400 flex items-center gap-0.5">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Added
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-300 font-mono mt-0.5">
                      <span>Confidence:</span>
                      <span className={`font-bold ${confidencePct >= 80 ? 'text-emerald-400' : 'text-amber-400'}`}>
                        {confidencePct}%
                      </span>
                      <span className="text-slate-500">•</span>
                      <span className="text-slate-400 text-[11px]">
                        {prediction.source === 'tfjs' ? 'TF.js model' : 'Mock (simulated)'}
                      </span>
                    </div>
                  </div>
                </div>

                <span className="text-[11px] text-slate-400 font-medium whitespace-nowrap">
                  {isAccepted ? 'Lower hand to repeat' : 'Hold 1 s'}
                </span>
              </div>

              {/* Hold-to-accept progress */}
              <div
                className="w-full h-1.5 bg-slate-800/80 rounded-full mt-2.5 overflow-hidden"
                role="progressbar"
                aria-label="Hold progress"
                aria-valuenow={Math.round(live.progress * 100)}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div
                  className={`h-full rounded-full ${isAccepted ? 'bg-emerald-400' : 'bg-amber-400'}`}
                  style={{ width: `${live.candidate === prediction.label ? live.progress * 100 : 0}%` }}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Pose simulator, for testing without a webcam */}
      <div className="px-4 py-2.5 bg-slate-950 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2 text-slate-400">
          <Hand className="w-4 h-4 text-amber-400 shrink-0" />
          <span className="text-[11px] font-medium">Pose simulator:</span>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          {[{ pose: null, label: 'Real camera' }, ...SIMULATED_POSES].map((item) => (
            <button
              key={item.pose ?? 'camera'}
              onClick={() => setSimulatedPose(item.pose)}
              aria-pressed={simulatedPose === item.pose}
              className={`px-2 py-1 rounded text-[11px] font-semibold transition-all ${
                simulatedPose === item.pose
                  ? 'bg-amber-500 text-slate-950 font-bold'
                  : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700 hover:text-white'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Camera, CameraOff, RefreshCw, Hand, AlertCircle, CheckCircle2, Play } from 'lucide-react';
import { handDetector } from '../services/handDetector';
import { signClassifier } from '../services/signClassifier';
import { NormalizedLandmark, SignPrediction, StabilityState } from '../types/isl';
import { soundEffects } from '../services/soundEffects';

interface CameraViewProps {
  onSignAccepted: (prediction: SignPrediction) => void;
  activeMode: string;
  targetSignForLearn?: string;
  onLiveMatchScore?: (score: number) => void;
}

export const CameraView: React.FC<CameraViewProps> = ({
  onSignAccepted,
  activeMode,
  targetSignForLearn,
  onLiveMatchScore,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [isCameraActive, setIsCameraActive] = useState<boolean>(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isMediaPipeLoading, setIsMediaPipeLoading] = useState<boolean>(true);
  const [handsDetectedCount, setHandsDetectedCount] = useState<number>(0);

  // Live prediction & stability
  const [currentPrediction, setCurrentPrediction] = useState<SignPrediction | null>(null);
  const [stability, setStability] = useState<StabilityState>({
    candidateLabel: null,
    confidence: 0,
    durationMs: 0,
    requiredMs: 1000,
    progress: 0,
    isTriggered: false,
  });

  // Simulated pose for testing without webcam
  const [simulatedPose, setSimulatedPose] = useState<string>('none');
  const [acceptedFlash, setAcceptedFlash] = useState<boolean>(false);

  // Internal tracking refs for animation frame loop
  const animFrameId = useRef<number | null>(null);
  const candidateRef = useRef<string | null>(null);
  const candidateStartTimeRef = useRef<number>(0);
  const lastAcceptedTimeRef = useRef<number>(0);
  const lastAcceptedLabelRef = useRef<string | null>(null);
  const simulatedPoseRef = useRef<string>('none');

  useEffect(() => {
    simulatedPoseRef.current = simulatedPose;
  }, [simulatedPose]);

  // Initialize MediaPipe and TensorFlow classifier on mount
  useEffect(() => {
    let mounted = true;

    async function initEngines() {
      setIsMediaPipeLoading(true);
      await Promise.all([
        handDetector.initialize(),
        signClassifier.initialize(),
      ]);
      if (mounted) {
        setIsMediaPipeLoading(false);
      }
    }

    initEngines();

    return () => {
      mounted = false;
      stopCamera();
    };
  }, []);

  // Start webcam
  const startCamera = async (faceMode = facingMode) => {
    setCameraError(null);
    try {
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach((track) => track.stop());
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: faceMode,
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
        audio: false,
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play().catch(() => {});
          setIsCameraActive(true);
        };
      }
    } catch (err: unknown) {
      console.warn('Webcam access error:', err);
      const msg =
        err instanceof Error
          ? err.message
          : 'Could not access camera. Please allow camera permissions or test using Simulated Poses below.';
      setCameraError(msg);
      setIsCameraActive(false);
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((track) => track.stop());
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
    if (animFrameId.current) {
      cancelAnimationFrame(animFrameId.current);
      animFrameId.current = null;
    }
  };

  const toggleCameraFacing = () => {
    const nextMode = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(nextMode);
    if (isCameraActive) {
      startCamera(nextMode);
    }
  };

  // Main Detection & Prediction Loop
  const processFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    let landmarksArray: NormalizedLandmark[][] = [];

    // Check if user is using simulated synthetic pose
    if (simulatedPoseRef.current !== 'none') {
      const syn = handDetector.getSyntheticPose(simulatedPoseRef.current);
      landmarksArray = [syn];
    } else if (video && video.readyState >= 2 && isCameraActive) {
      landmarksArray = handDetector.detectForVideo(video, performance.now());
    }

    setHandsDetectedCount(landmarksArray.length);

    // Draw on canvas overlay
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const width = canvas.width;
        const height = canvas.height;
        handDetector.drawLandmarks(
          ctx,
          landmarksArray,
          width,
          height,
          facingMode === 'user',
          acceptedFlash
        );
      }
    }

    const now = Date.now();

    if (landmarksArray.length > 0) {
      const primaryHand = landmarksArray[0];
      const prediction = signClassifier.predict(primaryHand);
      setCurrentPrediction(prediction);

      // If in Learn mode, calculate live match score with target
      if (targetSignForLearn && onLiveMatchScore) {
        if (prediction.label.toLowerCase() === targetSignForLearn.toLowerCase()) {
          onLiveMatchScore(prediction.confidence);
        } else {
          onLiveMatchScore(Math.max(15, 100 - Math.abs(prediction.label.charCodeAt(0) - targetSignForLearn.charCodeAt(0)) * 12));
        }
      }

      // Stability logic:
      // "Only accept a prediction if confidence > 80% and it stays stable for ~1 second."
      const CONFIDENCE_THRESHOLD = 80;
      const REQUIRED_STABILITY_MS = 1000;
      const ACCEPT_COOLDOWN_MS = 1200;

      if (prediction.confidence >= CONFIDENCE_THRESHOLD) {
        if (candidateRef.current === prediction.label) {
          const elapsed = now - candidateStartTimeRef.current;
          const progress = Math.min(1.0, elapsed / REQUIRED_STABILITY_MS);

          setStability({
            candidateLabel: prediction.label,
            confidence: prediction.confidence,
            durationMs: elapsed,
            requiredMs: REQUIRED_STABILITY_MS,
            progress,
            isTriggered: progress >= 1.0,
          });

          // Check if held for 1 second and not in cooldown for the same label
          const timeSinceLastAccept = now - lastAcceptedTimeRef.current;
          const isSameAsRecent = lastAcceptedLabelRef.current === prediction.label && timeSinceLastAccept < ACCEPT_COOLDOWN_MS;

          if (progress >= 1.0 && !isSameAsRecent) {
            lastAcceptedTimeRef.current = now;
            lastAcceptedLabelRef.current = prediction.label;
            soundEffects.playAccepted();
            setAcceptedFlash(true);
            setTimeout(() => setAcceptedFlash(false), 500);

            // Trigger acceptance callback
            onSignAccepted(prediction);

            // Reset candidate tracker for next sign
            candidateStartTimeRef.current = now;
          }
        } else {
          // New candidate started
          candidateRef.current = prediction.label;
          candidateStartTimeRef.current = now;
          setStability({
            candidateLabel: prediction.label,
            confidence: prediction.confidence,
            durationMs: 0,
            requiredMs: REQUIRED_STABILITY_MS,
            progress: 0,
            isTriggered: false,
          });
        }
      } else {
        // Below confidence threshold
        candidateRef.current = null;
        setStability((prev) => ({ ...prev, progress: 0, isTriggered: false }));
      }
    } else {
      // No hands in frame
      setCurrentPrediction(null);
      candidateRef.current = null;
      setStability({
        candidateLabel: null,
        confidence: 0,
        durationMs: 0,
        requiredMs: 1000,
        progress: 0,
        isTriggered: false,
      });
      if (onLiveMatchScore) {
        onLiveMatchScore(0);
      }
    }

    animFrameId.current = requestAnimationFrame(processFrame);
  }, [isCameraActive, facingMode, acceptedFlash, onSignAccepted, targetSignForLearn, onLiveMatchScore]);

  useEffect(() => {
    animFrameId.current = requestAnimationFrame(processFrame);
    return () => {
      if (animFrameId.current) {
        cancelAnimationFrame(animFrameId.current);
      }
    };
  }, [processFrame]);

  // Auto-start camera on component mount
  useEffect(() => {
    startCamera();
  }, []);

  return (
    <div className="relative bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col">
      {/* Top HUD Bar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-950/80 border-b border-slate-800/80 z-20">
        <div className="flex items-center gap-2">
          <div
            className={`w-2.5 h-2.5 rounded-full ${
              handsDetectedCount > 0
                ? 'bg-emerald-400 shadow-sm shadow-emerald-400/80 animate-ping'
                : isCameraActive
                ? 'bg-amber-400'
                : 'bg-slate-500'
            }`}
          />
          <span className="text-xs font-medium text-slate-300">
            {isMediaPipeLoading
              ? 'Loading Vision Models...'
              : handsDetectedCount > 0
              ? `${handsDetectedCount} Hand Detected (21 Landmarks)`
              : isCameraActive
              ? 'Show hand to camera'
              : 'Camera Paused'}
          </span>
        </div>

        {/* Camera Action Buttons */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => (isCameraActive ? stopCamera() : startCamera())}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
              isCameraActive
                ? 'bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700'
                : 'bg-emerald-600 text-white hover:bg-emerald-500'
            }`}
          >
            {isCameraActive ? (
              <>
                <CameraOff className="w-3.5 h-3.5" />
                <span>Pause</span>
              </>
            ) : (
              <>
                <Camera className="w-3.5 h-3.5" />
                <span>Start</span>
              </>
            )}
          </button>

          <button
            onClick={toggleCameraFacing}
            title="Flip camera"
            className="p-1.5 rounded-lg text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Video & Canvas Viewport */}
      <div className="relative aspect-[4/3] sm:aspect-[16/10] max-h-[440px] w-full bg-slate-950 flex items-center justify-center overflow-hidden">
        {/* HTML5 Video Element */}
        <video
          ref={videoRef}
          playsInline
          muted
          className={`absolute inset-0 w-full h-full object-cover ${
            facingMode === 'user' ? 'scale-x-[-1]' : ''
          } ${isCameraActive ? 'opacity-90' : 'opacity-0'}`}
        />

        {/* MediaPipe Landmark Canvas Overlay */}
        <canvas
          ref={canvasRef}
          width={640}
          height={480}
          className="absolute inset-0 w-full h-full object-cover pointer-events-none z-10"
        />

        {/* Camera Disabled / Error Placeholder */}
        {!isCameraActive && (
          <div className="flex flex-col items-center justify-center p-6 text-center z-10 max-w-sm">
            <div className="w-14 h-14 rounded-2xl bg-slate-800/80 flex items-center justify-center text-slate-400 mb-3 border border-slate-700">
              <Camera className="w-7 h-7" />
            </div>
            <h4 className="text-sm font-semibold text-slate-200 mb-1">Webcam Inactive</h4>
            <p className="text-xs text-slate-400 mb-4">
              {cameraError || 'Click Start Camera to begin real-time Indian Sign Language detection.'}
            </p>
            <button
              onClick={() => startCamera()}
              className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl transition-all shadow-md shadow-amber-500/20 flex items-center gap-1.5"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              Start Webcam
            </button>
          </div>
        )}

        {/* Accepted Flash Highlight Border */}
        {acceptedFlash && (
          <div className="absolute inset-0 border-4 border-emerald-400 bg-emerald-500/10 pointer-events-none z-20 animate-pulse" />
        )}

        {/* Real-time Prediction HUD Box (Floating on bottom of video) */}
        {currentPrediction && (
          <div className="absolute bottom-3 inset-x-3 sm:inset-x-auto sm:left-4 sm:right-4 z-20">
            <div
              className={`p-3 rounded-xl backdrop-blur-md border transition-all ${
                stability.isTriggered || acceptedFlash
                  ? 'bg-emerald-950/90 border-emerald-500/60 shadow-lg shadow-emerald-500/20'
                  : 'bg-slate-950/85 border-slate-700 shadow-xl'
              }`}
            >
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  {/* Big Sign Letter / Word */}
                  <div
                    className={`w-12 h-12 rounded-xl flex items-center justify-center font-black text-2xl tracking-tight transition-all font-['Plus_Jakarta_Sans'] ${
                      stability.isTriggered || acceptedFlash
                        ? 'bg-emerald-500 text-slate-950 scale-105'
                        : 'bg-gradient-to-br from-amber-500 to-orange-500 text-slate-950'
                    }`}
                  >
                    {currentPrediction.label}
                  </div>

                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs uppercase tracking-wider text-slate-400 font-semibold">
                        Sign Detected:
                      </span>
                      <span className="text-sm font-bold text-white">
                        {currentPrediction.label}
                      </span>
                      {stability.isTriggered && (
                        <span className="text-[11px] font-bold text-emerald-400 flex items-center gap-0.5">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Accepted!
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-300 font-mono mt-0.5">
                      <span>Confidence:</span>
                      <span
                        className={`font-bold ${
                          currentPrediction.confidence >= 80 ? 'text-emerald-400' : 'text-amber-400'
                        }`}
                      >
                        {currentPrediction.confidence}%
                      </span>
                      <span className="text-slate-500">•</span>
                      <span className="text-slate-400 text-[11px]">
                        {currentPrediction.source === 'heuristic'
                          ? 'Geometric ISL'
                          : currentPrediction.source === 'model'
                          ? 'TF.js'
                          : 'Mock'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Stability 1-Second Progress Ring / Gauge */}
                <div className="flex flex-col items-center">
                  <div className="relative w-11 h-11 flex items-center justify-center">
                    <svg className="w-full h-full transform -rotate-90">
                      <circle
                        cx="22"
                        cy="22"
                        r="18"
                        stroke="currentColor"
                        strokeWidth="3.5"
                        fill="transparent"
                        className="text-slate-800"
                      />
                      <circle
                        cx="22"
                        cy="22"
                        r="18"
                        stroke="currentColor"
                        strokeWidth="3.5"
                        fill="transparent"
                        strokeDasharray={113}
                        strokeDashoffset={113 * (1 - stability.progress)}
                        className={`transition-all duration-100 ${
                          stability.progress >= 1.0 ? 'text-emerald-400' : 'text-amber-400'
                        }`}
                        strokeLinecap="round"
                      />
                    </svg>
                    <span className="absolute text-[10px] font-bold font-mono text-slate-200">
                      {Math.round(stability.progress * 100)}%
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-400 font-medium mt-0.5 whitespace-nowrap">
                    {stability.progress >= 1.0 ? 'Added ✓' : 'Hold 1s'}
                  </span>
                </div>
              </div>

              {/* Progress Bar under card */}
              <div className="w-full h-1.5 bg-slate-800/80 rounded-full mt-2.5 overflow-hidden">
                <div
                  className={`h-full transition-all duration-100 rounded-full ${
                    stability.progress >= 1.0
                      ? 'bg-emerald-400'
                      : stability.confidence >= 80
                      ? 'bg-amber-400'
                      : 'bg-slate-600'
                  }`}
                  style={{ width: `${stability.progress * 100}%` }}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Testing Simulator Bar (Useful if webcam is blocked or for quick evaluation) */}
      <div className="px-4 py-2.5 bg-slate-950 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2 text-slate-400">
          <Hand className="w-4 h-4 text-amber-400 shrink-0" />
          <span className="text-[11px] font-medium">Quick Pose Simulator:</span>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          {[
            { label: 'Real Camera', value: 'none' },
            { label: '👋 Hello', value: 'Hello' },
            { label: '👍 Yes', value: 'thumbs-up' },
            { label: '✊ No', value: 'fist' },
            { label: '☝️ 1', value: 'index-up' },
            { label: '✌️ 2 / V', value: 'peace' },
          ].map((item) => (
            <button
              key={item.value}
              onClick={() => setSimulatedPose(item.value)}
              className={`px-2 py-1 rounded text-[11px] font-semibold transition-all ${
                simulatedPose === item.value
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

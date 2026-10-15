import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import { NormalizedLandmark } from '../types/isl';

export const HAND_CONNECTIONS: [number, number][] = [
  // Thumb
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  // Index
  [0, 5],
  [5, 6],
  [6, 7],
  [7, 8],
  // Middle
  [0, 9],
  [9, 10],
  [10, 11],
  [11, 12],
  // Ring
  [0, 13],
  [13, 14],
  [14, 15],
  [15, 16],
  // Pinky
  [0, 17],
  [17, 18],
  [18, 19],
  [19, 20],
  // Palm Base
  [5, 9],
  [9, 13],
  [13, 17],
];

export class HandDetectorService {
  private handLandmarker: HandLandmarker | null = null;
  private isInitializing = false;
  private isReady = false;
  private initError: string | null = null;

  public async initialize(): Promise<boolean> {
    if (this.isReady) return true;
    if (this.isInitializing) return false;

    this.isInitializing = true;
    this.initError = null;

    try {
      const vision = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
      );

      this.handLandmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
          delegate: 'GPU',
        },
        runningMode: 'VIDEO',
        numHands: 2,
        minHandDetectionConfidence: 0.5,
        minHandPresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });

      this.isReady = true;
      this.isInitializing = false;
      return true;
    } catch (err: unknown) {
      console.warn('Failed to initialize MediaPipe with GPU, attempting CPU fallback...', err);
      try {
        const vision = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
        );

        this.handLandmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
            delegate: 'CPU',
          },
          runningMode: 'VIDEO',
          numHands: 2,
          minHandDetectionConfidence: 0.4,
          minHandPresenceConfidence: 0.4,
          minTrackingConfidence: 0.4,
        });

        this.isReady = true;
        this.isInitializing = false;
        return true;
      } catch (fallbackErr: unknown) {
        this.isReady = false;
        this.isInitializing = false;
        this.initError =
          fallbackErr instanceof Error ? fallbackErr.message : 'MediaPipe vision initialization failed';
        console.error('HandLandmarker init error:', fallbackErr);
        return false;
      }
    }
  }

  public getStatus(): { isReady: boolean; isInitializing: boolean; error: string | null } {
    return {
      isReady: this.isReady,
      isInitializing: this.isInitializing,
      error: this.initError,
    };
  }

  public detectForVideo(video: HTMLVideoElement, timestampMs: number): NormalizedLandmark[][] {
    if (!this.handLandmarker || !this.isReady) {
      return [];
    }

    try {
      if (video.readyState < 2 || video.videoWidth === 0) {
        return [];
      }
      const result = this.handLandmarker.detectForVideo(video, timestampMs);
      return (result.landmarks as NormalizedLandmark[][]) || [];
    } catch {
      return [];
    }
  }

  /**
   * Draws hand landmarks and connections with high contrast neon overlay
   */
  public drawLandmarks(
    ctx: CanvasRenderingContext2D,
    landmarksArray: NormalizedLandmark[][],
    width: number,
    height: number,
    mirrored = true,
    acceptedHighlight = false
  ) {
    ctx.clearRect(0, 0, width, height);

    if (!landmarksArray || landmarksArray.length === 0) return;

    ctx.save();

    for (let h = 0; h < landmarksArray.length; h++) {
      const landmarks = landmarksArray[h];
      const primaryColor = acceptedHighlight ? '#10b981' : h === 0 ? '#06b6d4' : '#f59e0b';
      const glowColor = acceptedHighlight ? 'rgba(16, 185, 129, 0.4)' : h === 0 ? 'rgba(6, 182, 212, 0.35)' : 'rgba(245, 158, 11, 0.35)';

      const getCoords = (p: NormalizedLandmark) => {
        const x = mirrored ? (1 - p.x) * width : p.x * width;
        const y = p.y * height;
        return { x, y };
      };

      // Draw connections
      ctx.lineWidth = 3.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.shadowBlur = 10;
      ctx.shadowColor = glowColor;

      for (const [startIdx, endIdx] of HAND_CONNECTIONS) {
        const start = getCoords(landmarks[startIdx]);
        const end = getCoords(landmarks[endIdx]);

        ctx.strokeStyle = primaryColor;
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(end.x, end.y);
        ctx.stroke();
      }

      // Draw landmark points
      for (let i = 0; i < landmarks.length; i++) {
        const p = getCoords(landmarks[i]);
        const isFingertip = [4, 8, 12, 16, 20].includes(i);
        const isWrist = i === 0;

        ctx.beginPath();
        if (isFingertip) {
          // Larger outer ring for fingertips
          ctx.arc(p.x, p.y, 7, 0, 2 * Math.PI);
          ctx.fillStyle = '#ffffff';
          ctx.fill();
          ctx.lineWidth = 2.5;
          ctx.strokeStyle = primaryColor;
          ctx.stroke();
        } else if (isWrist) {
          ctx.arc(p.x, p.y, 8, 0, 2 * Math.PI);
          ctx.fillStyle = primaryColor;
          ctx.fill();
          ctx.lineWidth = 2;
          ctx.strokeStyle = '#ffffff';
          ctx.stroke();
        } else {
          ctx.arc(p.x, p.y, 4, 0, 2 * Math.PI);
          ctx.fillStyle = primaryColor;
          ctx.fill();
        }
      }
    }

    ctx.restore();
  }

  /**
   * Generates synthetic 21 landmarks for testing/simulation when camera is inactive
   */
  public getSyntheticPose(poseType: string): NormalizedLandmark[] {
    const base: NormalizedLandmark[] = [
      { x: 0.5, y: 0.8, z: 0 }, // 0: Wrist
      { x: 0.44, y: 0.73, z: -0.02 }, // 1: Thumb CMC
      { x: 0.4, y: 0.65, z: -0.03 }, // 2: Thumb MCP
      { x: 0.38, y: 0.58, z: -0.04 }, // 3: Thumb IP
      { x: 0.36, y: 0.52, z: -0.05 }, // 4: Thumb Tip
      { x: 0.46, y: 0.6, z: -0.02 }, // 5: Index MCP
      { x: 0.45, y: 0.5, z: -0.03 }, // 6: Index PIP
      { x: 0.45, y: 0.43, z: -0.04 }, // 7: Index DIP
      { x: 0.45, y: 0.35, z: -0.05 }, // 8: Index Tip
      { x: 0.5, y: 0.59, z: -0.02 }, // 9: Middle MCP
      { x: 0.5, y: 0.48, z: -0.03 }, // 10: Middle PIP
      { x: 0.5, y: 0.41, z: -0.04 }, // 11: Middle DIP
      { x: 0.5, y: 0.32, z: -0.05 }, // 12: Middle Tip
      { x: 0.54, y: 0.61, z: -0.02 }, // 13: Ring MCP
      { x: 0.54, y: 0.51, z: -0.03 }, // 14: Ring PIP
      { x: 0.54, y: 0.44, z: -0.04 }, // 15: Ring DIP
      { x: 0.54, y: 0.36, z: -0.05 }, // 16: Ring Tip
      { x: 0.58, y: 0.64, z: -0.02 }, // 17: Pinky MCP
      { x: 0.59, y: 0.56, z: -0.03 }, // 18: Pinky PIP
      { x: 0.6, y: 0.5, z: -0.04 }, // 19: Pinky DIP
      { x: 0.6, y: 0.44, z: -0.05 }, // 20: Pinky Tip
    ];

    if (poseType === 'fist' || poseType === 'No') {
      // Curl all fingertips inward
      base[4] = { x: 0.44, y: 0.63, z: 0.05 };
      base[8] = { x: 0.46, y: 0.64, z: 0.05 };
      base[12] = { x: 0.5, y: 0.64, z: 0.05 };
      base[16] = { x: 0.54, y: 0.64, z: 0.05 };
      base[20] = { x: 0.58, y: 0.65, z: 0.05 };
    } else if (poseType === 'index-up' || poseType === '1' || poseType === 'Yes') {
      base[4] = { x: 0.44, y: 0.63, z: 0.05 };
      base[12] = { x: 0.5, y: 0.64, z: 0.05 };
      base[16] = { x: 0.54, y: 0.64, z: 0.05 };
      base[20] = { x: 0.58, y: 0.65, z: 0.05 };
    } else if (poseType === 'peace' || poseType === '2' || poseType === 'V') {
      base[4] = { x: 0.44, y: 0.63, z: 0.05 };
      base[16] = { x: 0.54, y: 0.64, z: 0.05 };
      base[20] = { x: 0.58, y: 0.65, z: 0.05 };
    } else if (poseType === 'thumbs-up' || poseType === 'Good') {
      base[4] = { x: 0.42, y: 0.4, z: -0.05 };
      base[8] = { x: 0.46, y: 0.64, z: 0.05 };
      base[12] = { x: 0.5, y: 0.64, z: 0.05 };
      base[16] = { x: 0.54, y: 0.64, z: 0.05 };
      base[20] = { x: 0.58, y: 0.65, z: 0.05 };
    }

    return base;
  }
}

export const handDetector = new HandDetectorService();

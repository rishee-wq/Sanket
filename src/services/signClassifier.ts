import * as tf from '@tensorflow/tfjs';
import { NormalizedLandmark, SignPrediction } from '../types/isl';

export const DEFAULT_LABELS: string[] = [
  'Hello',
  'Thank you',
  'Help',
  'Yes',
  'No',
  'Doctor',
  'Pain',
  'Water',
  'SOS',
  'A',
  'B',
  'C',
  'D',
  'E',
  'F',
  'G',
  'H',
  'I',
  'L',
  'O',
  'V',
  'W',
  'Y',
  '1',
  '2',
  '3',
  '4',
  '5',
];

export interface FingerStates {
  thumb: boolean;
  index: boolean;
  middle: boolean;
  ring: boolean;
  pinky: boolean;
  extendedCount: number;
}

export class SignClassifier {
  private labels: string[] = DEFAULT_LABELS;
  private model: tf.LayersModel | null = null;
  public isModelLoaded = false;
  public isUsingMock = true; // Default as specified until real model is present
  public predictorMode: 'smart_heuristic' | 'mock_random' | 'tfjs_model' = 'smart_heuristic';

  // State to simulate stable mock predictions when hands are held
  private mockHoldState: {
    label: string;
    startTime: number;
    lastSeen: number;
  } | null = null;

  public async initialize(): Promise<{ success: boolean; mode: string; labelsCount: number }> {
    // 1. Fetch labels.json
    try {
      const labelsRes = await fetch('/model/labels.json');
      if (labelsRes.ok) {
        const json = await labelsRes.json();
        if (Array.isArray(json) && json.length > 0) {
          this.labels = json;
        }
      }
    } catch {
      // Use DEFAULT_LABELS
    }

    // 2. Try loading TensorFlow.js model
    try {
      this.model = await tf.loadLayersModel('/model/model.json');
      this.isModelLoaded = true;
      this.isUsingMock = false;
      this.predictorMode = 'tfjs_model';
      return { success: true, mode: 'tfjs_model', labelsCount: this.labels.length };
    } catch {
      // Fallback: Weights are empty or model not trained yet
      this.isModelLoaded = false;
      this.isUsingMock = true;
      // Start with smart heuristic so real camera signs work immediately,
      // with ability to switch to mock_random per user spec.
      this.predictorMode = 'smart_heuristic';
      return { success: false, mode: 'smart_heuristic', labelsCount: this.labels.length };
    }
  }

  public getLabels(): string[] {
    return this.labels;
  }

  /**
   * Normalizes 21 3D landmarks (x, y, z)
   * 1. Translates all landmarks relative to the wrist (landmark 0).
   * 2. Scales landmarks by the maximum distance from the wrist.
   * Returns a 63-element 1D array.
   */
  public normalizeLandmarks(landmarks: NormalizedLandmark[]): number[] {
    if (!landmarks || landmarks.length !== 21) {
      return new Array(63).fill(0);
    }

    const wrist = landmarks[0];
    const centered: { x: number; y: number; z: number }[] = [];
    let maxDist = 0;

    for (let i = 0; i < 21; i++) {
      const p = landmarks[i];
      const dx = p.x - wrist.x;
      const dy = p.y - wrist.y;
      const dz = (p.z ?? 0) - (wrist.z ?? 0);
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist > maxDist) maxDist = dist;
      centered.push({ x: dx, y: dy, z: dz });
    }

    const scale = maxDist > 0.0001 ? 1 / maxDist : 1;
    const flat: number[] = [];

    for (let i = 0; i < 21; i++) {
      flat.push(centered[i].x * scale);
      flat.push(centered[i].y * scale);
      flat.push(centered[i].z * scale);
    }

    return flat;
  }

  /**
   * Analyzes 21 landmarks to check finger extension states
   */
  public analyzeFingers(landmarks: NormalizedLandmark[]): FingerStates {
    const wrist = landmarks[0];

    const dist = (p1: NormalizedLandmark, p2: NormalizedLandmark) => {
      const dx = p1.x - p2.x;
      const dy = p1.y - p2.y;
      const dz = (p1.z ?? 0) - (p2.z ?? 0);
      return Math.sqrt(dx * dx + dy * dy + dz * dz);
    };

    // Thumb: tip (4) vs IP (3) vs MCP (2) & distance from wrist and index base (5)
    const thumbTip = landmarks[4];
    const thumbIp = landmarks[3];
    const indexMcp = landmarks[5];
    const thumbDistToWrist = dist(thumbTip, wrist);
    const thumbIpDistToWrist = dist(thumbIp, wrist);
    const thumbDistToIndexBase = dist(thumbTip, indexMcp);
    const thumbExtended = thumbDistToWrist > thumbIpDistToWrist * 1.08 && thumbDistToIndexBase > 0.12;

    // Index: tip (8) vs PIP (6)
    const indexTip = landmarks[8];
    const indexPip = landmarks[6];
    const indexExtended = dist(indexTip, wrist) > dist(indexPip, wrist) * 1.15;

    // Middle: tip (12) vs PIP (10)
    const middleTip = landmarks[12];
    const middlePip = landmarks[10];
    const middleExtended = dist(middleTip, wrist) > dist(middlePip, wrist) * 1.15;

    // Ring: tip (16) vs PIP (14)
    const ringTip = landmarks[16];
    const ringPip = landmarks[14];
    const ringExtended = dist(ringTip, wrist) > dist(ringPip, wrist) * 1.15;

    // Pinky: tip (20) vs PIP (18)
    const pinkyTip = landmarks[20];
    const pinkyPip = landmarks[18];
    const pinkyExtended = dist(pinkyTip, wrist) > dist(pinkyPip, wrist) * 1.15;

    const count =
      (indexExtended ? 1 : 0) +
      (middleExtended ? 1 : 0) +
      (ringExtended ? 1 : 0) +
      (pinkyExtended ? 1 : 0) +
      (thumbExtended ? 1 : 0);

    return {
      thumb: thumbExtended,
      index: indexExtended,
      middle: middleExtended,
      ring: ringExtended,
      pinky: pinkyExtended,
      extendedCount: count,
    };
  }

  /**
   * Predicts sign from normalized landmarks
   */
  public predict(landmarks: NormalizedLandmark[]): SignPrediction {
    const now = Date.now();

    // If real TF.js model is available and enabled:
    if (this.predictorMode === 'tfjs_model' && this.model) {
      try {
        const features = this.normalizeLandmarks(landmarks);
        const tensor = tf.tensor2d([features], [1, 63]);
        const output = this.model.predict(tensor) as tf.Tensor;
        const probs = output.dataSync();
        tensor.dispose();
        output.dispose();

        let maxIdx = 0;
        let maxProb = 0;
        for (let i = 0; i < probs.length; i++) {
          if (probs[i] > maxProb) {
            maxProb = probs[i];
            maxIdx = i;
          }
        }

        const label = this.labels[maxIdx] || 'Hello';
        return {
          label,
          confidence: Math.round(maxProb * 100),
          source: 'model',
          timestamp: now,
        };
      } catch {
        // Fall back to heuristic
      }
    }

    // Mock Random Predictor (per user specification):
    if (this.predictorMode === 'mock_random') {
      // Keep a stable prediction for 1.5 - 2 seconds so the stability 1-second threshold can trigger
      if (!this.mockHoldState || now - this.mockHoldState.lastSeen > 2500) {
        const randomLabel = this.labels[Math.floor(Math.random() * this.labels.length)] || 'Hello';
        this.mockHoldState = {
          label: randomLabel,
          startTime: now,
          lastSeen: now,
        };
      } else {
        this.mockHoldState.lastSeen = now;
      }

      // Random high confidence between 82% and 96%
      const conf = 84 + Math.floor(Math.sin(now / 500) * 8 + 8);
      return {
        label: this.mockHoldState.label,
        confidence: Math.min(98, Math.max(81, conf)),
        source: 'mock',
        timestamp: now,
      };
    }

    // Smart Geometric ISL Heuristics:
    // Recognizes actual Indian Sign Language and universal sign poses
    const fingers = this.analyzeFingers(landmarks);
    const wrist = landmarks[0];
    const thumbTip = landmarks[4];
    const indexTip = landmarks[8];
    const dist = (p1: NormalizedLandmark, p2: NormalizedLandmark) => {
      const dx = p1.x - p2.x;
      const dy = p1.y - p2.y;
      return Math.sqrt(dx * dx + dy * dy);
    };

    let label = 'A';
    let confidence = 88;

    const { thumb, index, middle, ring, pinky, extendedCount } = fingers;

    // Check specific gesture signatures
    if (extendedCount === 5) {
      // All 5 fingers extended: Open Palm -> "Hello" / "5"
      label = 'Hello';
      confidence = 94;
    } else if (extendedCount === 0) {
      // Closed fist -> "A" / "No"
      label = 'No';
      confidence = 91;
    } else if (thumb && !index && !middle && !ring && !pinky) {
      // Thumb only: If pointing upwards -> "Yes" / "Good"
      if (thumbTip.y < wrist.y) {
        label = 'Yes';
        confidence = 92;
      } else {
        label = 'Pain';
        confidence = 85;
      }
    } else if (index && !middle && !ring && !pinky) {
      // Single index extended: "1" / "D"
      if (thumb) {
        // Thumb and index ("L" shape) -> "Doctor" / "L"
        label = 'Doctor';
        confidence = 89;
      } else {
        label = '1';
        confidence = 93;
      }
    } else if (index && middle && !ring && !pinky) {
      // Victory / "V" / "2"
      label = 'V';
      confidence = 95;
    } else if (index && middle && ring && !pinky) {
      // Three fingers: "3" / "W"
      label = '3';
      confidence = 92;
    } else if (!thumb && index && middle && ring && pinky) {
      // Four fingers up: "4" / "B"
      label = '4';
      confidence = 91;
    } else if (thumb && index && !middle && !ring && pinky) {
      // "I Love You" / Horns / Distress emergency
      label = 'Help';
      confidence = 93;
    } else if (!thumb && !index && !middle && !ring && pinky) {
      // Only pinky extended: "I" / "Water"
      label = 'Water';
      confidence = 90;
    } else if (dist(thumbTip, indexTip) < 0.05 && middle && ring && pinky) {
      // OK sign / "Thank you" in Indian gesture context
      label = 'Thank you';
      confidence = 92;
    } else if (dist(thumbTip, indexTip) < 0.06 && !middle && !ring && !pinky) {
      // "O"
      label = 'O';
      confidence = 89;
    } else {
      // General hand pose fallback
      label = 'Help';
      confidence = 83;
    }

    return {
      label,
      confidence,
      source: 'heuristic',
      timestamp: now,
    };
  }
}

export const signClassifier = new SignClassifier();

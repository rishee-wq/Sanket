export interface NormalizedLandmark {
  x: number;
  y: number;
  z: number;
}

export interface HandLandmarkResult {
  landmarks: NormalizedLandmark[][];
  worldLandmarks?: NormalizedLandmark[][];
  handedness?: { categoryName: string; score: number }[][];
}

export interface SignPrediction {
  label: string;
  confidence: number;
  source: 'model' | 'heuristic' | 'mock';
  timestamp: number;
}

export interface StabilityState {
  candidateLabel: string | null;
  confidence: number;
  durationMs: number;
  requiredMs: number; // default 1000ms
  progress: number; // 0.0 to 1.0
  isTriggered: boolean;
}

export type AppMode = 'conversation' | 'sos' | 'learn';

export interface QuickPhrase {
  id: string;
  label: string;
  hindi: string;
  iconName: string;
  colorClass: string;
}

export interface LearnLesson {
  id: string;
  label: string;
  category: 'alphabet' | 'number' | 'emergency' | 'courtesy' | 'daily';
  description: string;
  instruction: string;
  tips: string;
  svgPoseType: 'open-palm' | 'fist' | 'index-up' | 'peace' | 'three' | 'thumbs-up' | 'splayed-sos';
}

export interface UserLocation {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
  mapsUrl: string;
}

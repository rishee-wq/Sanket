export interface NormalizedLandmark {
  x: number;
  y: number;
  z: number;
}

/** One hand from MediaPipe HandLandmarker, in image coordinates of the unmirrored frame. */
export interface DetectedHand {
  landmarks: NormalizedLandmark[];
  /** MediaPipe's handedness label, or null if unavailable (e.g. simulated poses). */
  handedness: 'Left' | 'Right' | null;
  score: number;
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

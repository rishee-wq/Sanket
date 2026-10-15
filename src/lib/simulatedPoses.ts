/**
 * Synthetic right-hand landmarks for testing the pipeline without a webcam.
 * Coordinates are in the same normalized image space MediaPipe uses.
 */
import type { DetectedHand, NormalizedLandmark } from '../types/isl';

export type SimulatedPose = 'Hello' | 'Yes' | 'No' | '1' | '2' | 'Help' | 'SOS';

export const SIMULATED_POSES: { pose: SimulatedPose; label: string }[] = [
  { pose: 'Hello', label: '👋 Hello' },
  { pose: 'Yes', label: '👍 Yes' },
  { pose: 'No', label: '✊ No' },
  { pose: '1', label: '☝️ 1' },
  { pose: '2', label: '✌️ 2' },
  { pose: 'Help', label: '🤟 Help' },
  { pose: 'SOS', label: '🖐 SOS' },
];

const OPEN_HAND: [number, number, number][] = [
  [0.5, 0.8, 0], // 0 wrist
  [0.44, 0.73, -0.02], [0.4, 0.65, -0.03], [0.38, 0.58, -0.04], [0.36, 0.52, -0.05], // thumb
  [0.46, 0.6, -0.02], [0.45, 0.5, -0.03], [0.45, 0.43, -0.04], [0.45, 0.35, -0.05], // index
  [0.5, 0.59, -0.02], [0.5, 0.48, -0.03], [0.5, 0.41, -0.04], [0.5, 0.32, -0.05], // middle
  [0.54, 0.61, -0.02], [0.54, 0.51, -0.03], [0.54, 0.44, -0.04], [0.54, 0.36, -0.05], // ring
  [0.58, 0.64, -0.02], [0.59, 0.56, -0.03], [0.6, 0.5, -0.04], [0.6, 0.44, -0.05], // pinky
];

/** Tip positions when a finger is curled into the palm. */
const CURLED: Record<number, [number, number, number]> = {
  4: [0.44, 0.63, 0.05],
  8: [0.46, 0.64, 0.05],
  12: [0.5, 0.64, 0.05],
  16: [0.54, 0.64, 0.05],
  20: [0.58, 0.65, 0.05],
};

const CURLED_TIPS: Record<SimulatedPose, number[]> = {
  Hello: [],
  Yes: [8, 12, 16, 20],
  No: [4, 8, 12, 16, 20],
  '1': [4, 12, 16, 20],
  '2': [4, 16, 20],
  Help: [12, 16],
  SOS: [4],
};

export function simulatedHand(pose: SimulatedPose): DetectedHand {
  const points = OPEN_HAND.map((p) => [...p] as [number, number, number]);
  for (const tip of CURLED_TIPS[pose]) points[tip] = CURLED[tip];
  if (pose === 'Yes') points[4] = [0.42, 0.4, -0.05]; // thumb pointing up

  const landmarks: NormalizedLandmark[] = points.map(([x, y, z]) => ({ x, y, z }));
  return { landmarks, handedness: null, score: 1 };
}

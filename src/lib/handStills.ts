/**
 * Renders still 3D hands for the landing-page cards, reusing one offscreen WebGL stage.
 */
import { HandPose, HandStage } from './hand3d';
import { SHAPES, ShapeName, Vec3 } from './handModel';
import type { ArtPose } from './signArt';
import type { HandPainter } from './signArt';

/** How each card pose looks in 3D: hand shape plus a wrist rotation that reads well. */
const POSE_LOOK: Record<ArtPose, { shape: ShapeName; rot: Vec3 }> = {
  Hello: { shape: 'open', rot: [0, -12, 4] },
  Yes: { shape: 'thumbUp', rot: [0, 55, 0] },
  No: { shape: 'fist', rot: [0, 25, 0] },
  '1': { shape: 'point', rot: [0, -14, 0] },
  '2': { shape: 'vee', rot: [0, -14, 0] },
  '3': { shape: 'three', rot: [0, -14, 0] },
  Help: { shape: 'horns', rot: [0, -10, 0] },
  SOS: { shape: 'flatThumbTucked', rot: [0, -8, 0] },
  Water: { shape: 'pinkyUp', rot: [0, 20, 0] },
  Doctor: { shape: 'ell', rot: [0, -10, 0] },
  Pain: { shape: 'thumbUp', rot: [0, 55, 180] },
  'Thank you': { shape: 'okay', rot: [0, -25, 0] },
  O: { shape: 'oh', rot: [0, 50, 0] },
};

function poseFor(name: ArtPose, x: number): HandPose {
  const look = POSE_LOOK[name];
  return { shape: SHAPES[look.shape], position: [x, 0, 0], rotation: look.rot };
}

export interface HandStillRenderer {
  painterFor: (poses: ArtPose[]) => HandPainter;
  dispose: () => void;
}

/** Creates the shared stage. Throws if WebGL is unavailable (callers fall back to drawings). */
export function createHandStills(skin?: string): HandStillRenderer {
  const canvas = document.createElement('canvas');
  const stage = new HandStage(canvas, { preserve: true, skin });

  return {
    painterFor: (poses) => (ctx, box) => {
      const w = Math.round(box.w);
      const h = Math.round(box.h);
      // The stage applies devicePixelRatio; render at 1x of the card bitmap size.
      stage.renderer.setPixelRatio(1);
      stage.resize(w, h);
      const right = poseFor(poses[0], poses.length > 1 ? -9 : 0);
      // A second hand is the signer's left: mirrored, so mirror its look as well.
      const left = poses[1] ? { ...poseFor(poses[1], 9), rotation: [POSE_LOOK[poses[1]].rot[0], -POSE_LOOK[poses[1]].rot[1], -POSE_LOOK[poses[1]].rot[2]] as Vec3 } : null;
      stage.setPoses(right, left);
      stage.frameHands(0.9, 0, 6);
      stage.render();
      ctx.drawImage(canvas, box.x, box.y, w, h);
    },
    dispose: () => stage.dispose(),
  };
}

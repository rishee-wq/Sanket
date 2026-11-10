"""
Proves that the browser and the training code compute the same features.

Generates random detections, runs the Python implementation (landmarks.to_slots,
features.frame_features, features.sequence_features), then runs the TypeScript
implementation (src/engine/features.ts) on the same inputs with Node and reports
the largest difference.

    python ml/check_parity.py
"""
from __future__ import annotations

import json
from pathlib import Path
import subprocess
import sys
import tempfile

import numpy as np

from features import SEQUENCE_LENGTH, frame_features, resample_indices, sequence_features
from landmarks import to_slots

ROOT = Path(__file__).resolve().parent


def random_detection(rng, labels):
    hands = []
    for label in labels:
        centre = rng.uniform(0.2, 0.8, size=3) * [1, 1, 0]
        points = centre + rng.normal(0, 0.06, size=(21, 3))
        hands.append((points.astype(np.float32), label, float(rng.uniform(0.5, 1.0))))
    return hands


def main():
    rng = np.random.default_rng(42)
    label_sets = [[], ["Right"], ["Left"], [None], ["Right", "Left"], ["Left", "Right"], ["Right", "Right"],
                  ["Left", "Left"], [None, "Left"], [None, None]]
    frames = []
    for labels in label_sets * 3:
        aspect = float(rng.choice([4 / 3, 16 / 9, 1.0]))
        det = random_detection(rng, labels)
        hands, present = to_slots(det, aspect)
        frames.append(
            {
                "aspect": aspect,
                "detected": [
                    {"landmarks": [[float(v) for v in p] for p in h[0]], "handedness": h[1], "score": h[2]} for h in det
                ],
                "hands": hands.reshape(-1).tolist(),
                "present": present.tolist(),
                "features": frame_features(hands, present).tolist(),
            }
        )

    sequences = []
    for n in (9, 32, 47, 80):
        hands = rng.normal(0.5, 0.1, size=(n, 2, 21, 3)).astype(np.float32)
        present = (rng.random((n, 2)) > 0.25).astype(np.float32)
        hands *= present[..., None, None]
        idx = resample_indices(n)
        sequences.append(
            {
                "hands": hands.reshape(-1).tolist(),
                "present": present.tolist(),
                "indices": idx.tolist(),
                "features": sequence_features(hands[idx], present[idx]).reshape(-1).tolist(),
            }
        )

    with tempfile.TemporaryDirectory() as tmp:
        fixture = Path(tmp) / "parity.json"
        fixture.write_text(json.dumps({"sequenceLength": SEQUENCE_LENGTH, "frames": frames, "sequences": sequences}))
        return subprocess.call(["node", str(ROOT / "check_parity.mjs"), str(fixture)])


if __name__ == "__main__":
    sys.exit(main())

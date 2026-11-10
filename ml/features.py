"""
Landmark features for training (spec: docs/preprocessing.md).

This MUST stay numerically identical to src/lib/features.ts.
`python ml/check_parity.py` runs both on the same random hands and compares.

Everything here is vectorised: the functions accept any leading batch
dimensions, so the same code handles one frame, a sequence, or a whole dataset.
"""
from __future__ import annotations

import numpy as np

POINTS = 21
SHAPE_SIZE = POINTS * 3  # 63 values per hand
NUM_SLOTS = 2
RELATION_SIZE = 6
FRAME_SIZE = NUM_SLOTS * SHAPE_SIZE + RELATION_SIZE  # 132
TRAJECTORY_SIZE = 4
SEQ_FRAME_SIZE = FRAME_SIZE + TRAJECTORY_SIZE  # 136
SEQUENCE_LENGTH = 32

EPS = 1e-6


def aspect_correct(points: np.ndarray, aspect: float) -> np.ndarray:
    """
    Spec §1. MediaPipe divides x by the image width and y by the image height, so
    a hand looks squashed differently in a 16:9 and a 4:3 frame. Multiplying x
    (and z, which MediaPipe reports on the x scale) by width/height undoes that.
    """
    out = np.asarray(points, dtype=np.float32).copy()
    out[..., 0] *= aspect
    out[..., 2] *= aspect
    return out


def hand_scale(hands: np.ndarray) -> np.ndarray:
    """Largest wrist-to-landmark distance. hands [..., 21, 3] -> [...]."""
    q = hands - hands[..., 0:1, :]
    return np.linalg.norm(q, axis=-1).max(axis=-1)


def frame_features(hands: np.ndarray, present: np.ndarray) -> np.ndarray:
    """
    Spec §3-§4. hands [..., 2, 21, 3] (aspect-corrected, already in slots),
    present [..., 2] (1 if the slot holds a hand) -> [..., 132].

      [0:63]    slot 0 shape: wrist at the origin, scaled into the unit sphere
      [63:66]   relation: (wrist1 - wrist0) / mean hand size (x, y), log size ratio
      [66:129]  slot 1 shape
      [129:132] flags: slot 0 present, slot 1 present, both present

    Laid out this way the vector reshapes to [2, 22, 3]: one row per hand, 21
    landmarks plus one extra token, 3 channels. A Conv2D with a (1, k) kernel
    then applies the SAME filters to both hands (weight sharing).
    """
    hands = np.asarray(hands, dtype=np.float32)
    present = np.asarray(present, dtype=np.float32)
    scale = hand_scale(hands)  # [..., 2]
    safe = np.where(scale > EPS, scale, 1.0)
    shape = (hands - hands[..., 0:1, :]) / safe[..., None, None] * present[..., None, None]
    shape = shape.reshape(*shape.shape[:-3], NUM_SLOTS, SHAPE_SIZE)

    both = present[..., 0] * present[..., 1]
    mean_scale = np.maximum((scale[..., 0] + scale[..., 1]) / 2, EPS)
    offset = (hands[..., 1, 0, :2] - hands[..., 0, 0, :2]) / mean_scale[..., None] * both[..., None]
    ratio = np.log(np.maximum(scale[..., 1], EPS) / np.maximum(scale[..., 0], EPS)) * both
    relation = np.concatenate([offset, ratio[..., None]], axis=-1)
    flags = np.concatenate([present, both[..., None]], axis=-1)
    return np.concatenate([shape[..., 0, :], relation, shape[..., 1, :], flags], axis=-1).astype(np.float32)


def resample_indices(n: int, length: int = SEQUENCE_LENGTH) -> np.ndarray:
    """Spec §5: `length` frame indices spread evenly over n frames (nearest neighbour)."""
    if n <= 0:
        return np.zeros(0, dtype=np.int64)
    if length == 1:
        return np.zeros(1, dtype=np.int64)
    # floor(x + 0.5) rounds half up, exactly like Math.floor(x + 0.5) in the browser.
    return np.floor(np.arange(length) * (n - 1) / (length - 1) + 0.5).astype(np.int64)


def sequence_features(hands: np.ndarray, present: np.ndarray) -> np.ndarray:
    """
    Spec §5. hands [..., T, 2, 21, 3], present [..., T, 2] -> [..., T, 136].

    Adds a 4-value trajectory to every frame: each wrist's (x, y) relative to the
    average wrist position of the whole window, in units of the average hand
    size. That keeps how the hands MOVE while removing where the signer stands
    and how far they are from the camera.
    """
    hands = np.asarray(hands, dtype=np.float32)
    present = np.asarray(present, dtype=np.float32)
    frame = frame_features(hands, present)  # [..., T, 132]

    wrists = hands[..., 0, :2]  # [..., T, 2, 2]
    scale = hand_scale(hands)  # [..., T, 2]
    count = present.sum(axis=(-1, -2), keepdims=True)  # [..., 1, 1]
    safe_count = np.maximum(count, 1.0)
    centre = (wrists * present[..., None]).sum(axis=(-2, -3), keepdims=True) / safe_count[..., None]
    mean_scale = np.maximum((scale * present).sum(axis=(-1, -2), keepdims=True) / safe_count, EPS)
    trajectory = (wrists - centre) / mean_scale[..., None] * present[..., None]
    trajectory = trajectory.reshape(*trajectory.shape[:-2], TRAJECTORY_SIZE)
    return np.concatenate([frame, trajectory], axis=-1).astype(np.float32)

"""
MediaPipe hand detection for the training scripts (spec §1-§2).

Uses the same hand_landmarker.task file and thresholds as the browser
(src/hooks/useHandLandmarker.ts), so training data and live frames come from
the same detector. Always detect on the UNMIRRORED frame.
"""
from __future__ import annotations

from pathlib import Path
import urllib.request

import numpy as np

from features import NUM_SLOTS, POINTS, aspect_correct

LANDMARKER_URL = (
    "https://storage.googleapis.com/mediapipe-models/hand_landmarker/"
    "hand_landmarker/float16/1/hand_landmarker.task"
)
LANDMARKER_PATH = Path(__file__).parent / "models" / "hand_landmarker.task"


def ensure_landmarker_model() -> Path:
    if not LANDMARKER_PATH.exists():
        LANDMARKER_PATH.parent.mkdir(parents=True, exist_ok=True)
        print(f"Downloading {LANDMARKER_URL}")
        urllib.request.urlretrieve(LANDMARKER_URL, LANDMARKER_PATH)
    return LANDMARKER_PATH


def create_landmarker(video: bool = False, min_confidence: float = 0.5):
    import mediapipe as mp
    from mediapipe.tasks.python import BaseOptions
    from mediapipe.tasks.python.vision import HandLandmarker, HandLandmarkerOptions, RunningMode

    options = HandLandmarkerOptions(
        base_options=BaseOptions(model_asset_path=str(ensure_landmarker_model())),
        running_mode=RunningMode.VIDEO if video else RunningMode.IMAGE,
        num_hands=2,
        min_hand_detection_confidence=min_confidence,
        min_hand_presence_confidence=min_confidence,
        min_tracking_confidence=min_confidence,
    )
    return HandLandmarker.create_from_options(options), mp


def detect(landmarker, mp, rgb: np.ndarray, timestamp_ms: int | None = None):
    """Returns a list of (points [21, 3], handedness or None, score), one per detected hand."""
    image = mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(rgb))
    result = landmarker.detect(image) if timestamp_ms is None else landmarker.detect_for_video(image, timestamp_ms)
    hands = []
    for lms, handed in zip(result.hand_landmarks, result.handedness):
        points = np.array([[p.x, p.y, p.z] for p in lms], dtype=np.float32)
        top = handed[0] if handed else None
        hands.append((points, top.category_name if top else None, float(top.score) if top else 0.0))
    return hands


def to_slots(detected, aspect: float):
    """
    Spec §2: put up to two detected hands into fixed slots.

    - Both labels present and different: "Right" goes in slot 0, "Left" in slot 1.
    - Otherwise the hand whose wrist has the larger x goes in slot 0.
    - One hand: slot 1 if it is "Left", else slot 0.

    Returns hands [2, 21, 3] (aspect-corrected) and present [2].
    """
    hands = np.zeros((NUM_SLOTS, POINTS, 3), dtype=np.float32)
    present = np.zeros(NUM_SLOTS, dtype=np.float32)
    if not detected:
        return hands, present

    by_score = sorted(detected, key=lambda h: h[2], reverse=True)[:NUM_SLOTS]
    a = by_score[0]
    b = by_score[1] if len(by_score) > 1 else None
    if b is None:
        order = [None, a] if a[1] == "Left" else [a, None]
    elif a[1] is not None and b[1] is not None and a[1] != b[1]:
        order = [a, b] if a[1] == "Right" else [b, a]
    else:
        order = [a, b] if a[0][0, 0] >= b[0][0, 0] else [b, a]

    for slot, hand in enumerate(order):
        if hand is not None:
            hands[slot] = aspect_correct(hand[0], aspect)
            present[slot] = 1.0
    return hands, present

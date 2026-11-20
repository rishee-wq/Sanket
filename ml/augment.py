"""
Data augmentation on RAW landmarks (before features are computed).

Augmenting the raw points, then running the normal feature code, guarantees an
augmented sample is always something the live pipeline could really produce.

All functions take hands [..., 2, 21, 3] and present [..., 2] and work on any
leading batch shape. For a sequence the same random transform is used for every
frame (pass `per_sample_axes`), otherwise the hand would wobble unnaturally.
"""
from __future__ import annotations

import numpy as np

from features import hand_scale


def _rand(rng, shape, low, high):
    return rng.uniform(low, high, size=shape).astype(np.float32)


def _rot_x(a):
    c, s, o, z = np.cos(a), np.sin(a), np.ones_like(a), np.zeros_like(a)
    return np.stack([np.stack([o, z, z], -1), np.stack([z, c, -s], -1), np.stack([z, s, c], -1)], -2)


def _rot_y(a):
    c, s, o, z = np.cos(a), np.sin(a), np.ones_like(a), np.zeros_like(a)
    return np.stack([np.stack([c, z, s], -1), np.stack([z, o, z], -1), np.stack([-s, z, c], -1)], -2)


def _rot_z(a):
    c, s, o, z = np.cos(a), np.sin(a), np.ones_like(a), np.zeros_like(a)
    return np.stack([np.stack([c, -s, z], -1), np.stack([s, c, z], -1), np.stack([z, z, o], -1)], -2)


def augment(
    hands: np.ndarray,
    present: np.ndarray,
    rng: np.random.Generator,
    time_axis: bool = False,
    mirror_p: float = 0.5,
    rotate_deg: float = 14.0,
    tilt_deg: float = 12.0,
    scale_range: float = 0.12,
    shift: float = 0.08,
    jitter: float = 0.012,
    drop_p: float = 0.0,
    amplitude: float = 0.0,
):
    """
    Returns augmented copies of (hands, present).

    time_axis=True means the arrays are [B, T, 2, 21, 3] / [B, T, 2] and the
    geometric transforms are shared by all T frames of a sample.

      mirror     swap left and right: negate x and swap the two slots.
                 Makes the model work for left- and right-handed signers.
      rotate     in-plane rotation of the whole scene (camera roll, arm angle).
      tilt       small 3D rotation of each hand about its own wrist.
      scale      each hand grows/shrinks a little about its wrist (distance).
      shift      each hand slides a little, in units of hand size.
      jitter     Gaussian noise per landmark, in units of hand size
                 (imitates landmark detector noise).
      drop       a hand randomly disappears for a frame (detector miss).
      amplitude  (sequences only) the wrist path is stretched or shrunk about
                 its mean, so the movement gets bigger or smaller while the
                 hands keep their size: different people sign the same word
                 with larger or smaller motions.
    """
    hands = hands.astype(np.float32).copy()
    present = present.astype(np.float32).copy()
    lead = hands.shape[:-3]  # (B,) or (B, T)
    sample = (lead[0],) + (1,) * (len(lead) - 1) if time_axis else lead

    # Mirror: x -> -x, then swap slots. Whole samples at a time.
    flip = rng.random(sample) < mirror_p
    hands[..., 0] = np.where(flip[..., None, None], -hands[..., 0], hands[..., 0])
    flip_b = np.broadcast_to(flip, lead)
    hands[flip_b] = hands[flip_b][..., ::-1, :, :]
    present[flip_b] = present[flip_b][..., ::-1]

    # In-plane rotation of everything about the origin.
    angle = np.deg2rad(np.clip(rng.normal(0, rotate_deg, sample), -2.5 * rotate_deg, 2.5 * rotate_deg)).astype(np.float32)
    hands = np.einsum("...ij,...hpj->...hpi", _rot_z(angle), hands)

    # Per-hand tilt, scale and shift about the wrist.
    per_hand = sample + (2,)
    wrist = hands[..., 0:1, :].copy()
    size = hand_scale(hands)[..., None, None]
    rel = hands - wrist
    tilt = _rot_x(np.deg2rad(_rand(rng, per_hand, -tilt_deg, tilt_deg))) @ _rot_y(
        np.deg2rad(_rand(rng, per_hand, -tilt_deg, tilt_deg))
    )
    rel = np.einsum("...ij,...pj->...pi", tilt, rel)
    rel = rel * (1 + _rand(rng, per_hand, -scale_range, scale_range))[..., None, None]
    offset = _rand(rng, per_hand + (1, 3), -shift, shift)
    offset[..., 2] = 0
    hands = wrist + rel + offset * size

    if time_axis and amplitude > 0:
        # [B, T, 2, 3] wrist path, its mean over the present frames, then scale about that mean.
        wrists = hands[..., 0, :]
        weight = present[..., None]
        mean = (wrists * weight).sum(1, keepdims=True) / np.maximum(weight.sum(1, keepdims=True), 1)
        factor = 1 + _rand(rng, (lead[0], 1, 1, 1), -amplitude, amplitude)
        delta = (mean + factor * (wrists - mean)) - wrists
        delta[..., 2] = 0
        hands = hands + delta[..., None, :]

    # Landmark noise (fresh for every frame). Depth is the noisiest coordinate.
    noise = rng.normal(0, jitter, hands.shape).astype(np.float32)
    noise[..., 2] *= 2
    hands = hands + noise * size

    if drop_p > 0:
        keep = (rng.random(present.shape) >= drop_p).astype(np.float32)
        present = present * keep

    hands = hands * present[..., None, None]
    return hands, present


def temporal_iou(a0: float, a1: float, b0: float, b1: float) -> float:
    inter = max(0.0, min(a1, b1) - max(a0, b0) + 1)
    union = (a1 - a0 + 1) + (b1 - b0 + 1) - inter
    return inter / union if union > 0 else 0.0


def sample_window(n: int, active: tuple[int, int], rng: np.random.Generator, positive: bool):
    """
    Picks a window [s, e] inside a video of n frames.

    positive: start and end are the sign's true boundaries moved by up to 20% of
              its length, and the window must overlap the sign with IoU >= 0.6.
    negative: a random window whose IoU with the sign is <= 0.3 (rest pose, or
              only the first or last part of the sign). These train the
              "background" class.

    Same idea as anchor labelling in R-CNN style detectors, in time instead of
    image space. Returns None when no valid window is found.
    """
    a0, a1 = active
    length = a1 - a0 + 1
    for _ in range(20):
        if positive:
            s = a0 + rng.uniform(-0.2, 0.2) * length
            e = a1 + rng.uniform(-0.2, 0.2) * length
        else:
            win = rng.uniform(0.4, 1.3) * length
            s = rng.uniform(-0.3 * win, n - 0.7 * win)
            e = s + win
        s, e = int(round(max(0, s))), int(round(min(n - 1, e)))
        if e - s < 5:
            continue
        iou = temporal_iou(s, e, a0, a1)
        if (positive and iou >= 0.6) or (not positive and iou <= 0.3):
            return s, e
    return (a0, a1) if positive else None


def warp_indices(s: int, e: int, length: int, rng: np.random.Generator | None) -> np.ndarray:
    """`length` frame indices from s..e. With rng, time is bent by a random power curve
    (the sign speeds up or slows down part-way), which imitates signing at different tempos."""
    u = np.arange(length) / max(1, length - 1)
    if rng is not None:
        u = u ** rng.uniform(0.75, 1.33)
    return np.floor(s + u * (e - s) + 0.5).astype(np.int64)

"""
Step 4: export one real recording per sign for the app.

For every word, one video from the held-out TEST split; for every letter and
digit, the test image closest to the class average (the medoid). The app plays
them as a hand skeleton in Learn, and replays them through the live engine as
the "demo stream".

Output public/model/exemplars.json (index) and exemplars.bin (int16 frames).

    python ml/export_exemplars.py
"""
from __future__ import annotations

import json

import numpy as np

from common import DATA, PUBLIC_MODEL
from features import frame_features
from train_dynamic import stratified_split
from train_static import split_by_block

SCALE = 10000
LETTER_FRAMES = 22  # a still pose is repeated so it can be "held" during replay
SEED = 7  # must match the training scripts, so exemplars really are test data


def quantise(hands: np.ndarray, present: np.ndarray) -> np.ndarray:
    """[F, 2, 21, 3] -> [F, 126] int16. Absent hands become all zeros."""
    out = np.round(hands * present[..., None, None] * SCALE)
    return np.clip(out, -32767, 32767).astype("<i2").reshape(len(hands), -1)


def main():
    items, chunks, offset = [], [], 0

    def add(label, kind, hands, present, active, fps, aspect, source=None):
        nonlocal offset
        chunks.append(quantise(hands, present))
        item = {"label": label, "kind": kind, "offset": offset, "frames": int(len(hands)),
                "active": [int(active[0]), int(active[1])], "fps": fps, "aspect": aspect}
        if source:
            item["source"] = source  # the INCLUDE video, so export_clips.py can cut the same recording
        items.append(item)
        offset += len(hands)

    dyn_path = DATA / "include_landmarks.npz"
    if dyn_path.exists():
        d = np.load(dyn_path)
        labels = [str(s) for s in d["labels"]]
        _, _, test = stratified_split(d["y"], SEED)
        for c, label in enumerate(labels):
            candidates = sorted(v for v in test if d["y"][v] == c)
            # Prefer a recording where a hand is visible in most of the sign.
            def coverage(v):
                a0, a1 = d["active"][v]
                seg = d["present"][d["start"][v] + a0 : d["start"][v] + a1 + 1]
                return (seg.sum(1) > 0).mean()
            v = max(candidates, key=coverage)
            sl = slice(int(d["start"][v]), int(d["start"][v] + d["length"][v]))
            add(label, "word", d["hands"][sl], d["present"][sl], d["active"][v], 25, 16 / 9, str(d["paths"][v]))

    sta_path = DATA / "static_landmarks.npz"
    if sta_path.exists():
        s = np.load(sta_path)
        labels = [str(x) for x in s["labels"]]
        _, _, test = split_by_block(s["y"], s["order"])
        feats = frame_features(s["hands"][test], s["present"][test])
        for c, label in enumerate(labels):
            idx = np.where(s["y"][test] == c)[0]
            if len(idx) == 0 or label.startswith("_"):
                continue
            # Medoid of the most common hand-count variant of the class.
            both = s["present"][test][idx].sum(1) == 2
            idx = idx[both] if both.mean() >= 0.5 else idx[~both]
            centre = feats[idx].mean(axis=0)
            pick = test[idx[np.argmin(np.linalg.norm(feats[idx] - centre, axis=1))]]
            hands = np.repeat(s["hands"][pick][None], LETTER_FRAMES, axis=0)
            present = np.repeat(s["present"][pick][None], LETTER_FRAMES, axis=0)
            add(label, "letter", hands, present, (0, LETTER_FRAMES - 1), 25, 1.0)

    PUBLIC_MODEL.mkdir(parents=True, exist_ok=True)
    data = np.concatenate(chunks)
    (PUBLIC_MODEL / "exemplars.bin").write_bytes(data.tobytes())
    (PUBLIC_MODEL / "exemplars.json").write_text(json.dumps({"scale": SCALE, "valuesPerFrame": 126, "items": items}))
    print(f"{len(items)} exemplars, {len(data)} frames, {data.nbytes / 1024:.0f} KB -> {PUBLIC_MODEL}")


if __name__ == "__main__":
    main()

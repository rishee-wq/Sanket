"""
Step 1 (dynamic signs): INCLUDE videos -> hand-landmark sequences.

Every frame of every video goes through MediaPipe HandLandmarker in VIDEO mode
(the same tracking mode the browser uses). Each video is cached as its own small
.npz, so the script can be re-run while videos are still downloading and only
does the new ones.

Per video we also find the ACTIVE segment. INCLUDE signers start and end with
their hands resting at their sides, and those rest frames are not part of the
sign. The segment is the span where a wrist is raised clearly above its rest
height (see `active_segment`).

Output ml/data/include_landmarks.npz (after `--collect`):
    hands    [F, 2, 21, 3]  all frames of all videos, concatenated
    present  [F, 2]
    start    [V]            index of each video's first frame in `hands`
    length   [V]            frames per video
    active   [V, 2]         first and last frame (inclusive) of the sign
    y        [V]            label index
    labels, paths

    python ml/extract_include.py            # process new videos
    python ml/extract_include.py --collect  # merge the cache into one file
"""
from __future__ import annotations

import argparse
from concurrent.futures import ProcessPoolExecutor
import hashlib
import os
from pathlib import Path

import numpy as np

ROOT = Path(__file__).parent
RAW = ROOT / "data" / "raw" / "include"
CACHE = ROOT / "data" / "include_cache"
OUT = ROOT / "data" / "include_landmarks.npz"
VIDEO_EXTS = {".mov", ".mp4", ".avi", ".mkv"}


def cache_path(video: Path) -> Path:
    key = hashlib.sha1(video.relative_to(RAW).as_posix().encode()).hexdigest()[:16]
    return CACHE / f"{key}.npz"


def word_of(video: Path) -> str:
    folder = video.parent.name
    head, _, rest = folder.partition(".")
    return (rest if rest and head.strip().isdigit() else folder).strip().lower()


def process_video(path_str: str) -> str:
    os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "3")
    import cv2

    from landmarks import create_landmarker, detect, to_slots

    video = Path(path_str)
    cap = cv2.VideoCapture(path_str)
    fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    aspect = (cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 16) / (cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 9)
    landmarker, mp = create_landmarker(video=True)
    hands, present, i = [], [], 0
    while True:
        ok, bgr = cap.read()
        if not ok:
            break
        detected = detect(landmarker, mp, cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB), int(i * 1000 / fps))
        h, p = to_slots(detected, aspect)
        hands.append(h)
        present.append(p)
        i += 1
    cap.release()
    landmarker.close()
    if not hands:
        return f"EMPTY {path_str}"
    out = cache_path(video)
    np.savez_compressed(
        out.with_suffix(".tmp.npz"),
        hands=np.stack(hands),
        present=np.stack(present),
        fps=fps,
        path=video.relative_to(RAW).as_posix(),
        word=word_of(video),
    )
    out.with_suffix(".tmp.npz").replace(out)
    return ""


def active_segment(hands: np.ndarray, present: np.ndarray, pad: int = 2) -> tuple[int, int]:
    """
    Finds the frames that belong to the sign.

    height[t] = how high the highest visible wrist is (image y grows downward,
    so we use 1 - y). The rest height is the median of the lowest quarter of
    frames; the peak is the 95th percentile. A frame is active when the wrist is
    more than 30% of the way from rest to peak. The segment runs from the first
    to the last active frame, plus `pad` frames each side, so brief detection
    gaps in the middle of a sign (motion blur) stay inside it.
    """
    n = len(hands)
    y = np.where(present > 0, hands[:, :, 0, 1], np.inf).min(axis=1)  # highest wrist per frame
    seen = np.isfinite(y)
    if seen.sum() < 4:
        return 0, n - 1
    height = np.where(seen, 1.0 - y, np.nan)
    values = np.sort(height[seen])
    rest = np.median(values[: max(1, len(values) // 4)])
    peak = np.percentile(values, 95)
    if peak - rest < 0.05:  # hands never clearly rise: keep everything
        return 0, n - 1
    active = np.where(seen & (np.nan_to_num(height, nan=-1) > rest + 0.3 * (peak - rest)))[0]
    return max(0, int(active[0]) - pad), min(n - 1, int(active[-1]) + pad)


def collect():
    files = sorted(CACHE.glob("*.npz"))
    files = [f for f in files if not f.name.endswith(".tmp.npz")]
    items = []
    for f in files:
        d = np.load(f)
        items.append((str(d["path"]), str(d["word"]), d["hands"], d["present"]))
    items.sort(key=lambda it: it[0])
    labels = sorted({it[1] for it in items})
    hands = np.concatenate([it[2] for it in items])
    present = np.concatenate([it[3] for it in items])
    length = np.array([len(it[2]) for it in items])
    start = np.concatenate([[0], np.cumsum(length)[:-1]])
    active = np.array([active_segment(it[2], it[3]) for it in items])
    np.savez_compressed(
        OUT,
        hands=hands,
        present=present,
        start=start,
        length=length,
        active=active,
        y=np.array([labels.index(it[1]) for it in items]),
        labels=np.array(labels),
        paths=np.array([it[0] for it in items]),
    )
    seg = active[:, 1] - active[:, 0] + 1
    print(f"{len(items)} videos, {len(labels)} words, {len(hands)} frames -> {OUT}")
    print(f"frames per video: median {np.median(length):.0f}; active segment: median {np.median(seg):.0f} frames")
    print(f"frames with a hand: {100 * (present.sum(1) > 0).mean():.1f}%")


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--workers", type=int, default=max(1, (os.cpu_count() or 2) - 4))
    parser.add_argument("--collect", action="store_true")
    args = parser.parse_args()

    if args.collect:
        return collect()

    CACHE.mkdir(parents=True, exist_ok=True)
    todo = [v for v in sorted(RAW.rglob("*")) if v.suffix.lower() in VIDEO_EXTS and not cache_path(v).exists()]
    print(f"{len(todo)} videos to process", flush=True)
    with ProcessPoolExecutor(args.workers) as pool:
        for n, msg in enumerate(pool.map(process_video, [str(v) for v in todo], chunksize=2), 1):
            if msg:
                print(msg, flush=True)
            if n % 50 == 0 or n == len(todo):
                print(f"  {n}/{len(todo)}", flush=True)


if __name__ == "__main__":
    main()

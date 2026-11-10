"""
Step 1 (static signs): images -> hand landmarks.

Source: the 35-class ISL letters and digits image set (1-9, A-Z, 42,745 images),
stored as one parquet file. Every image goes through MediaPipe HandLandmarker
and the slot rule in landmarks.py, exactly like a camera frame in the browser.
Images where no hand is found are dropped.

Output ml/data/static_landmarks.npz:
    hands   [N, 2, 21, 3]  aspect-corrected landmarks, already in slots
    present [N, 2]         1 if the slot holds a hand
    y       [N]            label index
    order   [N]            position of the image in the source (used for the split)
    labels                 label names, in output-index order

    python ml/extract_static.py
"""
from __future__ import annotations

import argparse
from concurrent.futures import ProcessPoolExecutor
import os
from pathlib import Path

import numpy as np

SOURCE = Path(__file__).parent / "data" / "raw" / "isl_static" / "train.parquet"
OUT = Path(__file__).parent / "data" / "static_landmarks.npz"
LABELS = "1 2 3 4 5 6 7 8 9 A B C D E F G H I J K L M N O P Q R S T U V W X Y Z".split()


def process_groups(args):
    """Worker: runs MediaPipe over a slice of parquet row groups."""
    source, groups = args
    os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "3")
    import cv2
    import pyarrow.parquet as pq

    from landmarks import create_landmarker, detect, to_slots

    pf = pq.ParquetFile(source)
    landmarker, mp = create_landmarker()
    hands, present, y, order, seen = [], [], [], [], 0
    for g in groups:
        table = pf.read_row_group(g)
        start = sum(pf.metadata.row_group(i).num_rows for i in range(g))
        for i, row in enumerate(table.to_pylist()):
            seen += 1
            bgr = cv2.imdecode(np.frombuffer(row["image"]["bytes"], np.uint8), cv2.IMREAD_COLOR)
            if bgr is None:
                continue
            detected = detect(landmarker, mp, cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB))
            if not detected:
                continue
            h, p = to_slots(detected, aspect=bgr.shape[1] / bgr.shape[0])
            hands.append(h)
            present.append(p)
            y.append(row["label"])
            order.append(start + i)
    landmarker.close()
    return hands, present, y, order, seen


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--source", type=Path, default=SOURCE)
    parser.add_argument("--out", type=Path, default=OUT)
    parser.add_argument("--workers", type=int, default=max(1, (os.cpu_count() or 2) - 2))
    args = parser.parse_args()

    import pyarrow.parquet as pq

    n_groups = pq.ParquetFile(args.source).num_row_groups
    chunks = [list(c) for c in np.array_split(np.arange(n_groups), args.workers * 4) if len(c)]
    hands, present, y, order, seen = [], [], [], [], 0
    with ProcessPoolExecutor(args.workers) as pool:
        for n, part in enumerate(pool.map(process_groups, [(str(args.source), c) for c in chunks]), 1):
            hands += part[0]
            present += part[1]
            y += part[2]
            order += part[3]
            seen += part[4]
            print(f"  chunk {n}/{len(chunks)}: {len(y)}/{seen} images kept", flush=True)

    idx = np.argsort(order)
    y_arr = np.array(y)[idx]
    np.savez_compressed(
        args.out,
        hands=np.stack(hands)[idx],
        present=np.stack(present)[idx],
        y=y_arr,
        order=np.array(order)[idx],
        labels=np.array(LABELS),
    )
    print(f"Kept {len(y)}/{seen} images. Saved {args.out}")
    for i, name in enumerate(LABELS):
        print(f"  {name}: {(y_arr == i).sum()}", end="")
    print()


if __name__ == "__main__":
    main()

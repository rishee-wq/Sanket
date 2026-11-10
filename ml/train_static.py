"""
Step 2 (static signs): train the letter/digit classifier.

    python ml/train_static.py                 # the CNN that ships to the browser
    python ml/train_static.py --model mlp     # baseline, for the comparison table

Reads ml/data/static_landmarks.npz (from extract_static.py).
"""
from __future__ import annotations

import argparse
import json
import time

import numpy as np
import tf_keras as keras

from augment import augment
from common import (DATA, PUBLIC_MODEL, RUNS, apply_temperature, classification_metrics, embed_2d, export_tfjs,
                    fit_temperature, layer_table, make_optimizer, save_plots, write_parity)
from features import FRAME_SIZE, frame_features
from models import STATIC_MODELS


BACKGROUND = "_none"


def add_background(hands, present, y, order, labels, limit=3000):
    """
    Adds a "not a letter" class. The letter images only ever show a letter, so a
    network trained on them alone must call EVERY hand some letter, including
    hands simply hanging at rest. The INCLUDE word videos start and end with the
    signer's hands at rest; those frames are the negatives.
    """
    path = DATA / "include_landmarks.npz"
    if not path.exists():
        return hands, present, y, order, labels
    d = np.load(path)
    keep = []
    for v in range(len(d["y"])):
        a0, a1 = d["active"][v]
        frames = np.arange(d["length"][v])
        rest = frames[(frames < a0 - 2) | (frames > a1 + 2)] + d["start"][v]
        keep.append(rest[d["present"][rest].sum(1) > 0])
    keep = np.concatenate(keep)  # in video order, so the block split keeps whole videos together
    keep = keep[:: max(1, len(keep) // limit)][:limit]
    return (
        np.concatenate([hands, d["hands"][keep]]),
        np.concatenate([present, d["present"][keep]]),
        np.concatenate([y, np.full(len(keep), len(labels))]),
        np.concatenate([order, order.max() + 1 + np.arange(len(keep))]),
        labels + [BACKGROUND],
    )


def split_by_block(y: np.ndarray, order: np.ndarray, val: float = 0.15, test: float = 0.15):
    """
    The images of a class are consecutive camera frames, so neighbours are
    near-duplicates. A random split would put almost the same picture in train
    and test and report a flattering number. Instead each class is cut into
    contiguous blocks in capture order: first 70% train, next 15% validation,
    last 15% test.
    """
    train, va, te = [], [], []
    for c in np.unique(y):
        idx = np.where(y == c)[0]
        idx = idx[np.argsort(order[idx])]
        n = len(idx)
        a, b = int(n * (1 - val - test)), int(n * (1 - test))
        train += list(idx[:a])
        va += list(idx[a:b])
        te += list(idx[b:])
    return np.array(train), np.array(va), np.array(te)


class StaticBatches(keras.utils.Sequence):
    """Yields freshly augmented batches every epoch, with mixup."""

    def __init__(self, hands, present, y, num_classes, batch_size, seed, mixup_alpha=0.2, strength=1.0):
        self.hands, self.present, self.y, self.strength = hands, present, y, strength
        self.num_classes, self.batch_size, self.mixup_alpha = num_classes, batch_size, mixup_alpha
        self.rng = np.random.default_rng(seed)
        self.on_epoch_end()

    def __len__(self):
        return len(self.y) // self.batch_size

    def on_epoch_end(self):
        self.perm = self.rng.permutation(len(self.y))

    def __getitem__(self, i):
        idx = self.perm[i * self.batch_size : (i + 1) * self.batch_size]
        k = self.strength
        hands, present = augment(self.hands[idx], self.present[idx], self.rng, rotate_deg=14 * k, tilt_deg=12 * k,
                                 jitter=0.012 * k)
        x = frame_features(hands, present)
        t = np.eye(self.num_classes, dtype=np.float32)[self.y[idx]]
        if self.mixup_alpha > 0:
            # Mixup: blend each sample with another one and blend the labels the same way.
            # The network cannot memorise single examples and learns smoother boundaries.
            lam = self.rng.beta(self.mixup_alpha, self.mixup_alpha, size=(len(idx), 1)).astype(np.float32)
            lam = np.maximum(lam, 1 - lam)
            other = self.rng.permutation(len(idx))
            x = lam * x + (1 - lam) * x[other]
            t = lam * t + (1 - lam) * t[other]
        return x, t


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--model", choices=sorted(STATIC_MODELS), default="cnn")
    parser.add_argument("--epochs", type=int, default=40)
    parser.add_argument("--batch-size", type=int, default=256)
    parser.add_argument("--seed", type=int, default=7)
    parser.add_argument("--mixup", type=float, default=0.2, help="mixup alpha (0 turns it off)")
    parser.add_argument("--aug", type=float, default=1.0, help="augmentation strength multiplier")
    parser.add_argument("--no-export", action="store_true")
    args = parser.parse_args()

    keras.utils.set_random_seed(args.seed)
    data = np.load(DATA / "static_landmarks.npz")
    hands, present, y, labels = data["hands"], data["present"], data["y"], [str(s) for s in data["labels"]]
    hands, present, y, order, labels = add_background(hands, present, y, data["order"], labels)
    tr, va, te = split_by_block(y, order)
    print(f"{len(y)} samples, {len(labels)} classes: train {len(tr)}, val {len(va)}, test {len(te)}")

    x_val, x_test = frame_features(hands[va], present[va]), frame_features(hands[te], present[te])
    onehot = np.eye(len(labels), dtype=np.float32)
    batches = StaticBatches(hands[tr], present[tr], y[tr], len(labels), args.batch_size, args.seed,
                            mixup_alpha=args.mixup if args.model == "cnn" else 0.0, strength=args.aug)

    model = STATIC_MODELS[args.model](len(labels))
    model.compile(
        optimizer=make_optimizer(len(batches), args.epochs),
        # Label smoothing: the target is 0.9 for the true class instead of 1.0, which stops
        # the network from pushing its logits to infinity and keeps confidences honest.
        loss=keras.losses.CategoricalCrossentropy(label_smoothing=0.1),
        metrics=["accuracy"],
    )
    model.summary(line_length=110)

    ckpt = RUNS / f"static_{args.model}.weights.h5"
    RUNS.mkdir(exist_ok=True)
    t0 = time.time()
    history = model.fit(
        batches,
        validation_data=(x_val, onehot[y[va]]),
        epochs=args.epochs,
        verbose=2,
        callbacks=[
            keras.callbacks.ModelCheckpoint(ckpt, monitor="val_accuracy", save_best_only=True, save_weights_only=True),
            # Early stopping: quit once validation accuracy has not improved for 10 epochs.
            keras.callbacks.EarlyStopping(monitor="val_accuracy", patience=10, restore_best_weights=False),
        ],
    ).history
    train_seconds = time.time() - t0
    model.load_weights(ckpt)

    temperature = fit_temperature(model.predict(x_val, batch_size=1024, verbose=0), y[va])
    raw_test = model.predict(x_test, batch_size=1024, verbose=0)
    metrics = classification_metrics(apply_temperature(raw_test, temperature), y[te], labels)
    metrics["ece_uncalibrated"] = classification_metrics(raw_test, y[te], labels)["ece"]

    # Stress test: the same test images, but mirrored at random, rotated up to ~50 degrees,
    # tilted and with double the landmark noise. Closer to a new signer on a new camera.
    hs, ps = augment(hands[te], present[te], np.random.default_rng(123), rotate_deg=20, tilt_deg=18, jitter=0.024)
    stress = model.predict(frame_features(hs, ps), batch_size=1024, verbose=0)
    metrics["stress_accuracy"] = float((stress.argmax(1) == y[te]).mean())
    print(f"\n{args.model}: stress-test accuracy {metrics['stress_accuracy']:.4f}")
    print(f"{args.model}: test accuracy {metrics['accuracy']:.4f}, top-3 {metrics['top3_accuracy']:.4f}, "
          f"macro-F1 {metrics['macro_f1']:.4f}, T={temperature:.2f}, "
          f"ECE {metrics['ece_uncalibrated']:.3f} -> {metrics['ece']:.3f}")

    summary = {
        "model": model.name,
        "params": int(model.count_params()),
        "epochs_run": len(history["loss"]),
        "train_seconds": round(train_seconds, 1),
        "temperature": temperature,
        "split": {"train": len(tr), "val": len(va), "test": len(te)},
        "test": {k: v for k, v in metrics.items() if k not in ("per_class", "confusion")},
    }
    (RUNS / f"static_{args.model}.json").write_text(json.dumps(summary, indent=2))

    if args.model == "cnn" and not args.no_export:
        save_plots("static_cnn", history, metrics, labels)
        baselines = {}
        for other in STATIC_MODELS:
            f = RUNS / f"static_{other}.json"
            if f.exists():
                baselines[other] = json.loads(f.read_text())
        report = {
            **summary,
            "labels": labels,
            "history": {k: [round(float(v), 4) for v in vals] for k, vals in history.items()},
            "metrics": metrics,
            "layers": layer_table(model),
            "embedding": embed_2d(model, x_test, y[te]),
            "comparison": baselines,
            "dataset": "ISL letters and digits image set (35 classes) plus rest-pose frames from INCLUDE as a 'not a letter' class, "
                       "landmarks via MediaPipe HandLandmarker",
        }
        config = {"type": "static", "frameSize": FRAME_SIZE, "numHands": 2, "inputShape": [FRAME_SIZE],
                  "temperature": temperature, "background": BACKGROUND, "version": 2}
        export_tfjs(model, PUBLIC_MODEL / "static", labels, config, report)
        write_parity(model, x_test, "static")


if __name__ == "__main__":
    main()

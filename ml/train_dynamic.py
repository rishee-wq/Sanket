"""
Step 2 (dynamic signs): train the word classifier on INCLUDE.

    python ml/train_dynamic.py                  # the temporal CNN that ships to the browser
    python ml/train_dynamic.py --model bilstm   # baselines for the comparison table
    python ml/train_dynamic.py --model gru
    python ml/train_dynamic.py --model mlp

Reads ml/data/include_landmarks.npz (from extract_include.py --collect).

Every training sample is a WINDOW cut from a video and resampled to 32 frames:
  - a positive window covers the sign (temporal IoU >= 0.6 with the active
    segment) and is labelled with the word;
  - a negative window covers the rest pose or only a fragment of the sign
    (IoU <= 0.3) and is labelled "_background".
At run time the app slides windows of several lengths over the live stream, so
the model has to say "nothing yet" for most of them. The background class is
what makes that possible.
"""
from __future__ import annotations

import argparse
import json
import time

import numpy as np
import tf_keras as keras

from augment import augment, sample_window, warp_indices
from common import (DATA, PUBLIC_MODEL, RUNS, apply_temperature, classification_metrics, embed_2d, export_tfjs,
                    fit_temperature, layer_table, make_optimizer, save_plots, write_parity)
from features import SEQ_FRAME_SIZE, SEQUENCE_LENGTH, sequence_features

BACKGROUND = "_background"


def stratified_split(y: np.ndarray, seed: int, val: float = 0.15, test: float = 0.15):
    """Per word: shuffle its videos, then 70% train / 15% validation / 15% test. No video is in two sets."""
    rng = np.random.default_rng(seed)
    train, va, te = [], [], []
    for c in np.unique(y):
        idx = rng.permutation(np.where(y == c)[0])
        n_test = max(2, int(round(len(idx) * test)))
        n_val = max(2, int(round(len(idx) * val)))
        te += list(idx[:n_test])
        va += list(idx[n_test : n_test + n_val])
        train += list(idx[n_test + n_val :])
    return np.array(train), np.array(va), np.array(te)


class Videos:
    def __init__(self, data):
        self.hands, self.present = data["hands"], data["present"]
        self.start, self.length, self.active, self.y = data["start"], data["length"], data["active"], data["y"]

    def window(self, v: int, s: int, e: int, rng=None):
        idx = self.start[v] + np.clip(warp_indices(s, e, SEQUENCE_LENGTH, rng), 0, self.length[v] - 1)
        return self.hands[idx], self.present[idx]


def build_set(videos: Videos, ids: np.ndarray, background: int, rng, augmented: bool, negatives: float):
    """One pass over `ids`: a positive window per video, plus a negative window for a share of them."""
    hands, present, y = [], [], []
    for v in ids:
        n, active = int(videos.length[v]), tuple(int(a) for a in videos.active[v])
        if augmented:
            s, e = sample_window(n, active, rng, positive=True)
        else:
            s, e = active
        h, p = videos.window(v, s, e, rng if augmented else None)
        hands.append(h)
        present.append(p)
        y.append(int(videos.y[v]))
        if rng.random() < negatives:
            neg = sample_window(n, active, rng, positive=False)
            if neg is not None:
                h, p = videos.window(v, neg[0], neg[1], rng if augmented else None)
                if p.sum() > 0:  # an all-empty window never reaches the model at run time
                    hands.append(h)
                    present.append(p)
                    y.append(background)
    return np.stack(hands), np.stack(present), np.array(y)


class DynamicBatches(keras.utils.Sequence):
    """Re-cuts and re-augments every window at the start of each epoch."""

    def __init__(self, videos, ids, num_classes, background, batch_size, seed):
        self.videos, self.ids, self.num_classes, self.background = videos, ids, num_classes, background
        self.batch_size, self.rng = batch_size, np.random.default_rng(seed)
        self.on_epoch_end()

    def on_epoch_end(self):
        # Three differently cut and augmented windows per video per epoch.
        parts = [build_set(self.videos, self.ids, self.background, self.rng, True, 0.25) for _ in range(3)]
        hands = np.concatenate([p[0] for p in parts])
        present = np.concatenate([p[1] for p in parts])
        y = np.concatenate([p[2] for p in parts])
        hands, present = augment(hands, present, self.rng, time_axis=True, drop_p=0.03)
        perm = self.rng.permutation(len(y))
        self.x = sequence_features(hands, present)[perm]
        self.t = np.eye(self.num_classes, dtype=np.float32)[y[perm]]

    def __len__(self):
        return len(self.t) // self.batch_size

    def __getitem__(self, i):
        sl = slice(i * self.batch_size, (i + 1) * self.batch_size)
        return self.x[sl], self.t[sl]


def fixed_set(videos, ids, background, seed):
    """Validation/test windows: the exact sign, plus negatives, cut once with a fixed seed."""
    hands, present, y = build_set(videos, ids, background, np.random.default_rng(seed), False, 0.5)
    return sequence_features(hands, present), y


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--model", default="tcn")
    parser.add_argument("--epochs", type=int, default=120)
    parser.add_argument("--batch-size", type=int, default=64)
    parser.add_argument("--seed", type=int, default=7)
    parser.add_argument("--no-export", action="store_true")
    args = parser.parse_args()

    from models import DYNAMIC_MODELS

    keras.utils.set_random_seed(args.seed)
    data = np.load(DATA / "include_landmarks.npz")
    videos = Videos(data)
    labels = [str(s) for s in data["labels"]] + [BACKGROUND]
    background = len(labels) - 1
    tr, va, te = stratified_split(videos.y, args.seed)
    print(f"{len(videos.y)} videos, {background} words + background: train {len(tr)}, val {len(va)}, test {len(te)}")

    x_val, y_val = fixed_set(videos, va, background, 1)
    x_test, y_test = fixed_set(videos, te, background, 2)
    onehot = np.eye(len(labels), dtype=np.float32)
    batches = DynamicBatches(videos, tr, len(labels), background, args.batch_size, args.seed)

    model = DYNAMIC_MODELS[args.model](len(labels))
    model.compile(
        optimizer=make_optimizer(len(batches), args.epochs, peak_lr=2e-3, weight_decay=5e-4),
        loss=keras.losses.CategoricalCrossentropy(label_smoothing=0.1),
        metrics=["accuracy"],
    )
    model.summary(line_length=110)

    RUNS.mkdir(exist_ok=True)
    ckpt = RUNS / f"dynamic_{args.model}.weights.h5"
    t0 = time.time()
    history = model.fit(
        batches,
        validation_data=(x_val, onehot[y_val]),
        epochs=args.epochs,
        verbose=2,
        callbacks=[
            keras.callbacks.ModelCheckpoint(ckpt, monitor="val_accuracy", save_best_only=True, save_weights_only=True),
            keras.callbacks.EarlyStopping(monitor="val_accuracy", patience=30),
        ],
    ).history
    train_seconds = time.time() - t0
    model.load_weights(ckpt)

    temperature = fit_temperature(model.predict(x_val, batch_size=256, verbose=0), y_val)
    raw_test = model.predict(x_test, batch_size=256, verbose=0)
    metrics = classification_metrics(apply_temperature(raw_test, temperature), y_test, labels)
    metrics["ece_uncalibrated"] = classification_metrics(raw_test, y_test, labels)["ece"]
    words = y_test != background
    metrics["word_accuracy"] = float((raw_test[words].argmax(1) == y_test[words]).mean())
    metrics["background_recall"] = float((raw_test[~words].argmax(1) == background).mean()) if (~words).any() else None

    # Single-sample CPU latency, measured the way the app calls the model.
    one = x_test[:1]
    model.predict(one, verbose=0)
    t1 = time.perf_counter()
    for _ in range(50):
        model(one, training=False)
    latency_ms = (time.perf_counter() - t1) / 50 * 1000

    print(f"\n{args.model}: test accuracy {metrics['accuracy']:.4f} (words only {metrics['word_accuracy']:.4f}), "
          f"top-3 {metrics['top3_accuracy']:.4f}, macro-F1 {metrics['macro_f1']:.4f}, T={temperature:.2f}, "
          f"ECE {metrics['ece_uncalibrated']:.3f} -> {metrics['ece']:.3f}, {latency_ms:.1f} ms/window (Keras, CPU)")

    summary = {
        "model": model.name,
        "params": int(model.count_params()),
        "epochs_run": len(history["loss"]),
        "train_seconds": round(train_seconds, 1),
        "temperature": temperature,
        "keras_cpu_ms": round(latency_ms, 2),
        "split": {"train": len(tr), "val": len(va), "test": len(te)},
        "test": {k: v for k, v in metrics.items() if k not in ("per_class", "confusion")},
    }
    (RUNS / f"dynamic_{args.model}.json").write_text(json.dumps(summary, indent=2))

    if args.model == "tcn" and not args.no_export:
        save_plots("dynamic_tcn", history, metrics, labels)
        baselines = {}
        for other in DYNAMIC_MODELS:
            f = RUNS / f"dynamic_{other}.json"
            if f.exists():
                baselines[other] = json.loads(f.read_text())
        report = {
            **summary,
            "labels": labels,
            "history": {k: [round(float(v), 4) for v in vals] for k, vals in history.items()},
            "metrics": metrics,
            "layers": layer_table(model),
            "embedding": embed_2d(model, x_test, y_test),
            "comparison": baselines,
            "dataset": "INCLUDE (AI4Bharat, CC BY 4.0), 70 ISL words, landmarks via MediaPipe HandLandmarker",
        }
        config = {"type": "dynamic", "frameSize": SEQ_FRAME_SIZE, "sequenceLength": SEQUENCE_LENGTH, "numHands": 2,
                  "inputShape": [SEQUENCE_LENGTH, SEQ_FRAME_SIZE], "temperature": temperature,
                  "background": BACKGROUND, "version": 2}
        export_tfjs(model, PUBLIC_MODEL / "dynamic", labels, config, report)
        write_parity(model, x_test, "dynamic")


if __name__ == "__main__":
    main()

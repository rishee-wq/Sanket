"""
Step 4c: class prototypes of the shipped models, for "Teach your own sign".

For every class of each shipped model (70 words + background; 35 letters and
digits + "no sign"), the mean L2-normalised embedding of its TRAINING samples.

The app accepts a taught sign only if the live movement is closer to the taught
sign's prototype than to every one of these. That "nearest class mean" rule is
what keeps rest poses and ordinary words from being read as a taught sign
(measured in eval_fewshot.py).

Output public/model/<name>/prototypes.json: { "size": D, "vectors": [[...], ...] }
in the same order as labels.json.

    python ml/export_prototypes.py
"""
from __future__ import annotations

import json

import numpy as np
import tf_keras as keras

from common import DATA, PUBLIC_MODEL, RUNS
from features import frame_features, sequence_features
from models import dynamic_tcn, static_cnn
from train_dynamic import Videos, build_set, stratified_split
from train_static import add_background, split_by_block


def l2(x):
    return x / np.maximum(np.linalg.norm(x, axis=-1, keepdims=True), 1e-9)


def class_means(encoder, x, y, classes):
    e = l2(encoder.predict(x, batch_size=512, verbose=0))
    return [l2(e[y == c].mean(0)).round(5).tolist() for c in range(classes)]


def write(name, vectors):
    path = PUBLIC_MODEL / name / "prototypes.json"
    path.write_text(json.dumps({"size": len(vectors[0]), "vectors": vectors}))
    print(f"{name}: {len(vectors)} prototypes x {len(vectors[0])} -> {path}")


def main():
    # Words: exact sign windows plus background windows from the training videos (same seed as training).
    d = np.load(DATA / "include_landmarks.npz")
    labels = json.loads((PUBLIC_MODEL / "dynamic" / "labels.json").read_text())
    videos = Videos(d)
    tr, _, _ = stratified_split(videos.y, 7)
    background = len(labels) - 1
    hands, present, y = build_set(videos, tr, background, np.random.default_rng(5), False, 1.0)
    model = dynamic_tcn(len(labels))
    model.load_weights(RUNS / "dynamic_tcn.weights.h5")
    encoder = keras.Model(model.input, model.get_layer("embedding").output)
    write("dynamic", class_means(encoder, sequence_features(hands, present), y, len(labels)))

    # Letters: the training images, including the "no sign" rest frames.
    s = np.load(DATA / "static_landmarks.npz")
    labels = json.loads((PUBLIC_MODEL / "static" / "labels.json").read_text())
    h, p, y, order, _ = add_background(s["hands"], s["present"], s["y"], s["order"], [str(x) for x in s["labels"]])
    tr, _, _ = split_by_block(y, order)
    model = static_cnn(len(labels))
    model.load_weights(RUNS / "static_cnn.weights.h5")
    encoder = keras.Model(model.input, model.get_layer("embedding").output)
    write("static", class_means(encoder, frame_features(h[tr], p[tr]), y[tr], len(labels)))


if __name__ == "__main__":
    main()

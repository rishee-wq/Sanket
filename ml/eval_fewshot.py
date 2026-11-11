"""
Experiment: can the network learn a NEW sign from 5 examples, without retraining?

This is what "Teach your own sign" does in the app. To measure it honestly the
network must never have seen the new signs, so:

  1. 15 of the 70 words are held out completely.
  2. The temporal CNN is trained on the other 55 words (+ background) only.
  3. Its 160-value "embedding" layer is used as a feature extractor.
  4. Prototypical network (Snell et al., 2017): for each new word, average the
     L2-normalised embeddings of 5 example videos -> one PROTOTYPE. A query is
     given the label of the most similar prototype (cosine similarity).
  5. Open set, as in the app: a user has taught 3 signs. New performances of
     them must be accepted; rest poses, the 55 known words and the untaught new
     words must be REJECTED. Two rules are compared: a similarity threshold
     alone, and "nearest class mean", where a taught sign must also be closer
     than the prototype of every built-in word and of "no sign".

Repeated over 300 random episodes (which 5 videos are the examples changes
each time). Writes public/model/dynamic/fewshot.json for the Model lab page.

    python ml/eval_fewshot.py
"""
from __future__ import annotations

import argparse
import json

import numpy as np
import tf_keras as keras

from common import DATA, PUBLIC_MODEL, RUNS, make_optimizer
from features import sequence_features
from models import dynamic_tcn
from train_dynamic import DynamicBatches, Videos, build_set, stratified_split


def l2(x):
    return x / np.maximum(np.linalg.norm(x, axis=-1, keepdims=True), 1e-9)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--held-out", type=int, default=15)
    parser.add_argument("--shots", type=int, default=5)
    parser.add_argument("--episodes", type=int, default=300)
    parser.add_argument("--taught", type=int, default=3, help="signs a user has taught, for the open-set test")
    parser.add_argument("--epochs", type=int, default=120)
    parser.add_argument("--seed", type=int, default=11)
    args = parser.parse_args()

    keras.utils.set_random_seed(args.seed)
    rng = np.random.default_rng(args.seed)
    data = np.load(DATA / "include_landmarks.npz")
    words = [str(s) for s in data["labels"]]
    novel = sorted(rng.choice(len(words), args.held_out, replace=False).tolist())
    base = [c for c in range(len(words)) if c not in novel]
    print("held-out words:", ", ".join(words[c] for c in novel))

    # Train on the base words only, with labels remapped to 0..54 (+ background = 55).
    videos = Videos(data)
    original_y = videos.y.copy()
    remap = {c: i for i, c in enumerate(base)}
    background = len(base)
    tr, va, te = stratified_split(original_y, args.seed)
    base_tr = np.array([v for v in tr if original_y[v] in remap])
    base_va = np.array([v for v in va if original_y[v] in remap])
    videos.y = np.array([remap.get(int(c), -1) for c in original_y])

    batches = DynamicBatches(videos, base_tr, len(base) + 1, background, 64, args.seed)
    hv, pv, yv = build_set(videos, base_va, background, np.random.default_rng(1), False, 0.5)
    x_val = sequence_features(hv, pv)
    model = dynamic_tcn(len(base) + 1)
    weights = RUNS / f"fewshot_base_{args.seed}.weights.h5"
    if weights.exists():
        model.load_weights(weights)  # reuse the trained network: only the analysis below changes between runs
    else:
        model.compile(optimizer=make_optimizer(len(batches), args.epochs, weight_decay=5e-4),
                      loss=keras.losses.CategoricalCrossentropy(label_smoothing=0.1), metrics=["accuracy"])
        model.fit(batches, validation_data=(x_val, np.eye(len(base) + 1)[yv]), epochs=args.epochs, verbose=2,
                  callbacks=[keras.callbacks.EarlyStopping(monitor="val_accuracy", patience=30, restore_best_weights=True)])
        RUNS.mkdir(exist_ok=True)
        model.save_weights(weights)
    base_acc = float((model.predict(x_val, verbose=0).argmax(1) == yv).mean())
    encoder = keras.Model(model.input, model.get_layer("embedding").output)

    def embed(ids, negatives, seed, labels):
        videos.y = labels
        h, p, y = build_set(videos, ids, -1, np.random.default_rng(seed), False, negatives)
        return l2(encoder.predict(sequence_features(h, p), batch_size=256, verbose=0)), y

    # Built-in class prototypes: the mean embedding of every known word, and of "no sign",
    # from the TRAINING videos. The app ships the same thing for its 70 words.
    remapped = np.array([remap.get(int(c), -1) for c in original_y])
    e_train, y_train = embed(base_tr, 1.0, 5, remapped)
    builtin = np.stack([l2(e_train[y_train == c].mean(0)) for c in range(len(base))] + [l2(e_train[y_train == -1].mean(0))])

    novel_ids = np.array([v for v in range(len(original_y)) if original_y[v] in novel])
    e_novel, y_novel = embed(novel_ids, 1.0, 3, original_y)
    is_bg = y_novel == -1
    e_bg = e_novel[is_bg]
    e_novel, y_novel = e_novel[~is_bg], y_novel[~is_bg]
    known_test = np.array([v for v in te if original_y[v] not in novel])
    e_known, _ = embed(known_test, 0.0, 4, original_y)

    # Closed set: 15 new words at once, pick the nearest prototype.
    closed = []
    for _ in range(args.episodes):
        protos, queries = [], []
        for c in novel:
            idx = rng.permutation(np.where(y_novel == c)[0])
            protos.append(l2(e_novel[idx[: args.shots]].mean(0)))
            queries += [(q, novel.index(c)) for q in idx[args.shots :]]
        q_idx = np.array([q for q, _ in queries])
        q_lab = np.array([lab for _, lab in queries])
        closed.append(float(((e_novel[q_idx] @ np.stack(protos).T).argmax(1) == q_lab).mean()))

    # Open set, as in the app: a user has taught K signs. Positives are new performances of those
    # signs. Negatives are rest poses, the 55 known words, and the new words they did NOT teach.
    grid = np.round(np.arange(0.5, 0.96, 0.01), 2)
    margins = (0.0, 0.03, 0.06, 0.1)
    rules = {"similarity_only": [], **{f"nearest_class_mean_{m:.2f}": [] for m in margins}}
    for _ in range(args.episodes):
        taught = rng.choice(novel, args.taught, replace=False)
        protos, pos, pos_lab = [], [], []
        for k, c in enumerate(taught):
            idx = rng.permutation(np.where(y_novel == c)[0])
            protos.append(l2(e_novel[idx[: args.shots]].mean(0)))
            pos += idx[args.shots :].tolist()
            pos_lab += [k] * (len(idx) - args.shots)
        protos = np.stack(protos)
        untaught = np.isin(y_novel, taught, invert=True)
        neg = np.concatenate([e_bg, e_known, e_novel[untaught]])
        pos_lab = np.array(pos_lab)
        for name in rules:
            def decide(e):
                sim = e @ protos.T
                best, top = sim.argmax(1), sim.max(1)
                if name.startswith("nearest_class_mean"):
                    # A taught sign must also come within `margin` of the closest built-in word or "no sign".
                    margin = float(name.rsplit("_", 1)[1])
                    beats = top > (e @ builtin.T).max(1) - margin
                    top = np.where(beats, top, -1.0)
                return best, top
            pb, pt = decide(e_novel[pos])
            nb, nt = decide(neg)
            rules[name].append([(float(((pb == pos_lab) & (pt >= t)).mean()), float((nt >= t).mean())) for t in grid])

    curves = {}
    for name, runs in rules.items():
        arr = np.array(runs).mean(0)
        curves[name] = [{"threshold": float(t), "accept": float(a), "false_accept": float(f)} for t, (a, f) in zip(grid, arr)]
    def best_point(curve, max_false=0.05):
        ok = [c for c in curve if c["false_accept"] <= max_false]
        return max(ok, key=lambda c: c["accept"]) if ok else None

    result = {
        "held_out": [words[c] for c in novel],
        "shots": args.shots,
        "episodes": args.episodes,
        "ways": len(novel),
        "taught": args.taught,
        "base_val_accuracy": base_acc,
        "closed_set_accuracy": float(np.mean(closed)),
        "closed_set_std": float(np.std(closed)),
        "chance": 1 / len(novel),
        "operating_points": {name: best_point(curve) for name, curve in curves.items()},
        "curves": curves,
    }
    (PUBLIC_MODEL / "dynamic" / "fewshot.json").write_text(json.dumps(result, indent=1))
    print(json.dumps({k: v for k, v in result.items() if k != "curves"}, indent=1))
    for name, curve in curves.items():
        print(name, " ".join(f"{c['threshold']:.2f}:{c['accept']:.2f}/{c['false_accept']:.2f}" for c in curve[::5]))


if __name__ == "__main__":
    main()

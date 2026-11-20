"""
Scores single models and ensembles of them on the held-out-signer split.

    python ml/ensemble.py                # uses runs/dynamic_*_session_preds.npz
    python ml/ensemble.py --split all    # the shipped models' own validation sets

An ensemble averages the members' calibrated probabilities (soft voting):

    p(c | x) = (1 / M) * sum_m softmax(log p_m(c | x) / T_m)

Different architectures make different mistakes (a Transformer compares far
apart frames directly, a TCN looks at local motion, an LSTM reads in order), so
averaging cancels some of each one's errors. This is the same idea as bagging
and as the multi-model entries that win most recognition benchmarks.

To keep the test set honest, the combination is CHOSEN on the validation
windows and only then scored on the test windows. Picking the best of 26
combinations on the test set itself would overstate the result.
"""
from __future__ import annotations

import argparse
import itertools
import json

import numpy as np

from common import RUNS, apply_temperature


def scores(probs: np.ndarray, y: np.ndarray, background: int) -> dict:
    words = y != background
    top3 = np.argsort(-probs, axis=1)[:, :3]
    return {
        "accuracy": float((probs.argmax(1) == y).mean()),
        "word_accuracy": float((probs[words].argmax(1) == y[words]).mean()),
        "top3_words": float(np.mean([y[i] in top3[i] for i in np.where(words)[0]])),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--split", default="session", choices=["session", "all"])
    parser.add_argument("--only", nargs="*", help="restrict to these runs, e.g. tcn gru tcn_strong")
    args = parser.parse_args()
    suffix = f"_{args.split}"

    members = {}
    # Every saved run on this split: dynamic_<model>_<split>[_<recipe>]_preds.npz
    for f in sorted(RUNS.glob(f"dynamic_*{suffix}*_preds.npz")):
        name = f.name[len("dynamic_"):-len("_preds.npz")].replace(suffix, "")
        if args.only and name not in args.only:
            continue
        d = np.load(f)
        t = float(d["temperature"])
        members[name] = {"val": apply_temperature(d["val"], t), "test": apply_temperature(d["test"], t),
                         "y_val": d["y_val"], "y_test": d["y_test"]}
    if not members:
        raise SystemExit("No prediction files found. Run train_dynamic.py with --split session first.")
    first = next(iter(members.values()))
    y_val, y_test = first["y_val"], first["y_test"]
    for name, m in members.items():
        assert np.array_equal(m["y_val"], y_val) and np.array_equal(m["y_test"], y_test), f"{name} saw different windows"
    background = int(max(y_val.max(), y_test.max()))

    rows = []
    for r in range(1, len(members) + 1):
        for combo in itertools.combinations(members, r):
            val = np.mean([members[n]["val"] for n in combo], axis=0)
            test = np.mean([members[n]["test"] for n in combo], axis=0)
            rows.append({"models": list(combo), "val": scores(val, y_val, background), "test": scores(test, y_test, background)})

    rows.sort(key=lambda r: (-r["val"]["word_accuracy"], len(r["models"])))
    best = rows[0]
    print(f"{len(members)} models, {len(rows)} combinations, chosen on validation word accuracy\n")
    print(f"{'models':<40} {'val words':>9} {'test words':>10} {'test top-3':>10} {'test all':>9}")
    singles = sorted((r for r in rows if len(r["models"]) == 1), key=lambda r: -r["test"]["word_accuracy"])
    for r in singles + rows[:8]:
        name = " + ".join(r["models"])
        print(f"{name:<40} {r['val']['word_accuracy']:>9.3f} {r['test']['word_accuracy']:>10.3f} "
              f"{r['test']['top3_words']:>10.3f} {r['test']['accuracy']:>9.3f}")
    print(f"\nChosen: {' + '.join(best['models'])}: test word accuracy {best['test']['word_accuracy']:.3f}, "
          f"top-3 {best['test']['top3_words']:.3f}")
    (RUNS / f"ensemble{suffix}.json").write_text(json.dumps({"chosen": best, "singles": singles, "all": rows}, indent=2))


if __name__ == "__main__":
    main()

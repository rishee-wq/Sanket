"""
Shared training utilities: optimiser, calibration, metrics, plots and the
TensorFlow.js export.
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import tf_keras as keras

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parent
DATA = ROOT / "data"
RUNS = ROOT / "runs"
PUBLIC_MODEL = REPO / "public" / "model"
RESULTS = REPO / "docs" / "results"


# ---------------------------------------------------------------------------
# Optimiser
# ---------------------------------------------------------------------------


def make_optimizer(steps_per_epoch: int, epochs: int, peak_lr: float = 2e-3, weight_decay: float = 1e-4):
    """
    AdamW with a warm-up then cosine decay.

    - Warm-up (first 5% of steps): the learning rate climbs from 0 so the first
      noisy gradients cannot throw the freshly initialised weights far away.
    - Cosine decay: the rate then falls smoothly to ~0, taking big steps early
      and tiny, careful steps at the end.
    - AdamW applies weight decay directly to the weights instead of mixing it
      into the gradient, which regularises better than L2 with Adam. Batch-norm
      and bias terms are excluded, as is standard.
    """
    total = steps_per_epoch * epochs
    warmup = max(1, int(0.05 * total))
    schedule = keras.optimizers.schedules.CosineDecay(
        initial_learning_rate=0.0,
        decay_steps=max(1, total - warmup),
        warmup_target=peak_lr,
        warmup_steps=warmup,
        alpha=0.01,
    )
    opt = keras.optimizers.AdamW(learning_rate=schedule, weight_decay=weight_decay, clipnorm=1.0)
    opt.exclude_from_weight_decay(var_names=["bn", "bias", "gamma", "beta"])
    return opt


# ---------------------------------------------------------------------------
# Calibration
# ---------------------------------------------------------------------------


def apply_temperature(probs: np.ndarray, temperature: float) -> np.ndarray:
    """softmax(log(p) / T). Identical to dividing the logits by T before the softmax."""
    logp = np.log(np.clip(probs, 1e-12, 1.0)) / temperature
    logp -= logp.max(axis=1, keepdims=True)
    p = np.exp(logp)
    return p / p.sum(axis=1, keepdims=True)


def nll(probs: np.ndarray, y: np.ndarray) -> float:
    return float(-np.log(np.clip(probs[np.arange(len(y)), y], 1e-12, 1.0)).mean())


def fit_temperature(probs: np.ndarray, y: np.ndarray) -> float:
    """
    Temperature scaling (Guo et al., 2017). A network's softmax is usually too
    confident. One scalar T, chosen to minimise the negative log-likelihood on
    the validation set, stretches or squeezes every distribution without
    changing which class wins. The app's "accept above X%" threshold only means
    something if 90% confidence is right about 90% of the time.
    """
    grid = np.exp(np.linspace(np.log(0.3), np.log(5.0), 200))
    return float(grid[int(np.argmin([nll(apply_temperature(probs, t), y) for t in grid]))])


def expected_calibration_error(probs: np.ndarray, y: np.ndarray, bins: int = 10) -> float:
    """Average gap between confidence and accuracy, weighted by how many samples fall in each confidence bin."""
    conf, pred = probs.max(axis=1), probs.argmax(axis=1)
    edges = np.linspace(0, 1, bins + 1)
    ece = 0.0
    for lo, hi in zip(edges[:-1], edges[1:]):
        mask = (conf > lo) & (conf <= hi)
        if mask.any():
            ece += mask.mean() * abs((pred[mask] == y[mask]).mean() - conf[mask].mean())
    return float(ece)


# ---------------------------------------------------------------------------
# Metrics
# ---------------------------------------------------------------------------


def classification_metrics(probs: np.ndarray, y: np.ndarray, labels: list[str]) -> dict:
    from sklearn.metrics import confusion_matrix, precision_recall_fscore_support

    pred = probs.argmax(axis=1)
    top3 = np.argsort(-probs, axis=1)[:, :3]
    ids = np.arange(len(labels))
    precision, recall, f1, support = precision_recall_fscore_support(y, pred, labels=ids, zero_division=0)
    return {
        "samples": int(len(y)),
        "accuracy": float((pred == y).mean()),
        "top3_accuracy": float((top3 == y[:, None]).any(axis=1).mean()),
        "macro_f1": float(f1[support > 0].mean()),
        "ece": expected_calibration_error(probs, y),
        "per_class": [
            {"label": labels[i], "precision": float(precision[i]), "recall": float(recall[i]),
             "f1": float(f1[i]), "support": int(support[i])}
            for i in ids
        ],
        "confusion": confusion_matrix(y, pred, labels=ids).tolist(),
    }


def layer_table(model: keras.Model) -> list[dict]:
    rows = []
    for layer in model.layers:
        try:
            shape = list(layer.output_shape[1:]) if not isinstance(layer.output_shape, list) else list(layer.output_shape[0][1:])
        except AttributeError:
            shape = []
        rows.append({"name": layer.name, "type": layer.__class__.__name__, "shape": shape, "params": int(layer.count_params())})
    return rows


def embed_2d(model: keras.Model, x: np.ndarray, y: np.ndarray, limit: int = 700, seed: int = 0):
    """t-SNE of the 'embedding' layer: a 2-D picture of what the network has learned to separate."""
    from sklearn.manifold import TSNE

    rng = np.random.default_rng(seed)
    idx = rng.permutation(len(x))[:limit]
    feat = keras.Model(model.input, model.get_layer("embedding").output).predict(x[idx], verbose=0)
    pts = TSNE(n_components=2, init="pca", perplexity=min(30, max(5, len(idx) // 20)), random_state=seed).fit_transform(feat)
    pts = (pts - pts.min(0)) / np.maximum(pts.max(0) - pts.min(0), 1e-9)
    return [[round(float(px), 4), round(float(py), 4), int(c)] for (px, py), c in zip(pts, y[idx])]


# ---------------------------------------------------------------------------
# Plots (for the report)
# ---------------------------------------------------------------------------


def save_plots(name: str, history: dict, metrics: dict, labels: list[str]):
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    RESULTS.mkdir(parents=True, exist_ok=True)
    fig, axes = plt.subplots(1, 2, figsize=(11, 4))
    axes[0].plot(history["loss"], label="train")
    axes[0].plot(history["val_loss"], label="validation")
    axes[0].set(title=f"{name}: loss", xlabel="epoch")
    axes[0].legend()
    axes[1].plot(history["accuracy"], label="train (augmented)")
    axes[1].plot(history["val_accuracy"], label="validation")
    axes[1].set(title=f"{name}: accuracy", xlabel="epoch")
    axes[1].legend()
    fig.tight_layout()
    fig.savefig(RESULTS / f"{name}_curves.png", dpi=130)
    plt.close(fig)

    cm = np.array(metrics["confusion"], dtype=float)
    cm = cm / np.maximum(cm.sum(axis=1, keepdims=True), 1)
    size = max(7, len(labels) * 0.22)
    fig, ax = plt.subplots(figsize=(size, size))
    ax.imshow(cm, cmap="Blues", vmin=0, vmax=1)
    ax.set_xticks(range(len(labels)), labels, rotation=90, fontsize=7)
    ax.set_yticks(range(len(labels)), labels, fontsize=7)
    ax.set(xlabel="predicted", ylabel="true", title=f"{name}: confusion matrix (row-normalised), test set")
    fig.tight_layout()
    fig.savefig(RESULTS / f"{name}_confusion.png", dpi=130)
    plt.close(fig)


# ---------------------------------------------------------------------------
# TensorFlow.js export
# ---------------------------------------------------------------------------


def write_parity(model: keras.Model, x: np.ndarray, name: str, count: int = 24):
    """Saves a few inputs with Keras' outputs, so ml/check_tfjs.mjs can compare TF.js against them."""
    RUNS.mkdir(exist_ok=True)
    x = x[:: max(1, len(x) // count)][:count]
    y = model.predict(x, verbose=0)
    (RUNS / f"{name}_parity.json").write_text(
        json.dumps({"shape": list(x.shape[1:]), "inputs": x.tolist(), "outputs": y.tolist()})
    )


def export_tfjs(model: keras.Model, out_dir: Path, labels: list[str], config: dict, report: dict):
    """
    Writes a TF.js "layers model" by hand:

      model.json   the Keras architecture (JSON) + a manifest that names every
                   weight tensor, its shape and dtype, in order
      weights.bin  all weights as raw little-endian float32, concatenated in
                   manifest order
      labels.json, config.json, report.json

    (The official tensorflowjs converter cannot be imported on Windows because
    it depends on tensorflow_decision_forests, which has no Windows build. The
    format is simple enough to write directly, and ml/check_tfjs.mjs proves the
    browser library computes the same outputs as Keras.)
    """
    out_dir.mkdir(parents=True, exist_ok=True)
    specs, blobs = [], []
    for w in model.weights:
        arr = w.numpy().astype("<f4")
        specs.append({"name": w.name.split(":")[0], "shape": list(arr.shape), "dtype": "float32"})
        blobs.append(arr.tobytes())
    (out_dir / "weights.bin").write_bytes(b"".join(blobs))
    (out_dir / "model.json").write_text(
        json.dumps(
            {
                "format": "layers-model",
                "generatedBy": f"keras v{keras.__version__}",
                "convertedBy": "sanket ml/common.py",
                "modelTopology": json.loads(model.to_json()),
                "weightsManifest": [{"paths": ["weights.bin"], "weights": specs}],
            }
        )
    )
    (out_dir / "labels.json").write_text(json.dumps(labels, ensure_ascii=False))
    (out_dir / "config.json").write_text(json.dumps(config, indent=2))
    (out_dir / "report.json").write_text(json.dumps(report))
    size = sum(f.stat().st_size for f in out_dir.iterdir())
    print(f"Exported {model.name} to {out_dir} ({size / 1024:.0f} KB, {model.count_params():,} parameters)")

# Landmark preprocessing and model contract

This is the single spec for turning MediaPipe hand landmarks into model input.
Two implementations must follow it exactly:

- Browser: [`src/lib/preprocess.ts`](../src/lib/preprocess.ts)
- Training: `ml/preprocess.py`

If you change anything here, change both implementations in the same commit.

## 1. Input

MediaPipe HandLandmarker (`numHands: 2`) returns, per detected hand:

- 21 landmarks with `x`, `y` in [0, 1] (normalized to image width/height) and `z` (depth relative to the wrist, roughly the same scale as `x`)
- a handedness label, `"Left"` or `"Right"`, with a score

Always run detection on the **unmirrored** camera frame. The browser mirrors the video only with CSS; the frame passed to MediaPipe is not mirrored. In Python, do not `cv2.flip` the frame before detection.

## 2. Per-hand normalization

For one hand with landmarks `p[0..20]` (`p[0]` is the wrist):

1. Translate: `q[i] = p[i] - p[0]` for x, y and z.
2. Scale: `s = max_i ||q[i]||` (3D Euclidean). If `s > 1e-6`, divide every `q[i]` by `s`; otherwise leave it.
3. Flatten to 63 values: `[x0, y0, z0, x1, y1, z1, ..., x20, y20, z20]`.

The wrist is always `(0, 0, 0)` and every other point lies inside the unit sphere.

## 3. Hand slots

A model is trained for a fixed `numHands` (1 or 2).

- `numHands = 1`: the hand with the highest handedness score goes in slot 0.
- `numHands = 2`:
  - If both hands have labels and the labels differ, the `"Right"` hand goes in slot 0 and the `"Left"` hand in slot 1.
  - Otherwise (labels missing, or both the same), the hand whose wrist has the larger `x` goes in slot 0.
  - With only one hand detected, it goes in slot 0 if it is `"Right"` or unlabeled, and in slot 1 if it is `"Left"`.
- An empty slot is 63 zeros.

The labels are MediaPipe's, used as-is. They describe hands in a mirrored (selfie) image, so on an unmirrored frame MediaPipe's `"Right"` is the signer's left hand. That is fine as long as both sides use the same rule.

## 4. Frame features

Concatenate the slots in order: `numHands × 63` values (126 for two hands), `float32`.

## 5. Sequences (dynamic signs)

A dynamic sample is the last `sequenceLength` frames (default 30), oldest first, shaped `[sequenceLength, numHands × 63]`.

- In the browser, a sliding window is updated every frame and the model runs once the window is full.
- After 10 consecutive frames with no hands, the window is cleared.

## 6. Model files

The app loads these from `public/model/`:

| File | Contents |
| --- | --- |
| `model.json` + weight shards | A TF.js **layers** model from `tensorflowjs_converter` |
| `labels.json` | JSON array of label strings, in output-index order |
| `config.json` | `{ "type": "static" \| "dynamic", "sequenceLength": 30, "numHands": 2 }` |

The model's input can have any shape whose size matches the spec: for example `[126]` (MLP), `[42, 3]` (Conv1D over landmarks, i.e. `numHands × 21` steps with 3 channels), or `[30, 126]` (sequence model). The browser reshapes the flat features to that shape, so the training code must flatten in the same row-major order. The last layer must be a softmax with one unit per label.

If any file is missing or the shapes don't match, the app logs the reason and uses the rule-based mock predictor instead.

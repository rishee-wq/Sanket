# Landmark features and model contract

This is the single spec for turning MediaPipe hand landmarks into model input.
Two implementations follow it exactly:

- Browser: [`src/engine/features.ts`](../src/engine/features.ts)
- Training: [`ml/features.py`](../ml/features.py) and [`ml/landmarks.py`](../ml/landmarks.py)

`python ml/check_parity.py` runs both on the same random hands and fails if they differ by more than 1e-5.
If you change anything here, change both implementations in the same commit and rerun it.

## 1. Input

MediaPipe HandLandmarker (`numHands: 2`, the same `hand_landmarker.task` file on both sides) returns, per detected hand:

- 21 landmarks with `x`, `y` in [0, 1] (divided by image width and height) and `z` (depth relative to the wrist, on the `x` scale)
- a handedness label, `"Left"` or `"Right"`, with a score

Always detect on the **unmirrored** frame. The browser mirrors the video only with CSS. In Python, never `cv2.flip` before detection.

**Aspect correction.** Because `x` is divided by the width and `y` by the height, the same hand looks squashed differently in a 16:9 and a 4:3 frame. Multiply `x` and `z` by `aspect = width / height` before anything else. After this, one unit means the same distance on both axes.

## 2. Hand slots

Every frame has two slots.

- Both hands have labels and the labels differ: the `"Right"` hand goes in slot 0, the `"Left"` hand in slot 1.
- Otherwise (a label is missing, or both are the same): the hand whose wrist has the larger `x` goes in slot 0.
- One hand: slot 1 if it is `"Left"`, otherwise slot 0.
- More than two hands: the two with the highest handedness score.
- An empty slot is all zeros, with its presence flag 0.

The labels are MediaPipe's, used as-is. They assume a mirrored (selfie) image, so on an unmirrored frame MediaPipe's `"Right"` is the signer's left hand. That does not matter as long as both sides use the same rule, and mirror augmentation in training covers left-handed signers.

## 3. Hand shape (63 values per slot)

For a present hand with points `p[0..20]` (`p[0]` is the wrist):

1. `q[i] = p[i] - p[0]`
2. `s = max_i ||q[i]||` (3-D). If `s > 1e-6`, divide every `q[i]` by `s`.
3. Flatten: `[x0, y0, z0, x1, y1, z1, ..., x20, y20, z20]`.

The wrist is `(0, 0, 0)` and every point lies in the unit sphere, so the shape does not depend on where the hand is or how far it is from the camera. `s` is the "hand size" used below.

## 4. Frame features (132 values)

| Range | Contents |
| --- | --- |
| `[0:63]` | slot 0 shape |
| `[63:66]` | relation: `(wrist1 - wrist0) / mean(s0, s1)` for x and y, then `log(s1 / s0)`. All zero unless both hands are present. |
| `[66:129]` | slot 1 shape |
| `[129:132]` | flags: slot 0 present, slot 1 present, both present |

The relation values keep how the two hands sit relative to each other, which most two-handed ISL letters depend on and which per-hand normalisation would otherwise throw away.

The layout reshapes to `[2, 22, 3]`: one row per hand, 21 landmarks plus one extra token, 3 channels. The letters CNN uses exactly that reshape.

## 5. Sequences (words)

A word sample is a window of frames resampled to `sequenceLength = 32`:

- **Resampling**: nearest neighbour. Output frame `i` takes input frame `floor(i * (n - 1) / 31 + 0.5)`.
- **Per frame**: the 132 frame features, plus a 4-value trajectory: each slot's wrist `(x, y)` minus the window's mean wrist position, divided by the window's mean hand size. Means are taken over every present hand in every frame of the window. Absent hands contribute zeros.

So one frame is 136 values and one window is `[32, 136]`. The trajectory keeps how the hands move while removing where the signer stands and how far away they are.

## 6. Model files

The app loads two models from `public/model/static/` and `public/model/dynamic/`:

| File | Contents |
| --- | --- |
| `model.json` + `weights.bin` | A TF.js layers model (written by `ml/common.py`) |
| `labels.json` | Label strings in output-index order |
| `config.json` | `type` (`static` / `dynamic`), `inputShape`, `frameSize`, `sequenceLength`, `temperature`, `background` |
| `report.json` | Metrics, training curves, confusion matrix, layer table: what the Model lab page shows |

- `temperature` is the calibration temperature fitted on the validation set. The app applies `softmax(log(p) / T)` to every output.
- `background` names the "no sign here" class. Both models have one: `_background` for words, `_none` for letters.
- The last layer is a softmax with one unit per label.

`public/model/exemplars.json` + `exemplars.bin` hold one test-set recording per sign (int16, ×10000, 126 values per frame) for the Learn page and the demo stream.

If a model's files are missing or its shapes do not match its config, the app says so and runs with whichever model did load.

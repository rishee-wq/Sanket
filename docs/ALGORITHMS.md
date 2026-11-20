# How Sanket works: every algorithm, and where it lives

This document explains each deep learning idea and each data structure in the project: what it is, why it is here, and the file that implements it. The same material is shown live in the app under **Model lab**.

Contents:

1. [The pipeline in one picture](#1-the-pipeline-in-one-picture)
2. [Datasets](#2-datasets)
3. [Deep learning concepts](#3-deep-learning-concepts)
4. [Results](#4-results)
5. [Data structures and algorithms](#5-data-structures-and-algorithms)
6. [Why it is fast](#6-why-it-is-fast)
7. [How the claims are checked](#7-how-the-claims-are-checked)
8. [Limits](#8-limits)

---

## 1. The pipeline in one picture

```
camera frame
   │  requestVideoFrameCallback: once per NEW frame
   ▼
palm detector ──► hand landmark CNN          (pretrained, MediaPipe)        21 points × 2 hands
   ▼
slots + aspect correction + normalisation    src/engine/features.ts          132 numbers per frame
   ▼
ring buffer of the last 256 frames           src/engine/ringBuffer.ts
   ├──► letters CNN on every frame ──► EMA + hold gate ──────────┐
   │        (2-D CNN, 36 classes)       src/engine/spotter.ts     │
   └──► multi-scale windows ──► words TCN ──► peak NMS ───────────┤  tokens
            (32 × 136, 71 classes)      src/engine/spotter.ts     ▼
                                              sentence ──► trie / edit distance / bigram suggestions ──► speech
                                                          src/engine/language.ts
```

Three neural networks run on every frame. Two are pretrained (finding the hand and its 21 landmarks). The third stage is ours: two classifiers trained in `ml/`, one for still hand shapes (letters and digits) and one for movements (words).

**Why landmarks and not pixels?** A classifier trained on pixels has to learn skin tone, lighting, sleeves and backgrounds, and needs far more data than exists for ISL. Landmarks remove all of that before our model sees anything. Our models are then tiny (under 0.5 M parameters), train on a laptop CPU in minutes, and run in a browser.

---

## 2. Datasets

| | Letters and digits | Words |
| --- | --- | --- |
| Source | ISL image set, 35 classes (1-9, A-Z), 42,745 images | **INCLUDE** (AI4Bharat, IIT Madras), CC BY 4.0 |
| Used | 41,672 images where a hand was found | 70 words, 1,306 videos, 80,770 frames |
| Why this one | Real two-handed ISL fingerspelling | The largest public word-level ISL dataset, recorded with experienced signers |
| Split | By capture order: 70 / 15 / 15 | By video, per word: 928 / 189 / 189 |

Two engineering details are worth knowing:

- **INCLUDE is 56.8 GB in 44 zip files.** A zip stores its table of contents at the end of the file, so `ml/include_remote.py` reads only the last few MB of each zip with an HTTP Range request, learns the byte offset of every video, and then downloads only the 1,306 videos of our 70 words (16.9 GB instead of 56.8).
- **Leak-free splits.** The letter images are consecutive camera frames, so neighbours are nearly identical. A random split would put almost the same picture in train and test. `split_by_block` cuts each class in capture order instead. For words, a whole video is in exactly one split.

The 70 words were chosen for the app's settings (clinic, counter, emergency, home): greetings, pronouns, family, health, common adjectives, time and places. The list is `ml/vocab_words.txt`.

---

## 3. Deep learning concepts

Each heading says where the idea is used. Model code is in `ml/models.py`, training in `ml/train_static.py` and `ml/train_dynamic.py`, shared pieces in `ml/common.py`.

### 3.1 Convolution and weight sharing: the letters CNN

A frame is 132 numbers. We reshape it to a tiny image, **2 rows × 22 columns × 3 channels**: one row per hand, one column per landmark, channels = (x, y, z).

- A kernel of shape **(1, 3)** slides *along a hand*. Landmarks are ordered wrist, thumb, index, ..., pinky, so three neighbouring columns are three joints of one finger. The filter learns local patterns such as "this finger is bent".
- The same kernel is applied to both rows, so **both hands share weights**. Whatever the network learns about a finger on one hand, it knows for the other. A fully connected layer would have to learn it twice.
- A final **(2, 3)** kernel looks at both rows at once and fuses the hands.

This is the core CNN idea: *the same small set of weights is reused at every position*, which means fewer parameters and built-in knowledge that a pattern means the same thing wherever it occurs.

### 3.2 Temporal convolution with dilation: the words TCN

A word is a window of 32 frames × 136 features. Here `Conv1D` kernels slide along **time**.

With kernel size 3, one layer sees 3 frames. To see the whole window we use **dilation**: the kernel skips frames, with the gap doubling in each block (1, 2, 4, 8). The receptive field grows exponentially, 3 → 7 → 15 → 31 → 63 frames after four blocks, so the last block sees the entire sign, with far fewer weights than a wide kernel.

Compared with an LSTM, every time step is computed in parallel rather than one after another, which is why the TCN is the fastest of the sequence models we compared (section 4).

### 3.3 Residual connections

Every block computes `output = input + F(input)`. The skip connection gives gradients a direct path backwards, so stacking blocks does not make training harder. When the shape changes, a 1×1 convolution on the shortcut matches it.

### 3.4 Batch normalisation

After each convolution the activations are rescaled to zero mean and unit variance per channel (using batch statistics in training, running averages at inference). This keeps the scale of every layer's input stable, allows a higher learning rate, and regularises slightly.

### 3.5 Attention, twice

- **Channel attention (squeeze-and-excitation)** in every residual block: average each channel over the whole input, pass that summary through a small bottleneck MLP, and get one weight in 0..1 per channel. The network decides, per input, which feature maps matter.
- **Temporal attention pooling** at the end of the TCN: a `Dense(1)` scores every time step, a softmax over time turns scores into weights, and the output is the weighted average. Unlike plain average pooling, the model can focus on the frames that identify the sign and ignore the transition in and out of it.

### 3.6 A background class and IoU labelling (the R-CNN idea, in time)

R-CNN-style detectors work in three steps: propose regions, classify each region (including a "background" class), then remove duplicate detections. An R-CNN on pixels would be far too slow per frame, and finding the hand is already done by MediaPipe's single-shot detector. But **finding a sign in a continuous stream is the same problem in one dimension**, and we use the same recipe:

- **Training** (`sample_window` in `ml/augment.py`): each video has an *active segment* (where the sign is, found from wrist height in `active_segment`). A window that overlaps it with temporal **IoU ≥ 0.6** is a positive, labelled with the word. A window with **IoU ≤ 0.3** (rest pose, or only a fragment of the sign) is labelled `_background`. In between is ignored.
- **Inference** (section 5.6): windows of several lengths are proposed, the TCN classifies each, and non-maximum suppression keeps one.

The letters model has a background class too (`_none`), trained on rest-pose frames from the word videos. Without it, a network trained only on letter images must call *every* hand some letter, including a hand hanging at rest.

### 3.7 Transfer learning

The palm detector and the landmark network are pretrained by Google on tens of thousands of hand images. We reuse them unchanged as a feature extractor and train only the small classifier on top. That is transfer learning: our 1,306 videos could never train a hand detector, but they are enough for a classifier on good features.

### 3.8 Data augmentation

All augmentation is applied to the **raw landmarks**, and then the normal feature code runs. So an augmented sample is always something the live pipeline could really produce (`ml/augment.py`).

| Augmentation | Imitates |
| --- | --- |
| Mirror (negate x, swap slots) | A left-handed signer |
| In-plane rotation | Camera roll, arm angle |
| 3-D tilt of each hand about its wrist | A different viewing angle |
| Per-hand scale and shift | Different hand distances and positions |
| Gaussian jitter per landmark | Landmark detector noise |
| Random window boundaries (words) | Starting or stopping the window early or late |
| Time warping (words) | Signing faster or slower part-way |
| Dropping a hand for a frame (words) | A detection miss from motion blur |
| Movement amplitude, ±30% (words) | Another person making the same sign with bigger or smaller motions: the wrist path is scaled about its mean while the hands keep their size |
| Mixup (optional, `--mixup`) | Blends two samples and their labels; smooths decision boundaries |

Windows are re-cut and re-augmented **every epoch**, so the network never sees the same sample twice.

The words model is trained with the **signer-style** settings (`--aug strong`, the default): rotation up to ±20°, hand tilt ±18°, scale ±18%, shift ±12% of hand size, jitter 1.8% of hand size, 5% dropped hands, and the amplitude change. Measured on unseen signers (section 4), this raised the TCN from 62.2% to 64.7% on the test sessions and from 66.3% to 71.4% on the validation sessions. The original settings are `--aug standard`.

### 3.9 Regularisation and optimisation

- **Dropout** before the dense layers, **SpatialDropout1D** in the TCN (drops whole channels, which suits correlated time steps).
- **Label smoothing (0.1)**: the target is 0.9 for the true class instead of 1.0, which stops the network pushing its logits to infinity.
- **AdamW**: Adam with weight decay applied directly to the weights rather than mixed into the gradient. Batch-norm and bias terms are excluded.
- **Warm-up + cosine decay**: the learning rate climbs from 0 for the first 5% of steps, then falls smoothly to near 0.
- **Gradient clipping** (norm 1.0), **early stopping** on validation accuracy, and **checkpointing** of the best epoch.

### 3.10 Calibration (temperature scaling)

A softmax output of 0.9 should be right about 90% of the time. Raw networks rarely are, and here label smoothing makes ours *under*-confident. We fit one scalar T on the validation set to minimise the negative log-likelihood, and the app applies `softmax(log(p) / T)`. T does not change which class wins, only how sure the model claims to be. Because the app accepts a sign only above a confidence threshold, that threshold only means something after calibration. Expected calibration error before and after is in section 4.

### 3.11 Few-shot learning: teach your own sign

The **My signs** page lets a user add a sign the models were never trained on (a name sign, a local variant) from 3 to 5 recordings, with no retraining. It is a **prototypical network** (Snell et al., 2017) on top of the trained models (`src/engine/fewshot.ts`):

1. **Embedding.** Each recording goes through the trained network but stops one layer early, at the 160-value `embedding` layer of the words TCN (or the 128-value one of the letters CNN for a held hand shape). This is transfer learning: the network learned, from 70 words, a space where different movements land far apart, and that space is reused for movements it has never seen. One forward pass returns both the prediction and the embedding (`SignModel.predictWithEmbedding`).
2. **Prototype.** The examples are L2-normalised and averaged. That point is the sign's prototype.
3. **Matching.** Every live window is embedded the same way and compared with each prototype by **cosine similarity** (the dot product of two unit vectors). The nearest prototype wins, if it clears that sign's threshold.
4. **Open-set rejection (nearest class mean).** Most movements a user makes are *not* their taught sign, so rejecting is as important as matching. The app ships the mean embedding of every built-in class (`public/model/*/prototypes.json`, from the training data, written by `ml/export_prototypes.py`). A taught sign counts only if its similarity is at least **0.80** and it is no more than **0.10** below the closest built-in class, whether one of the 70 words or "no sign". Both numbers come from the experiment below.
5. **Merging with the models.** A matched movement becomes an extra detection for the word spotter; a matched hand shape becomes an extra class for the letter gate. A taught sign wins close calls, because the user taught it on purpose.

Recordings are stored as raw landmarks (int16, base64) in `localStorage`, so the embeddings can be recomputed if a model is retrained, and nothing leaves the device.

**Experiment** (`ml/eval_fewshot.py`). The honest test is on signs the network has never seen, so 15 of the 70 words (attack, bank, brother, car, he, hospital, house, it, key, loud, night, old, student, today, young) were held out completely and the TCN was retrained on the other 55. Each result is averaged over 300 random choices of which 5 videos are the examples.

- **Which new sign is it?** With all 15 new words taught at once, the nearest prototype is right **75.9%** of the time (±2.8%), against 6.7% for guessing.
- **Is it a taught sign at all?** A user has taught 3 signs. New performances of them must be accepted; rest poses, the 55 known words and the 12 untaught new words must be rejected.

| Rejection rule | Real performances accepted | Other movements wrongly accepted |
| --- | --- | --- |
| Per-sign threshold from the examples' own consistency (first version) | 73% | **67%** |
| Similarity threshold alone, best setting (0.84) | 64% | 4% |
| Must beat every built-in class outright | 45% | 1% |
| **Similarity ≥ 0.80 and within 0.10 of the closest built-in class (ships)** | **68%** | **4%** |

The first version looked fine in a quick test and failed this one: almost any movement was "close enough" to some taught sign. Comparing against the built-in classes fixed it. About two in three performances are recognised; a missed sign costs a repeat, while a false one would put a wrong word in someone's mouth, so the rule leans towards rejecting.

The hand-shape variant (built on the letters CNN) uses the same rule but has not been measured separately.

### 3.12 Architectures compared, and what we do not ship

Five sequence models were trained on exactly the same held-out-signer split (section 4) and scored with `ml/ensemble.py`:

| Model | Idea | Validation (unseen signers) | Test (unseen signers) | Test top-3 |
| --- | --- | --- | --- | --- |
| **TCN, signer-style augmentation (ships)** | dilated 1-D convolutions + attention pooling | **71.4%** | **64.7%** | 80.7% |
| GRU, signer-style augmentation | gated recurrent unit | 65.9% | 63.6% | 81.5% |
| TCN | | 66.3% | 62.2% | 80.0% |
| GRU | | 64.3% | 65.5% | 81.5% |
| BiLSTM | LSTM reading the window forwards and backwards | 66.7% | 60.0% | 81.1% |
| Inception-TCN (`dynamic_inception`) | GoogLeNet's Inception module along time: parallel 1-, 3- and 5-wide convolutions and a pooled branch, concatenated, with growing dilation and a residual shortcut | 65.9% | 60.0% | 82.5% |
| Transformer (`dynamic_transformer`) | 3 pre-norm encoder blocks, 4-head self-attention built from Dense/Dot/Softmax layers (TF.js has no attention layer), convolutional positional encoding | 63.9% | 57.8% | 80.7% |

Word accuracy on the 275 test videos of sessions no model was trained on; one video is about 0.4 points.

**Ensembles (soft voting).** `ml/ensemble.py` averages the members' calibrated probabilities for all 127 combinations of the seven runs, chooses on the validation sessions and only then reads the test score. The chosen ensemble (Inception-TCN + both TCNs + Transformer) reaches 71.8% / 64.4%: no better than the single signer-style TCN, at four times the cost. Averaging all five standard models (no selection at all) gives 62.9% top-1 and 85.1% top-3, so ensembles mainly help the suggestion list. The browser engine supports ensembles (`config.ensemble` in `public/model/dynamic/config.json`, averaged in `SignModel`), but none ships because none beat the single model on the validation sessions.

**What the comparison says.** On unseen signers the architectures sit within a few videos of each other, while changing the *training data* (signer-style augmentation) moved accuracy by 2.5 to 5 points. With about five signers per word in INCLUDE, the limit is signer variety, not model capacity. More signers, and letting each user teach their own version of a sign (section 3.11), are the levers that work.

**Image models.** AlexNet, GoogLeNet and Mask R-CNN take pixels. Sanket's models take MediaPipe's 21 landmarks per hand, which already removes background and most lighting effects and runs in the browser. Training an image CNN from about 1,300 videos would overfit to the few signers and rooms in INCLUDE far more than the landmark models do, and a frame-by-frame image network is too slow for live use in a browser. Their ideas are used where they fit: Inception's multi-scale branches (the Inception-TCN above), and Mask R-CNN's region proposals, background class and non-maximum suppression, applied in time to find where a sign starts and ends (section 3.6).

---

## 4. Results

All numbers are on the held-out test split and are written by the training scripts into `public/model/*/report.json`. Nothing here is typed by hand: rerun training and the Model lab page updates.

### Words (70 words + background, 189 test videos)

| Architecture | Word accuracy | With background windows | Top-3 | Macro F1 | Parameters | Keras CPU, 1 window |
| --- | --- | --- | --- | --- | --- | --- |
| Bidirectional LSTM | 93.7% | 95.7% | 98.6% | 91.8% | 397,031 | 325 ms |
| **Dilated TCN + attention, signer-style augmentation (ships)** | **94.2%** | 96.0% | 97.8% | 93.5% | 435,696 | **45 ms** |
| Dilated TCN + attention, original augmentation | 92.1% | 94.2% | 97.1% | 91.5% | 435,696 | 78 ms |
| GRU | 91.0% | 93.9% | 97.5% | 90.5% | 125,767 | 187 ms |
| MLP on the flattened window | 87.8% | 91.7% | 96.4% | 88.0% | 2,381,383 | 20 ms |

How to read this honestly:

- With the original augmentation the BiLSTM beat the TCN by 1.6 points, which is **3 videos out of 189**, inside the noise of a test set this small. With signer-style augmentation the TCN reaches 94.2% and is about four times faster than the BiLSTM, which matters for a real-time app. On unseen signers all architectures sit within a few videos of each other (section 3.12).
- Both sequence-aware models beat the MLP, which ignores time order, by 4 to 6 points. Modelling the sequence is worth it.
- "Keras CPU" is single-sample eager execution in Python, useful only for comparing architectures. Browser timings are measured live on the Model lab page.
- For reference, the INCLUDE paper reports 94.5% on its 50-word subset with a different split, so these numbers are in the expected range. They are not directly comparable.

Calibration (shipped TCN): expected calibration error 7.3% before temperature scaling, 2.7% after (T = 0.82).

### Words on people the model has not seen (held-out recording sessions)

The table above uses a random split by video, and INCLUDE has every signer record every word, so the test set contains the same people as the training set. To estimate what a new person will see, `python ml/train_dynamic.py --split session --no-export` holds out whole recording sessions instead. INCLUDE has no signer column, but the camera numbers its files and each person records a word about three times in a row, so a jump of more than 5 in the file number starts a new session (about 5 sessions per word, `sessions_of()`). No test session appears in training.

| Split | Word accuracy | With background windows | Top-3 | Macro F1 | Training videos |
| --- | --- | --- | --- | --- | --- |
| Random by video, original augmentation | 92.1% | 94.2% | 97.1% | 91.5% | 928 |
| Random by video, signer-style augmentation (shipped model's report) | 94.2% | 96.0% | 97.8% | 93.5% | 928 |
| Held-out sessions (new people), original augmentation | 62.2% | 73.8% | 86.2% | 59.2% | 776 |
| **Held-out sessions (new people), signer-style augmentation (ships)** | **64.7%** | 75.6% | 86.7% | 61.3% | 776 |

How to read this honestly:

- About 30 points are lost on people the network never saw. Some of that is the smaller training set (776 videos instead of 928), but most of it is signer variation: how high people hold their hands, how big the movements are, their speed.
- Top-3 stays at 86%, so the right word is usually among the alternatives the app shows, even when it is not first.
- This is why the app lets a learner record their own version of a sign (section 3.11, and "Teach Sanket your way" in Learn): per-user prototypes close exactly this gap, and it is the standard remedy for signer-independent recognition with small datasets.
- More signers in the training data would help most. INCLUDE has only a handful per word.

### Letters and digits

35 classes plus `_none`, 6,700 test images.

| Architecture | Test accuracy | Stress test | Parameters |
| --- | --- | --- | --- |
| **2-D CNN, weights shared across hands (ships)** | **99.97%** | 99.75% | 235,520 |
| MLP baseline | 99.94% | 99.82% | 72,000 |

The stress test re-runs the test images with random mirroring, rotation and double the landmark noise. Both models are near the ceiling because the images appear to come from one signer, so this comparison says little about which generalises better; a recording session with new signers would. The CNN ships because its weight sharing builds in the knowledge that a finger shape means the same on either hand, and because it is the architecture the course asks for. Calibration error: 7.8% before temperature scaling, under 0.1% after.

### The whole engine, end to end

`tests/stream.test.mjs` streams one held-out recording per sign through the real browser engine (features, both models, proposals, suppression, state machines):

| Mode | Committed exactly once and correctly |
| --- | --- |
| Words | 56 / 70 (80%) |
| Letters | 35 / 35 |
| Auto (words and letters mixed) | 8 / 9 |

The word errors are mostly signs that look alike from the hands alone (*husband / wife*, *I / you / she*, *good morning / good*), and two signs (*doctor*, *key*) that were never committed. That 80% is lower than the 92% window accuracy above because here the engine also has to decide *when* each sign starts and ends.

---

## 5. Data structures and algorithms

All of these are in `src/engine/`, are plain TypeScript with no framework, and are unit-tested in `tests/engine.test.mjs`.

### 5.1 Ring buffer (circular queue) · `ringBuffer.ts`

The engine needs the last few seconds of frames at all times. A ring buffer is a fixed array plus a write position that wraps around: a new frame overwrites the oldest.

- push: **O(1)**, no allocation
- read frame number *s*: **O(1)** (`s % capacity`)
- memory: fixed at 256 frames

An ordinary array with `shift()` would cost O(n) per frame and create garbage for the collector 30 to 60 times a second. Storage is "structure of arrays" (one typed array per field), so copying a window is a handful of contiguous memory copies.

### 5.2 Binary search · `FrameRing.lowerBound`

Windows are defined in milliseconds ("the last 1.35 s"), but frames arrive at an uneven rate. Timestamps only increase, so the ring is sorted by time and the first frame at or after a given time is found in **O(log n)**: 8 steps for 256 frames.

### 5.3 Nearest-neighbour resampling · `features.resampleIndices`

The TCN takes exactly 32 frames, but a window may hold 20 or 90. Output frame *i* takes input frame `floor(i × (n−1)/31 + 0.5)`. **O(32)**, and identical in Python and TypeScript, which interpolation would make harder to guarantee.

### 5.4 Exponential moving average · `LetterGate`, `SignEngine.updateSpeed`

`s ← s + a × (new − s)`. One multiply per value, no history kept. It smooths the letter probabilities (one noisy frame cannot flip the answer) and the hand-speed estimate.

### 5.5 Finite-state machines · `spotter.ts`

**LetterGate**: `no candidate → holding → locked`. A letter becomes the candidate when its smoothed probability passes 70% *and the hand is still*. Held for 320 ms it is accepted, then locked so it is not typed again until the hand changes. A different confident letter replaces the candidate immediately.

**WordSpotter**: `idle → watching → tracking → cooldown`. It tracks the best-scoring window while the score keeps rising, commits when it has stopped improving for three evaluations, then waits in `cooldown` until the hands pause or leave. That pause is the boundary between two signs, so the end of one sign is never read as the start of another.

### 5.6 Multi-scale sliding windows, temporal IoU and non-maximum suppression

Every 80 ms the engine proposes up to five windows that all end "now", of lengths 0.7, 1.0, 1.35, 1.8 and 2.4 seconds (signs differ in length, and one of these will fit). Each is clipped so it cannot reach back into the previous sign, resampled, and classified in **one batch**.

Several windows will usually detect the same sign. **Non-maximum suppression** keeps one:

1. sort detections by score, **O(n log n)**
2. keep the best
3. drop every other detection whose **temporal IoU** with it (overlap ÷ union of the two intervals) exceeds 0.3
4. repeat with what is left

Over time, the spotter's peak tracking is the same idea: of all the windows that fire as a sign unfolds, only the maximum is committed.

A window must also show real movement (wrist path longer than 1.2 hand sizes) to count as a word, so a hand held still is never a word. Speed is measured in *hand sizes per second*, which makes it independent of how far the signer is from the camera.

### 5.7 Min-heap top-k · `heap.ts`

To show the "top 3 candidates" from 71 class probabilities we keep a min-heap of size 3. The smallest of the three sits at the root, so each new value needs one comparison, and only if it is larger does it replace the root and sift down. **O(n log k)** time and **O(k)** memory, against O(n log n) for sorting everything. The same heap ranks autocomplete suggestions.

### 5.8 Trie · `trie.ts`

The vocabulary is stored as a prefix tree: each node has one child per next letter. While you fingerspell `H-O-S`, the engine walks three nodes (**O(length of prefix)**, independent of vocabulary size) and explores only the subtree below to offer `HOSPITAL`. Each node stores the best word weight beneath it, so subtrees that cannot beat the current top-k are skipped (branch and bound).

### 5.9 Levenshtein edit distance (dynamic programming) · `Trie.fuzzy`, `editDistance`

Fingerspelling recognition makes mistakes: `DOCTER`. Edit distance is the fewest insertions, deletions and substitutions that turn one string into another. The DP table has one row per letter of the dictionary word and one column per letter typed; each cell is the minimum of:

- the cell above + 1 (delete)
- the cell to the left + 1 (insert)
- the diagonal cell + 0 if the letters match, else + 1 (substitute)

Computing it against every word separately would be O(words × m × n). Instead the search walks the **trie**: each node computes its row from its parent's row, so words sharing a prefix share that work, and when every entry in a row already exceeds the allowed distance the whole subtree is pruned. The Model lab page draws the table for any two words.

### 5.10 Bigram language model in hash maps · `language.ts`

`count[previous][next]` is a hash map of hash maps. After "I", the most frequent followers ("need", "am", "have") are offered as one-tap buttons, picked with the top-k heap. Updating a count is **O(1)**. The model starts from a list of phrases people use at a clinic or a counter and adds every sentence the user speaks, stored in `localStorage`, so it adapts to that person.

### 5.11 LRU cache (hash map + doubly linked list) · `lru.ts`

Suggestion queries repeat constantly as the screen re-renders. The cache gives **O(1)** lookup through the map, and the linked list keeps entries in order of use: a hit moves its node to the front, and when the cache is full the node at the back is evicted. 64 entries.

### 5.12 Smaller pieces

| What | Where | Why |
| --- | --- | --- |
| Bit masks for hand presence | `features.ts` | Two flags per frame in one byte |
| HTTP Range requests on zip central directories | `ml/include_remote.py` | Download 30% of the dataset instead of all of it |
| Medoid selection | `ml/export_exemplars.py` | Picks the test sample closest to its class average as the example |
| t-SNE | `ml/common.py` | The 2-D picture of the embedding layer on the Model lab page |
| Rule-based geometry | `src/lib/helpSignal.ts` | The SOS gesture does not depend on a learned model |

### 5.13 Live input clean-up: low-light gain, One-Euro filter, framing coach

The models only ever see landmarks, so the quality of those landmarks on a real webcam decides most of what the user experiences. Three small stages sit between the camera and the engine (`useLiveLoop.ts`):

1. **Adaptive low-light gain** · `src/lib/lightBoost.ts`. Every 300 ms the frame is drawn onto a 48 x 27 canvas and its mean luma `L = 0.2126 R + 0.7152 G + 0.0722 B` is taken. The target gain is `clamp(0.42 / L, 1, 2.6)`, smoothed with an exponential moving average so the picture does not pump. When the gain is above 1.08, each frame is redrawn on a canvas with a GPU `brightness()` / `contrast()` filter and that copy is what MediaPipe sees; the person still sees the normal video. Below a mean luma of 0.12 the UI asks for more light, because brightening also brightens noise.
2. **One-Euro filter** · `src/engine/smoothing.ts` (Casiez, Roussel & Vogel, 2012). Each of the 63 coordinates of each hand is an exponential moving average whose smoothing factor is `a = 1 / (1 + tau / dt)` with `tau = 1 / (2 pi f_c)`, and whose cutoff `f_c = f_min + beta * |speed|` rises with the coordinate's (itself smoothed) speed. Still hands get `f_min = 1.6 Hz`, which removes detector jitter that would otherwise look like movement to the word spotter and make letters flicker; fast hands get a cutoff near 10 Hz, so real signing is not delayed (under 2% of the frame width in the tests). Hands are matched frame to frame by nearest wrist rather than by MediaPipe's handedness label, which can flip for a frame.
3. **Dropout bridging.** A hand the detector loses for a moment (motion blur, dim light) is kept at its last smoothed position for up to 140 ms, so a sign is not cut in two by a missed frame or two. A hand that has really left disappears after that.
4. **Framing coach** · `src/lib/framing.ts`. From the landmarks' bounding box: any point within 2% of the frame edge gives "keep your hands inside the frame", a hand taller than 55% of the frame gives "move back", and one smaller than 7% gives "come closer". The hint stays up for 1.2 s so it does not flicker.

The hand tracker's own confidence thresholds were lowered from 0.5 to 0.4, so hands are still found in poorer light; the filter absorbs the extra jitter. The camera is asked for 1280 x 720 instead of 640 x 480, which gives the landmark model more pixels per finger. `tests/smoothing.test.mjs` checks jitter reduction, lag, dropout bridging, hand identity and the framing rules.

---

## 6. Why it is fast

- **Each camera frame is processed exactly once.** `requestVideoFrameCallback` fires per new video frame. A `requestAnimationFrame` loop on a 60 Hz screen with a 30 fps camera would run the detector twice on every frame.
- **The loop never waits for a model.** GPU results are read back asynchronously. A model that is still busy skips a frame instead of stalling the camera.
- **Frame features are computed once** and cached in the ring buffer. Building a 32-frame window is 32 memory copies plus the 4-value trajectory.
- **All proposal windows go to the GPU as one batch**, not one call each.
- **No per-frame allocation** in the hot path (typed arrays, preallocated batch).
- **React is not in the loop.** Per-frame values live in plain objects; the few components that show live numbers sample them 4 to 15 times a second.
- **Short holds.** A letter needs 320 ms of stillness (the previous version needed 1 s). A word is committed about a quarter of a second after it ends.
- **Small download.** Both models together are under 3 MB, and TensorFlow.js loads only when the translator opens.

---

## 7. How the claims are checked

| Command | What it proves |
| --- | --- |
| `python ml/check_parity.py` | Python and TypeScript compute the same features (difference below 1e-5) |
| `node ml/check_tfjs.mjs static` / `dynamic` | TensorFlow.js gives the same outputs as Keras for the exported models |
| `npm test` | The data structures behave as documented, and every test recording streamed through the real engine is committed correctly |
| `npm test` (`tests/fewshot.test.mjs`) | A taught sign is recognised by the live engine and four other words are not mistaken for it |
| `python ml/eval_fewshot.py` | The few-shot method works on words the network never saw (section 3.11) |
| `npm run lint` | The app type-checks |

`tests/stream.test.mjs` is the important one: it feeds every exemplar (one held-out recording per sign) frame by frame through the same `SignEngine` the browser uses, so it tests features, models, proposals, suppression and the state machines together.

---

## 8. Limits

- **Test accuracy is not field accuracy.** The headline test sets share signers, cameras and rooms with the training data. Holding out whole recording sessions drops word accuracy from 92% to 62% (top-3 86%); see "Words on people the model has not seen". The letter images appear to come from one signer, which is why that score is near 100%. Teaching your own version of a sign is the in-app remedy.
- **INCLUDE signers stand far from the camera.** Their hands are small in the frame, so the training landmarks are noisier than a webcam user's. Normalisation removes the size difference but not the noise difference.
- **Only the hands are used.** Signs that differ only by where they are made relative to the face or body, or by facial expression, cannot be told apart.
- **Isolated signs.** The models were trained on single signs. Signing several in a row works when there is a brief pause between them; fluent, co-articulated signing is a harder problem.
- **Auto mode is a compromise.** Deciding between "a still hand is a letter" and "a moving hand is a word" from motion alone sometimes gets it wrong. The Words and Letters modes are more reliable.
- **70 words.** Everything else is fingerspelled or picked from suggestions.
- The signs have not been reviewed by an ISL teacher. Check them against the ISLRTC dictionary before relying on them.

# Sanket: the complete PBL presentation guide

Everything you need to present Sanket and answer questions about it, from the basic idea to the
deepest technical detail. Read it top to bottom once, then use the cheat card and the question bank
the night before.

Companion files:
- [`DEMO_PREP.md`](../DEMO_PREP.md): the evaluation checklist, the 8-minute script, and 36 longer
  maths / general deep learning answers (Part D).
- [`ALGORITHMS.md`](ALGORITHMS.md): the technical reference, with every number and file.

Contents:

0. [Cheat card: the numbers to know by heart](#0-cheat-card)
1. [Sanket in 60 seconds](#1-sanket-in-60-seconds)
2. [The problem and why it matters](#2-the-problem-and-why-it-matters)
3. [The system and its four workflows](#3-the-system-and-its-four-workflows)
4. [The data](#4-the-data)
5. [The models](#5-the-models)
6. [Why this model, and what is wrong with the others](#6-why-this-model-and-what-is-wrong-with-the-others)
7. [Results, read honestly](#7-results-read-honestly)
8. [The real-time engine and its algorithms](#8-the-real-time-engine-and-its-algorithms)
9. [The app, the design and the deployment](#9-the-app-the-design-and-the-deployment)
10. [Limits and future work](#10-limits-and-future-work)
11. [The slide deck](#11-the-slide-deck)
12. [The live demo](#12-the-live-demo)
13. [Question bank](#13-question-bank)
14. [Glossary](#14-glossary)
15. [Course plan map: every unit in the project](#15-course-plan-map-every-unit-in-the-project)

---

## 0. Cheat card

| What | Number |
| --- | --- |
| Words the app knows | **70** (+ a "no sign" class = 71 outputs) |
| Letters and digits | **35** (A-Z, 1-9) + a "no sign" class = 36 outputs |
| Landmarks per hand | **21** points, each (x, y, z) |
| Features per frame | **132** (letters), **136** (words: 132 + 4 trajectory values) |
| Word window | **32 frames** (about 1 second) |
| Word videos used | **1,306** videos from INCLUDE (928 train / 189 val / 189 test) |
| Letter images used | **41,672** (31,266 / 6,702 / 6,704) |
| Word test accuracy | **94.2%** (top-3 97.8%, macro F1 93.5%) |
| Word accuracy on **new people** | **64.7%** (top-3 86.7%) — the honest number |
| Letter test accuracy | **99.97%** (one signer, so optimistic) |
| Baseline (MLP) words | **87.8%** |
| Words model size | **435,696** parameters, dilations **1-2-4-8**, receptive field **61 frames** |
| Letters model size | **235,520** parameters |
| Calibration | error **7.3% → 2.7%**, temperature **T = 0.82** |
| Few-shot ("My signs") | **75.9%** right on 15 unseen words; **68%** accepted, **4%** false matches |
| End-to-end stream test | words **56/70**, letters **35/35**, auto **8/9** |
| Live site | **https://sanket-woad.vercel.app** |
| Syllabus | All **5 units** used in real code (section 15); lab experiments **1, 2, 4, 5, 7, 10** directly |

The one sentence to say about AI help (say it once, early):
> "I used Claude as a coding assistant. I'll walk you through the design decisions, the
> experiments and the results, and I can explain any part of the code."

---

## 1. Sanket in 60 seconds

**Sanket** (संकेत, "sign" / "signal") reads **Indian Sign Language (ISL)** from an ordinary webcam
and turns it into **text and speech**, live, in the browser. It is built for the places where a deaf
person most needs to be understood by someone who doesn't sign: a clinic, a counter, an emergency,
home.

How it works, in one breath: a pretrained hand tracker (MediaPipe) finds **21 points on each hand**.
Sanket turns those points into numbers that don't depend on where the hand is or how far it is from
the camera. A **2-D CNN** reads **letters** from a single frame; a **dilated temporal CNN (TCN)**
reads **words** from the last second of movement. A small real-time engine decides when a sign
really happened, builds the sentence, suggests words, and speaks it.

What makes it more than a classifier:
- It runs **entirely on the device**: no video is uploaded.
- It can say **"no sign"** (background class), so random movement doesn't type words.
- You can **teach it a new sign from 3 recordings** (few-shot learning), with no retraining.
- It has a **Learn** course, **speech-to-caption** for the other person, and an **SOS** mode.
- It reports its results **honestly**: 94.2% on the standard test, 64.7% on people it has never seen.

---

## 2. The problem and why it matters

### The basic problem
Many deaf and hard-of-hearing people in India use ISL as their first language. Most hearing people
don't know it, and trained interpreters are few and expensive, so everyday situations (explaining
symptoms to a doctor, asking at a ticket counter, calling for help) become hard. Census 2011
counted about 50 lakh people in India with a hearing disability.

### What Sanket does about it
- **Input:** live webcam video of a person signing.
- **Output:** the recognised letter, digit or word, joined into a sentence, shown in large text and
  spoken aloud. The other person can reply by voice, and their speech appears as captions.

### Why it is hard (and why deep learning)
1. **A sign is a shape plus a movement over time.** Letters are mostly still hand shapes; words are
   movements. A system must handle both.
2. **Everyone signs a bit differently:** hand size, height, speed, angle, left or right hand.
   Hand-written rules ("if the index finger is up and the hand moves left...") can't cover that
   variety. A neural network **learns** which patterns matter from examples.
3. **Finding where a sign starts and ends** in a continuous stream is its own problem.
4. **It must be fast and private** enough to run live on a normal laptop or phone.

### Why ISL specifically
Most sign language research and datasets are American Sign Language (ASL). ISL is a different
language with different signs and many two-handed letters. A model trained on ASL is no use for
ISL, so the project uses ISL data (INCLUDE and an ISL letters set).

---

## 3. The system and its four workflows

### 3.1 The big picture

```
camera ─► MediaPipe hand tracker ─► 21 points × 2 hands ─► features (132 / 136 numbers)
        (pretrained, not ours)                              │
                                                            ▼
                                            ring buffer (last 256 frames)
                                     ┌──────────────────────┴──────────────────────┐
                              letters CNN (every frame)                 words TCN (windows of 32 frames)
                                     │                                             │
                        smoothing + hold gate                    multi-scale windows + suppression
                                     └──────────────────────┬──────────────────────┘
                                                            ▼
                                     sentence ─► suggestions (trie, edit distance, bigram) ─► speech
```

Three neural networks run on each frame. **Two are pretrained** (Google's palm detector and hand
landmark network). **The third stage is the project's own work**: the two classifiers, trained
from scratch in `ml/`, plus everything around them.

### 3.2 Workflow 1: what the user does

| Feature | What the user does | What happens |
| --- | --- | --- |
| **Translate** (`/app`) | Turns on the camera and signs | Hand overlay, "now reading" with the top 3 guesses, the sentence builds, **Speak** reads it aloud |
| Modes | Picks **Words**, **Letters** or **Auto** | Auto: moving hands → words, still hands → letters |
| Suggestions | Taps a suggested word | The trie finishes a spelled word; the bigram model guesses the next word |
| **Caption speech** | The hearing person talks | The browser's speech recogniser turns it into captions |
| **Learn** | Watches a real signer, then copies | Words (video with slow motion, mirror, key moments, model overlay) → sentences (ISL word order) → letters (3-D hand); the model checks each attempt |
| **My signs** | Records a new sign 3-5 times | It becomes recognisable at once, in Translate too |
| **SOS** | Holds a button, or makes the Signal for Help | 5-second cancel countdown, then a full-screen "I am deaf and need help" alert with Call 112, location and saved contacts |
| **Model lab** | Opens the lab tab | Pipeline, metrics, training curves, confusion matrix, t-SNE, live speed test, trie and edit-distance demos |
| Demo stream | Presses "Play demo stream" | Recorded test signs go through the same engine: a demo without a webcam |

### 3.3 Workflow 2: one camera frame, start to finish (inference)

1. **New frame arrives.** `requestVideoFrameCallback` fires once per *new* video frame (not per
   screen refresh), so no frame is processed twice. (`src/hooks/useLiveLoop.ts`)
2. **Light check.** If the room is dark, a brightened copy is given to the tracker.
3. **Hand tracking.** MediaPipe's palm detector finds hands; its landmark network returns 21
   points per hand.
4. **Clean-up.** A One-Euro filter removes jitter from still hands without slowing fast ones; a hand
   lost for a moment is bridged for 140 ms.
5. **Features.** Each hand is moved so the wrist is the origin and scaled by hand size, the aspect
   ratio is corrected, and hands are put in fixed slots → 132 numbers. (`src/engine/features.ts`)
6. **Ring buffer.** The frame's features go into a fixed-size circular buffer: O(1), no memory
   churn.
7. **Letters.** The letters CNN classifies the frame. An exponential moving average smooths the
   probabilities; the **hold gate** accepts a letter after it is confident and still for 320 ms.
8. **Words.** Every 80 ms, up to 5 windows ending "now" (0.7 s to 2.4 s long) are cut, resampled to
   32 frames, given 4 trajectory values (→ 136), and classified **in one GPU batch**.
9. **Decision.** Non-maximum suppression keeps one detection; the **word spotter** state machine
   commits the peak, then waits for a pause so the end of one sign isn't read as the start of the
   next.
10. **Language.** The word joins the sentence; suggestions update; **Speak** uses the browser's
    speech synthesis.

All of this happens in the browser with TensorFlow.js on the GPU. React is not in the per-frame
loop, and GPU results are read back asynchronously, so the camera never waits for a model.

### 3.4 Workflow 3: how the models were built (training)

| Step | Script | What it does |
| --- | --- | --- |
| 1. Download | `ml/include_remote.py` | Reads only each zip's table of contents with HTTP Range requests, then downloads only the 1,306 videos of the 70 words: **16.9 GB instead of 56.8 GB** |
| 2. Landmarks | `ml/extract_include.py`, `ml/extract_static.py` | Runs MediaPipe on every video frame and image; finds each video's *active segment* (when the hands are up) |
| 3. Features | `ml/features.py` | The same feature code as the browser (checked to match within 1e-5) |
| 4. Augment | `ml/augment.py` | Mirror, rotation, 3-D tilt, scale, shift, jitter, time warp, random window, dropped frames, movement size; new every epoch |
| 5. Train | `ml/train_dynamic.py`, `ml/train_static.py` | Keras/TensorFlow; AdamW, warm-up + cosine, label smoothing, early stopping |
| 6. Calibrate | `ml/common.py` | Fits the temperature T on the validation set |
| 7. Evaluate | same | Accuracy, macro F1, top-3, confusion matrix, calibration error → `report.json`, plots |
| 8. Export | `ml/common.py → export_tfjs` | Writes TF.js model files to `public/model/` (hand-written exporter, because the official converter fails on Windows) |
| 9. Extras | `export_exemplars.py`, `export_clips.py`, `export_prototypes.py`, `eval_fewshot.py` | Demo recordings, teacher videos, class prototypes for few-shot, the few-shot experiment |
| 10. Check | `check_parity.py`, `check_tfjs.mjs`, `npm test` | Python = browser features; TF.js = Keras outputs; engine end-to-end |

### 3.5 Workflow 4: how it reaches users (deployment)

- The app is a **static website** (React + Vite). `npm run build` produces `dist/`.
- The models are just files in `public/model/` (under 3 MB together), served with the site.
- It is hosted on **Vercel**: https://sanket-woad.vercel.app. Every push to GitHub `main`
  redeploys it. `vercel.json` sends page routes to the app and caches model files.
- There is **no inference server**. Each visitor's browser downloads the models once and runs them
  on its own GPU. That is cheaper, scales to any number of users, and keeps video private.
- Accounts (optional) use **Supabase** (hosted Postgres + auth) with row-level security.

---

## 4. The data

### 4.1 Words: INCLUDE

- **What:** INCLUDE, a word-level Indian Sign Language video dataset from **AI4Bharat / IIT
  Madras**, licence **CC BY 4.0**. 263 words in 15 categories, recorded by experienced signers.
- **Used:** **70 words** chosen for Sanket's settings (greetings, pronouns, family, health,
  describing words, time, places), **1,306 videos**, 80,770 frames. List: `ml/vocab_words.txt`.
- **Size problem solved:** the dataset is 56.8 GB in 44 zips. A zip keeps its index at the end, so
  `include_remote.py` reads just that index with HTTP Range requests and downloads only the needed
  videos (16.9 GB).
- **Labels:** 70 words + `_background` ("no sign"), made from rest-pose frames and partial signs in
  the same videos.

### 4.2 Letters and digits

- **What:** a public 35-class ISL fingerspelling image set (1-9, A-Z), 42,745 images
  (`Hemg/Indian_sign_language_dataset` on Hugging Face). **41,672** have a detectable hand.
- **Labels:** 35 classes + `_none` (rest-pose frames taken from INCLUDE), so a resting hand isn't
  forced to be a letter.
- **Caveat:** it appears to be one signer, so the 99.97% is optimistic. No stated licence, so the
  letters model is coursework only.

### 4.3 Why these datasets (and not others)

| Option | Why not (or why) |
| --- | --- |
| **INCLUDE** | ✔ The largest public **word-level ISL** dataset, real signers, clear licence |
| WLASL, MS-ASL | ASL, not ISL. Different language, different signs |
| ISL dictionary videos (ISLRTC) | Usually one recording per word: too few examples to train on, and not licensed as a training set |
| Sentence-level ISL sets | Continuous signing needs sentence-level labels and much more data; isolated words come first |
| Recording our own | One or two signers would give a model that only works for them; no time to collect many signers |
| Pixel image datasets of letters | Same letters, but pixels need far more data; we use landmarks from the images instead |

### 4.4 Preprocessing (from video to numbers)

1. **Landmarks:** MediaPipe gives 21 points × (x, y, z) per hand.
2. **Aspect correction:** x is multiplied by width/height, so a circle stays a circle.
3. **Slots:** MediaPipe's "Right" hand always goes in slot 0, "Left" in slot 1 (a missing hand is
   zeros plus a presence flag).
4. **Normalise each hand:** subtract the wrist (position stops mattering), divide by hand size
   (distance from the camera stops mattering).
5. **Relation features:** where the two hands are relative to each other (3 numbers) and presence
   flags (3).
   → **132 numbers per frame**, reshaped for the CNN as **2 × 22 × 3** (hand × landmark × xyz).
6. **Words only:** 4 trajectory numbers (each wrist relative to the window's mean position, divided
   by hand size) → **136 per frame**; windows resampled to **32 frames**.

The spec is `docs/preprocessing.md`; Python and TypeScript implement it identically (checked).

### 4.5 Splits and leakage (a favourite examiner topic)

**Leakage** = test information sneaking into training, which inflates scores. Prevented four ways:
1. **Letters split in capture order**, not randomly: the images are consecutive camera frames, so a
   random split puts near-identical pictures in train and test.
2. **Words split by video:** a whole video is in exactly one split; windows of one video never
   cross splits.
3. **Session split for new people:** INCLUDE has no signer column, but its camera numbers files
   in order and each person records a word about 3 times in a row, so a jump of more than 5 in the
   file number marks a new session. Holding out whole sessions measures **new-signer** accuracy.
4. **Everything is chosen on validation** (temperature, epochs, architecture, thresholds). The test
   set is read once at the end.

### 4.6 Augmentation (making more variety from the same data)

Applied to the **raw landmarks**, then the normal feature code runs, so every augmented sample is
something the live camera could really produce.

| Augmentation | Imitates |
| --- | --- |
| Mirror | A left-handed signer |
| Rotation ±20° | Camera roll, arm angle |
| 3-D tilt ±18° | A different viewing angle |
| Scale ±18%, shift | Different distances and positions |
| Landmark jitter | Tracker noise |
| Random window start/end, time warp | Signing early, late, faster, slower |
| Dropped hand frames | Motion-blur misses |
| Movement size ±30% | A person making bigger or smaller movements |
| Mixup (letters, optional) | Blends two samples to smooth decision boundaries |

The "signer-style" settings raised new-signer accuracy from **62.2% to 64.7%**: changing the data
helped more than changing the model.

---

## 5. The models

### 5.1 Why landmarks instead of pixels
A network on raw pixels must learn to ignore skin tone, lighting, clothes and background, which
needs far more videos than exist for ISL. Landmarks remove all of that first. The models become
tiny (under 0.5 M parameters), train on a laptop CPU in minutes, and run live in a browser. Bonus:
only 21 points per hand are used, so it is privacy-friendly.

### 5.2 Letters: a 2-D CNN with weight sharing (`ml/models.py → static_cnn`)
- Input: 132 numbers reshaped to a tiny "image" **2 × 22 × 3** (row = hand, column = landmark,
  channel = x, y, z).
- **(1, 3) kernels** slide along one hand: three neighbouring columns are three joints of a finger,
  so a filter learns "this finger is bent".
- The same kernel runs on both rows, so **both hands share weights**: what it learns about a finger
  on one hand it knows for the other.
- Three residual blocks with squeeze-and-excitation; a **(2, 3) kernel** fuses the two hands;
  Dense 128 ("embedding") → softmax over 36 classes. **235,520 parameters.**

### 5.3 Words: a dilated temporal CNN with attention (`ml/models.py → dynamic_tcn`)
Input: 32 frames × 136 numbers.
1. **Conv1D 1×1**, 96 filters + BatchNorm + ReLU: a learned per-frame embedding.
2. **4 residual blocks**, kernel 3, **dilation 1, 2, 4, 8**, filters 96-96-144-144. Each block:
   conv-BN-ReLU → conv-BN → squeeze-excite → SpatialDropout 0.15 → add shortcut → ReLU.
3. **Temporal attention pooling:** a score per frame → softmax over time → weighted average, so
   the model focuses on the frames that define the sign.
4. Dropout 0.4 → **Dense 160** ("embedding", reused by My signs) → Dropout 0.3 → **softmax 71**.

**435,696 parameters.** Receptive field: each conv adds (k−1)·d frames, two convs per block, so
1 + 4·(1+2+4+8) = **61 frames**, more than the 32-frame window: the last block sees the whole sign.

### 5.4 Training settings

| | Words | Letters |
| --- | --- | --- |
| Loss | Cross-entropy, **label smoothing 0.1** | same |
| Optimiser | **AdamW**, peak LR **2e-3**, weight decay 5e-4, gradient clip 1.0 | AdamW, 2e-3, 1e-4 |
| Schedule | **5% warm-up, then cosine decay** | same |
| Batch | **64** | 256 |
| Epochs | up to 120, early stopping patience 30 (ran 118) | up to 40, patience 10 (ran 30) |
| Seed | 7 | 7 |
| Time | about 7 minutes, laptop CPU | about 7 minutes |

### 5.5 Calibration
A softmax "90%" should be right about 90% of the time. Label smoothing makes the model
**under-confident**, so one number T is fitted on validation and the app uses `softmax(log p / T)`.
T = 0.82 sharpens; error drops from 7.3% to 2.7%. It never changes which class wins, only how sure
the model says it is. It matters because the app only accepts a sign above a confidence threshold.

### 5.6 Few-shot learning: "Teach your own sign" (`src/engine/fewshot.ts`)
A **prototypical network** built on the trained TCN:
1. Each recording goes through the network but stops at the 160-number **embedding** layer.
2. Embeddings are L2-normalised and averaged → the sign's **prototype**.
3. Live windows are compared with each prototype by **cosine similarity**.
4. **Open-set rejection:** accept only if similarity ≥ **0.80** and not more than **0.10** below the
   nearest built-in class (one of the 70 words or "no sign"). This stops ordinary movements from
   being read as the taught sign.

Measured on 15 words the network had never seen: **75.9%** picked correctly (chance 6.7%). The
first rejection rule wrongly accepted **67%** of other movements; the shipped rule accepts **68%**
of real performances and wrongly accepts **4%**. Leaning towards rejecting is deliberate: a missed
sign costs a repeat, a false one puts wrong words in someone's mouth.

---

## 6. Why this model, and what is wrong with the others

This is the question you are most likely to get: "Why a TCN? Why not a CNN on images, an LSTM, a
Transformer, R-CNN, YOLO...?" The short answer: **the bottleneck is how few signers the data has,
not model size**, so the best model is the small, fast one that generalises as well as any.

### 6.1 Measured on the same data (words)

| Model | Test (by video) | New people | Params | CPU per window | Verdict |
| --- | --- | --- | --- | --- | --- |
| MLP (flattened window) | 87.8% | — | 2,381,383 | 20 ms | Ignores time order: worst. Shows sequence modelling is worth 4-6 points |
| GRU | 91.0% | 63.6-65.5% | 125,767 | 187 ms | Close, but processes frames one after another: slow |
| BiLSTM | 93.7% | 60.0% | 397,031 | 325 ms | Close, but about **7× slower** than the TCN |
| Inception-TCN | — | 60.0% | — | — | GoogLeNet's multi-branch idea in time: no gain |
| Transformer | — | **57.8%** | — | — | Attention needs lots of data: worst on new people |
| Ensembles | — | 64.4% | 4× | 4× | No better than the single TCN, four times the cost |
| **TCN + attention (ships)** | **94.2%** | **64.7%** | 435,696 | **45 ms** | Best or tied on accuracy, fastest sequence model |

How to say it: "On new people all architectures land within a few videos of each other. Changing
the training data moved accuracy by 2.5-5 points; changing the architecture didn't. So I ship the
fastest model that is as accurate as any."

### 6.2 Approaches considered but not used (reasoned, not trained)

| Approach | What it is | Problem for this project |
| --- | --- | --- |
| **2-D CNN on raw frames** (AlexNet, VGG, ResNet) | Image classifier per frame | Learns skin, light, background; needs far more data than 1,306 videos; ignores motion; heavy in a browser |
| **CNN + LSTM on frames** | Image features per frame, then a recurrent network | Same pixel problem, plus slow sequential processing |
| **3-D CNN** (C3D, I3D) | Convolutions over space *and* time on video | Very heavy compute; usually needs pretraining on huge video sets; not real-time in a browser |
| **R-CNN / Faster / Mask R-CNN** | Object *detectors*: propose regions, classify each, suppress duplicates | They find objects in an image; they don't read a movement. Too slow per frame. Hand finding is already done by MediaPipe. **Their ideas are reused in time**: a background class, IoU labelling and non-maximum suppression to find where a sign starts and ends |
| **YOLO / SSD** | Fast one-shot detectors | Would need hand-box labels and still need a temporal model on top; MediaPipe's palm detector is already a single-shot detector |
| **OpenPose** instead of MediaPipe | Body/hand keypoints | Much heavier (needs a GPU), not built for the browser, licence restricts use; MediaPipe runs live in the browser |
| **Classical ML on landmarks** (SVM, random forest, kNN) | Hand-made features + classic classifier | Fine for still letters, weak for movements over time; the MLP baseline already covers the "no temporal modelling" case (not separately measured) |
| **DTW template matching** | Align a live sequence to stored examples | Slow with many templates and sensitive to who signs (not measured); our few-shot uses learned embeddings instead |
| **Cloud APIs** | Send video to a server | Privacy (video leaves the device), needs internet, costs money, and there is no good ISL API anyway |

### 6.3 Why the TCN specifically
- **Parallel:** every frame is computed at once (an LSTM goes frame by frame) → fast.
- **Dilation:** sees the whole second of motion with few weights.
- **Residual + BatchNorm:** a deeper stack still trains well.
- **Attention pooling:** focuses on the sign, not the transitions in and out.
- **Small and exportable:** 0.44 M parameters, standard layers that TF.js supports.

### 6.4 Why a separate CNN for letters
Letters are mostly **still hand shapes**, so one frame is enough, and it can run on **every** frame
for instant feedback. Weight sharing across the two hands suits ISL's two-handed letters.

---

## 7. Results, read honestly

### 7.1 Words (189 test videos)
- **Word accuracy 94.2%**, top-3 97.8%, macro F1 93.5%, background recall 100%.
- **Why these metrics:** accuracy is easy to read; **macro F1** weights every word equally so a hard
  word can't hide behind easy ones; **top-3** matters because the app shows alternatives;
  **calibration** matters because the app uses a confidence threshold.
- For reference, the INCLUDE paper reports 94.5% on its 50-word subset (different split, not
  directly comparable, but the right range).

### 7.2 New people (held-out sessions)
- **64.7%** (top-3 86.7%, macro F1 61.3%). About 30 points lower.
- Why: signer variation (how high, how big, how fast) with only about 5 signers per word.
- The right word is still in the top 3 about 87% of the time, which is why the app shows
  alternatives and lets users teach their own version of a sign.
- **Present this as a strength:** most projects only show their best number.

### 7.3 Letters
- 99.97% (CNN) vs 99.94% (MLP), stress test 99.75%. Both are at the ceiling because the images look
  like one signer, so the comparison doesn't prove generalisation. Say so.

### 7.4 Errors, explained
- Look-alike pairs **from the hands alone**: husband / wife, I / you / she, good morning / good.
  They differ by face or body position, which the model doesn't see.
- Weakest classes have only 2-3 test videos each, so one video moves their F1 by about 0.3: per-class
  numbers are noisy.

### 7.5 The whole engine
Streaming one held-out recording per sign through the real browser engine: words **56/70**, letters
**35/35**, auto **8/9**. Lower than window accuracy because the engine must also decide *when* each
sign starts and ends. *Doctor* and *key* were never committed.

### 7.6 Overfitting or underfitting?
- Not underfitting: training accuracy is high, and an MLP with 5× the parameters does worse.
- Some overfitting to the training **signers** (the new-people drop), controlled with augmentation,
  dropout, weight decay, label smoothing and early stopping. The real fix is more signers.

---

## 8. The real-time engine and its algorithms

All in `src/engine/`, plain TypeScript, unit-tested.

| Algorithm / structure | Where | What it does | Cost |
| --- | --- | --- | --- |
| **Ring buffer** | `ringBuffer.ts` | Last 256 frames, new overwrites oldest | O(1) push and read, fixed memory |
| **Binary search** | `FrameRing.lowerBound` | Find the first frame after a time | O(log n) |
| **Resampling** | `features.resampleIndices` | Any window → exactly 32 frames | O(32) |
| **Exponential moving average** | `LetterGate`, speed | Smooths noisy probabilities | O(1) |
| **Finite-state machines** | `spotter.ts` | Letter hold gate; word spotter idle → watching → tracking → cooldown | O(1) per frame |
| **Multi-scale windows + temporal IoU + NMS** | `spotter.ts` | Propose 5 window lengths, keep one detection | O(n log n), n ≤ 5 |
| **Min-heap top-k** | `heap.ts` | Top 3 of 71 classes, top suggestions | O(n log k) |
| **Trie** | `trie.ts` | Completes a word while spelling | O(prefix length) |
| **Levenshtein DP on the trie** | `trie.ts` | Fixes a misread letter (DOCTER → DOCTOR) | Shared prefix rows, pruning |
| **Bigram model** | `language.ts` | Predicts the next word, learns from the user | O(1) update |
| **LRU cache** | `lru.ts` | Repeat suggestion queries for free | O(1) |
| **One-Euro filter** | `smoothing.ts` | Removes jitter, keeps fast motion | O(1) per coordinate |
| **Cosine similarity / nearest class mean** | `fewshot.ts` | Matches taught signs | O(classes × 160) |

Why it is fast: each frame processed once (`requestVideoFrameCallback`), no waiting on the GPU,
features computed once, all windows in one batch, no per-frame memory allocation, React kept out of
the loop, models under 3 MB, TF.js loaded only when the translator opens.

---

## 9. The app, the design and the deployment

### 9.1 Tech stack
- **Frontend:** React, TypeScript, Tailwind CSS, Vite.
- **Hand tracking:** MediaPipe Tasks Vision (HandLandmarker), served locally.
- **ML:** TensorFlow / Keras (training, Python), TensorFlow.js (browser inference, WebGL GPU).
- **Speech:** Web Speech API (speech synthesis for Speak, speech recognition for captions).
- **Accounts:** Supabase (Postgres + auth, row-level security), optional; guest mode works fully.
- **Hosting:** Vercel, static site, auto-deploy from GitHub.

### 9.2 Privacy and safety
- Video never leaves the device; only landmark numbers are computed, locally.
- Taught signs are stored in the browser (`localStorage`) as landmark recordings.
- SOS shows an alert and location on screen; it does **not** send SMS or call anyone by itself
  (the user presses Call 112). The SOS gesture uses fixed geometry rules, not a learned model, so it
  behaves predictably.

### 9.3 The design
- **Theme "mehndi":** henna brown for ink, warm cream paper, **terracotta** for whatever the model
  is reading right now (the same colour as the live hand skeleton), **leaf green** for links and
  secondary marks, strong 2 px rules, condensed capitals for anything read at a glance. Warm and
  Indian, with no blue anywhere. Bilingual throughout (English + Hindi).
- **Logo:** **सं**, the first syllable of संकेत, in terracotta on a henna-brown tile, with one sound
  wave: a sign that speaks.
- **Opening animation:** on cream paper, the tile lands, सं is written on it like a pen stroke,
  sound waves ripple out, the name rises, and an iris opens onto the page (about 2.3 s, skippable,
  off for users who ask for reduced motion).
- **Cover page:** a light editorial layout. The hero is a round terracotta "stage" that replays
  **real INCLUDE test recordings** as the skeleton the model sees, with a "now reading" label, the
  input tensor (2 × 21 × 3) as a heat strip, the 32-frame window filling, and the words joining into
  a sentence. Then the accuracy numbers, "four steps" (See, Measure, Read, Speak), a marquee of all
  70 words, six feature cards, a dark "Inside the model" section (the TCN's dilations drawn as
  growing bars, the deep learning ideas, the algorithms, honest numbers) and a call to action.
- **The app inside** keeps its layout; only the colours changed.

### 9.4 Testing and reproducibility
- `npm test`: data structures, engine end-to-end stream test, few-shot test.
- `python ml/check_parity.py`: Python and browser features match.
- `node ml/check_tfjs.mjs`: browser model = Keras model.
- Every result is written by the scripts into `public/model/*/report.json`; nothing typed by hand.
- Seeds and all settings are command-line flags with defaults (seed 7).

---

## 10. Limits and future work

**Limits (say them before they're asked):**
1. Test accuracy is not field accuracy: 94.2% → 64.7% on new people.
2. About 5 signers per word in INCLUDE.
3. **Hands only:** no face or body, so signs that differ by facial expression or body position get
   confused.
4. **Isolated signs:** works with a short pause between signs; fluent continuous signing is harder.
5. 70 words (plus spelling and taught signs).
6. The letters set looks like one signer.
7. The signs haven't been reviewed by an ISL teacher.

**Future work (each with a reason):**
- **More signers:** the measured biggest lever.
- **Face and body landmarks** (MediaPipe Holistic): to separate look-alike pairs.
- **Continuous sign recognition** with CTC loss: to read full sentences without pauses.
- **Sign-to-ISL-grammar-to-English** translation: ISL word order differs from English.
- **Speech to sign** (an avatar or clips for the hearing person's reply).
- **Active learning:** users confirm or correct predictions, which become new training data.
- **Quantisation** (int8) for older phones.

---

## 11. The slide deck

Eight slides; keep text short and talk over them.

| # | Slide | Put on it |
| --- | --- | --- |
| 1 | Title | Logo, "Sanket — Where hands speak", name, course, live URL |
| 2 | Problem | Who, where (clinic, counter, emergency), input → output, why deep learning |
| 3 | Data | INCLUDE (70 words, 1,306 videos), letters (41,672 images), splits + leakage prevention, augmentation |
| 4 | Pipeline | The diagram in 3.1: pretrained hand tracker → our features → our CNN/TCN → engine |
| 5 | Model | TCN diagram (dilations 1-2-4-8, residual, attention, 61-frame receptive field) + training settings |
| 6 | Results | Comparison table (6.1), **94.2% vs 64.7%**, confusion matrix, calibration |
| 7 | Beyond accuracy | Few-shot My signs (75.9% / 68% / 4%), real-time engine + DSA, privacy |
| 8 | Limits and next | Section 10 in 5 bullets |

---

## 12. The live demo

The full 8-minute script is in `DEMO_PREP.md` Part C. In short:

1. **Problem** (1 min): the cover page; say section 1.
2. **Data** (1.5 min): slide 3.
3. **Model** (1.5 min): `ml/models.py → dynamic_tcn` or slide 5.
4. **Live inference** (2 min): `/app`, camera on. 2-3 letters, 2-3 words, then drop your hands and
   show that nothing is typed (background class).
5. **Results** (1.5 min): Model lab, the 94.2% vs 64.7% story, look-alike errors.
6. **Limits** (30 s).

Tips: practise your letters and words in Learn first; avoid husband/wife, I/you/she, good
morning/good, doctor, key; face the light; both hands in frame; arm's length from the camera. If
the camera fails, use **Play demo stream** (it runs the same engine on recorded test signs).

---

## 13. Question bank

Short answers you can say out loud. For longer maths answers (backpropagation, Adam, BatchNorm,
LSTM gates, attention, precision/recall, regularisation and more) see `DEMO_PREP.md` Part D (D1-D36).

### 13.1 The basics

**Q: What is your project in one line?**
Real-time Indian Sign Language to text and speech in the browser, using a CNN for letters and a
temporal CNN for words on top of hand landmarks.

**Q: What is the input and output?**
Input: webcam video. Output: a letter, digit or word (with confidence), joined into a sentence and
spoken.

**Q: Which part is deep learning, and which part is yours?**
Three networks run: MediaPipe's palm detector and landmark network (pretrained, Google) and my two
classifiers (trained here). Mine: data pipeline, features, augmentation, both models, training,
evaluation, calibration, export, the real-time engine and few-shot learning.

**Q: Is it just a wrapper around an API?**
No. No external AI API is called for recognition; everything runs locally. The pretrained part only
finds the hand. The classifiers were designed, trained and evaluated in this project.

**Q: What does "Sanket" mean?**
संकेत means "sign" or "signal" in Hindi.

### 13.2 Data

**Q: Why INCLUDE?** Largest public word-level ISL dataset, real signers, CC BY 4.0 licence.

**Q: How many samples?** 1,306 videos for 70 words (928/189/189); 41,672 letter images.

**Q: How did you avoid leakage?** Letters split in capture order; words split by whole video; a
session split for new people; everything tuned on validation, test read once.

**Q: Why not split letters randomly?** Consecutive frames are near-duplicates, so a random split
puts the same picture in train and test and inflates the score.

**Q: What is the background class and where does its data come from?** "No sign". Real frames from
the same videos: rest poses and windows that overlap the sign by IoU ≤ 0.3.

**Q: Did you use synthetic data?** Only augmentation, and only on training data. Test sets are real.

**Q: Is the data balanced?** Roughly: about 19 videos per word. Macro F1 is reported anyway.

**Q: Why only 70 of 263 words?** Chosen for clinic/counter/emergency/home use; fewer classes with
more examples each; download size. More words are a data question, not a code change.

### 13.3 Features and preprocessing

**Q: Why normalise by the wrist and hand size?** So the same sign gives the same numbers wherever the
hand is and however far from the camera.

**Q: Why 132 and 136?** 2 hands × 21 points × 3 = 126, + 3 relation + 3 presence flags = 132. Words
add 4 trajectory values (where each wrist moves) = 136.

**Q: Why aspect correction?** Landmark x and y are fractions of width and height; on a 16:9 frame a
circle would look like an ellipse.

**Q: Why 32 frames?** About a second at 30 fps, enough for most signs; windows of different real
lengths are resampled to 32.

**Q: How do you know the browser computes the same features as Python?** `check_parity.py`:
difference below 1e-5.

### 13.4 Models and training

**Q: Explain your words model.** Section 5.3: Conv1D embedding, 4 dilated residual blocks with
squeeze-excite, attention pooling, Dense 160, softmax 71.

**Q: What is a dilated convolution?** A kernel that skips frames: `y[t] = Σ w[k]·x[t + d·k]`.
Doubling d each block grows the receptive field exponentially: 61 frames with few weights.

**Q: Calculate the receptive field.** 1 + Σ(k−1)·d over all convs = 1 + 2·2·(1+2+4+8) = 61.

**Q: Why residual connections?** `out = x + F(x)`: the gradient always has a direct path, so deeper
stacks train.

**Q: What does squeeze-and-excitation do?** Averages each channel, a small MLP + sigmoid gives a
weight per channel: the network chooses which feature maps matter for this input.

**Q: Why attention pooling and not average pooling?** It can focus on the frames that define the
sign and ignore the movement in and out.

**Q: Why (1, 3) kernels in the letters CNN?** Three neighbouring landmarks are three joints of one
finger, so the filter learns finger shapes; the same filter is shared by both hands.

**Q: Loss function?** Categorical cross-entropy with label smoothing 0.1. Gradient at the output:
`p − y`.

**Q: Why label smoothing?** Stops the model pushing logits to infinity (over-confidence); then
temperature scaling fixes the calibration.

**Q: Why AdamW?** Adam gives each weight its own step size; AdamW applies weight decay directly to
the weights, not through the gradient, so regularisation isn't distorted.

**Q: Why warm-up and cosine decay?** Small steps first while Adam's statistics settle; large steps
in the middle; tiny steps at the end to settle into a minimum.

**Q: Batch size and epochs?** Words 64, up to 120 epochs (stopped at 118 by early stopping).
Letters 256, up to 40.

**Q: How did you choose hyperparameters?** Standard starting points, then compared on validation
(never test). Augmentation strength was the setting that mattered most.

**Q: What is temperature scaling?** One number T fitted on validation: `softmax(z / T)`. Changes
confidence, not the winner. T = 0.82, error 7.3% → 2.7%.

**Q: What is transfer learning in your project?** MediaPipe's networks are used frozen as a feature
extractor; only my classifiers are trained. My signs reuses my TCN's embedding layer the same way.

### 13.5 Model choice (Section 6)

**Q: Why not a CNN on images?** Pixels need far more data to ignore skin, light and background;
1,306 videos would overfit; slow in a browser.

**Q: Why not LSTM?** Measured: BiLSTM 93.7% vs TCN 94.2%, but about 7× slower because it runs
frame by frame. On new people BiLSTM 60.0% vs TCN 64.7%.

**Q: Why not a Transformer?** Measured: worst on new people (57.8%). Attention needs more data
than INCLUDE has.

**Q: Where is R-CNN in your project?** Not on pixels (too slow, and MediaPipe already finds the
hand). Its recipe is used in **time**: propose windows, classify each with a background class
trained by IoU, and remove duplicates with non-maximum suppression.

**Q: Why not YOLO?** It is a detector: it would find a hand box, which MediaPipe already does, and
still needs a temporal model to read the movement.

**Q: Why MediaPipe and not OpenPose?** MediaPipe runs live in the browser on ordinary hardware;
OpenPose is much heavier and not built for that.

**Q: Would a bigger model help?** Measured: no. Five architectures and ensembles all land within a
few videos on new people. The limit is signer variety.

**Q: Why two models instead of one?** Letters are still shapes (one frame, checked every frame);
words are movements (a window). Different inputs suit different networks.

### 13.6 Results and evaluation

**Q: Your accuracy?** 94.2% on held-out videos; 64.7% on new people; letters 99.97% (optimistic).

**Q: Why is new-people accuracy so much lower?** Signer variation with about 5 signers per word.
The right word is still in the top 3 about 87% of the time.

**Q: Why macro F1?** Every word counts equally, so poor words can't hide behind easy ones.

**Q: Show me a wrong prediction and explain it.** Husband vs wife: same hand movement, they differ
by where they are made relative to the face, which the model can't see. Point to the confusion
matrix.

**Q: What is your baseline?** An MLP on the flattened window: 87.8%. It ignores time order.

**Q: Is the model overfitting?** To the training signers, somewhat (the drop on new people).
Controlled by augmentation, dropout, weight decay, label smoothing, early stopping.

**Q: How do you measure the whole system, not just the model?** The stream test feeds held-out
recordings through the real engine: words 56/70, letters 35/35, auto 8/9.

### 13.7 Few-shot ("My signs")

**Q: How can it learn a sign without retraining?** It doesn't change any weights. It embeds the
examples with the trained network, averages them into a prototype, and matches by cosine
similarity.

**Q: How do you stop false matches?** A taught sign must reach 0.80 similarity and be no more than
0.10 below the nearest built-in class. Measured 4% false matches.

**Q: How was it tested?** 15 words held out completely, network retrained on 55, 300 random trials:
75.9% correct, 68% accepted, 4% false.

### 13.8 Real-time engine and DSA

**Q: Which data structures did you use?** Ring buffer, min-heap, trie, hash maps (bigram), LRU
cache (hash map + doubly linked list), finite-state machines. Section 8.

**Q: Why a ring buffer?** O(1) push, fixed memory, no garbage collection 30 times a second (an array
`shift()` is O(n)).

**Q: How does the trie fix spelling mistakes?** Levenshtein distance computed down the trie: words
sharing a prefix share rows of the DP table, and hopeless branches are pruned.

**Q: How does the app know when a sign starts and ends?** Multi-scale windows every 80 ms, the
background class, non-maximum suppression, and the word spotter state machine that commits the peak
and waits for a pause.

**Q: How fast is it?** Each frame is processed once; all windows are classified in one GPU batch;
the camera never waits for a model. The Model lab has a live speed test on your machine.

**Q: What is NMS?** Sort detections by score, keep the best, drop others overlapping it by IoU >
0.3, repeat.

### 13.9 The app, web and deployment

**Q: Where does the model run?** In the browser, TensorFlow.js on the GPU (WebGL). No server.

**Q: How is it deployed?** Static site on Vercel, auto-deployed from GitHub; models are files served
with the site. https://sanket-woad.vercel.app

**Q: Does it need internet?** To load the page the first time. Recognition itself runs locally
(the hand model is served from the site, not a third party).

**Q: How did you convert Keras to TF.js?** A hand-written exporter (`ml/common.py → export_tfjs`),
because the official converter fails on Windows; `check_tfjs.mjs` proves outputs match.

**Q: Is user data safe?** Video never leaves the device; taught signs stay in the browser;
accounts use Supabase with row-level security.

**Q: Why React and TypeScript?** Typed, component-based UI; the engine itself is plain TypeScript
outside React so it is fast and testable.

**Q: Why this design?** Warm henna, cream and terracotta for an Indian identity; terracotta marks
whatever the model is reading right now, matching the hand skeleton; leaf green for links. The logo
सं is the first syllable of संकेत.

### 13.10 "What if" and ethics

**Q: What if two people sign at once?** The tracker follows up to two hands; two people would
confuse it. A future version could track per person.

**Q: What if the lighting is bad?** The app brightens a copy of the frame for the tracker and asks
for more light below a threshold.

**Q: What if someone signs a word not in the vocabulary?** The background class and threshold
usually reject it; they can spell it or teach it in My signs.

**Q: Left-handed signers?** Mirror augmentation in training covers them.

**Q: Could it replace interpreters?** No. It helps with short everyday exchanges; it is not
accurate or complete enough for medical consent, legal matters or long conversations.

**Q: Bias?** Few signers means the model may work worse for people who sign differently (age,
region, speed). Measured on new people for that reason; My signs lets users adapt it.

**Q: If you had 6 more months?** More signers, face and body landmarks, continuous signing with CTC,
user corrections as training data.

### 13.11 Syllabus questions, unit by unit

Section 15 maps every unit to the code. These are the questions that map invites, including the
topics the project does **not** use (have an honest answer ready for those).

**Q: Which units of the course does your project cover?**
All five. Unit I (MLP baseline, backprop, mini-batch gradient descent, momentum in Adam),
Unit II (tensor reshaping, broadcasting, inner products), Unit III (CNN, batch norm, regularisation,
augmentation, initialisation), Unit IV (object detection, R-CNN ideas, ResNet, GoogLeNet) and
Unit V (RNN, deep LSTM, Transformer, latent space).

**Unit I**

**Q: Where are backpropagation and gradient descent in your project?**
Every model is trained by backpropagation with mini-batch stochastic gradient descent: batches of
64 windows (words) or 256 frames (letters), using the AdamW optimiser. The key gradient is p − y at
the softmax output; the chain rule carries it back through every layer.

**Q: Did you use momentum? What about Nesterov?**
Yes. Adam keeps a running average of past gradients (β₁ = 0.9), which is momentum, plus a running
average of squared gradients for a per-weight step size. Nesterov momentum evaluates the gradient
at the look-ahead point instead of the current one, which reduces overshooting; I did not use it
(NAdam would be the Adam version of it).

**Q: Parameters versus hyperparameters in your model?**
Parameters are learned by gradient descent: 435,696 in the words TCN (weights, biases, BatchNorm
scales). Hyperparameters are chosen by me on the validation set: learning rate 2e-3, batch 64,
dilations 1-2-4-8, dropout 0.4, label smoothing 0.1, window 32 frames, and the few-shot threshold 0.80.

**Q: What is a McCulloch-Pitts neuron and how does it relate to your network?**
A fixed-weight threshold unit: output 1 if Σ wᵢxᵢ ≥ θ, else 0 (a step function). Modern neurons replace
the step with a differentiable activation (ReLU, sigmoid) so gradients can flow. The app still makes a
step decision at the end: it accepts a letter only above 70% confidence.

**Q: What is SVD? Did you use it?**
Any matrix factors as A = U Σ Vᵀ (rotations U and V, singular values Σ). Keeping the largest singular
values gives the best low-rank approximation; PCA is SVD of centred data. Not used: to picture the
160-d embedding space in the Model lab I used t-SNE, which keeps local neighbourhoods better than a
linear projection. SVD could compress the embeddings or the 136 features if memory mattered.

**Unit II**

**Q: Where do you use tensor reshaping?**
The 132 features of a frame are reshaped to a 2 × 22 × 3 tensor (hand × landmark × xyz), so a 2-D
convolution can slide along a finger. Word windows are rank-3 tensors [batch, 32, 136].

**Q: Where do you use broadcasting?**
Normalisation: the wrist point (shape [..., 1, 3]) is subtracted from all 21 points ([..., 21, 3]) and
the result divided by the hand size ([..., 1, 1]) in one step, without loops (`ml/features.py`, the
`keepdims=True` lines).

**Q: Where is the inner product used?**
Every Dense layer is a matrix product Wx. And the few-shot matcher compares a live sign with a taught
one by the dot product of two unit vectors, which is cosine similarity.

**Q: How do you visualise what the network learned?**
The Model lab shows training curves, a confusion matrix and a t-SNE map of the embedding layer; Learn
has a "What the model sees" overlay of the landmarks.

**Unit III**

**Q: What is Hebbian learning? Is it in your project?**
"Neurons that fire together wire together": Δw = η·x·y, an unsupervised rule that strengthens a weight
when its input and output are active together. Not used: my models learn by error correction
(backpropagating a loss), which needs labels but learns far better features.

**Q: Error-correction versus competitive learning?**
Error correction changes weights in proportion to the error (target − output): that is how the
networks are trained. Competitive learning lets units compete so only the winner responds
(winner-take-all). The closest thing in Sanket is the few-shot matcher: the nearest prototype wins,
and only if it beats the built-in classes by the margin.

**Q: What is Boltzmann learning?**
Learning in stochastic, energy-based networks (Boltzmann machines): units switch on with a probability
given by an energy function, and weights move so the network's statistics match the data's. Not used:
it is slow to train and suits generative modelling, not this classification task.

**Q: How are your weights initialised?**
Keras's default Glorot (Xavier) uniform, variance 2 / (fan_in + fan_out), which keeps activations at a
stable scale through the layers. The Transformer's query projection uses a smaller VarianceScaling
(1/d_k) so the attention softmax does not saturate early.

**Q: 2-D or 3-D convolution?**
The letters CNN is a 2-D convolution over the 2 × 22 × 3 hand grid; the words model is a 1-D (temporal)
convolution. 3-D convolution (over x, y and time on video, like I3D) was considered and rejected: too
heavy to run live in a browser and too data-hungry for 1,306 videos.

**Unit IV**

**Q: Is there object detection in your project?**
Yes: on every video frame, MediaPipe's palm detector, a pretrained single-shot detector in the same
family as SSD and YOLO, finds the hands; a second network then regresses 21 landmarks inside each box.
It is used frozen (transfer learning), like lab experiment 5.

**Q: Where are R-CNN's ideas used?**
In time instead of space: windows of several lengths are proposed (region proposals), each is
classified with a background class trained by IoU labelling, and non-maximum suppression keeps one
detection per sign.

**Q: Where are ResNet and GoogLeNet?**
Both models are built from residual blocks (ResNet's out = x + F(x)). GoogLeNet's Inception module was
rebuilt along time (`dynamic_inception`: parallel 1-, 3- and 5-wide convolutions) and compared: 60.0% on
new people versus 64.7% for the shipped TCN.

**Q: Is there segmentation?**
Not pixel segmentation: landmarks make it unnecessary. The temporal equivalent is there: each training
video's active segment (when the hands are raised) is found from wrist height, and windows are labelled
by their overlap with it.

**Q: Why not RetinaNet's focal loss?**
Focal loss down-weights easy examples to cope with extreme imbalance (thousands of background boxes per
object). My classes are roughly balanced (about 19 videos per word) and background windows are sampled
at a controlled rate, so cross-entropy with label smoothing was enough.

**Unit V**

**Q: Which deep learning packages and architectures?**
TensorFlow / Keras for training, TensorFlow.js in the browser, MediaPipe for hand tracking.
Architectures: MLP, 2-D CNN, dilated TCN, GRU, 2-layer bidirectional LSTM, Inception-TCN, Transformer.

**Q: Did you build a deep RNN?**
Yes: the BiLSTM baseline stacks two bidirectional LSTM layers. 93.7% on held-out videos, but about
7× slower than the TCN, which processes all frames in parallel.

**Q: Where are tanh and the step function?**
tanh squashes the candidate state inside every LSTM and GRU cell (sigmoid gates decide how much of it
to keep). The step function is the McCulloch-Pitts activation; the app's confidence gate is a step
decision on top of the network.

**Q: Where is latent space in your project?**
The 160-number embedding layer of the TCN is a learned latent space: similar signs land close together.
My signs works entirely in it (prototypes and cosine similarity), and the Model lab draws it with t-SNE.

**Q: Why no GAN or VAE?**
The task is discriminative (which sign is this?), not generative. A VAE or GAN could synthesise landmark
sequences of new "signers" to fight the main weakness (few signers), but synthetic data can teach the
model unrealistic motion; I would accept it only if accuracy on real, held-out signers went up. That is
a good future experiment.

**Q: Which lab experiments does your project cover?**
1 (a basic network in TensorFlow: the MLP baseline), 2 (a CNN classifier: the letters CNN), 4 (recurrent
networks on sequences: GRU, BiLSTM), 5 (a pretrained detector on a video stream: the palm detector),
7 (digit recognition: digits 1-9), 10 (transfer learning: frozen MediaPipe features), and partly
8 (attention: attention pooling, squeeze-and-excitation and a self-attention Transformer compared).
Not covered: facial recognition and GANs.

### 13.12 If you don't know

Say: "I haven't measured that. I'd expect X because Y, and I'd test it by Z." It shows method, and
examiners respect it more than a guess.

---

## 14. Glossary

| Term | Plain meaning |
| --- | --- |
| **Landmark** | A tracked point on the hand (wrist, each finger joint): 21 per hand |
| **Feature** | A number fed to the model; here 132 or 136 per frame |
| **CNN** | Convolutional neural network: small filters reused across positions (weight sharing) |
| **TCN** | Temporal convolutional network: a CNN that slides along time |
| **Dilation** | Spacing between kernel taps, so a filter sees further back in time |
| **Receptive field** | How many input frames one output can "see" |
| **Residual connection** | Adding a layer's input to its output, so gradients flow easily |
| **BatchNorm** | Rescaling activations per channel to keep training stable |
| **Dropout** | Randomly switching off units in training to prevent over-reliance |
| **Squeeze-and-excitation** | Learned per-channel weights: channel attention |
| **Attention pooling** | A learned weighted average over time |
| **Softmax** | Turns scores into probabilities that sum to 1 |
| **Cross-entropy** | The loss: −log of the probability given to the right answer |
| **Label smoothing** | Training towards 0.9 instead of 1.0 for the right class |
| **AdamW** | An optimiser with per-weight step sizes and decoupled weight decay |
| **Learning rate schedule** | How the step size changes over training (warm-up, cosine decay) |
| **Early stopping** | Stop when validation stops improving; keep the best epoch |
| **Augmentation** | Making varied training samples from existing ones |
| **Leakage** | Test information sneaking into training |
| **Macro F1** | F1 score averaged equally over classes |
| **Top-3 accuracy** | The right answer is among the 3 highest guesses |
| **Calibration** | Whether "90% sure" is right 90% of the time |
| **Temperature scaling** | One number that fixes calibration without changing predictions |
| **IoU** | Intersection over union: overlap ÷ total span of two intervals |
| **NMS** | Non-maximum suppression: keep the best detection, drop overlapping ones |
| **Background class** | A "no sign" output so the model isn't forced to guess |
| **Transfer learning** | Reusing a network trained on one task as a starting point or feature extractor |
| **Embedding** | A learned vector that describes an input; similar inputs land close together |
| **Prototypical network** | Few-shot method: average a class's embeddings, classify by nearest average |
| **Cosine similarity** | How aligned two vectors are (1 = same direction) |
| **Open-set rejection** | Saying "none of these" when the input matches no known class well |
| **TF.js** | TensorFlow for JavaScript: runs models in the browser |
| **WebGL** | The browser's GPU interface that TF.js uses |
| **Ring buffer** | Fixed-size array where new data overwrites the oldest |
| **Trie** | Prefix tree for fast word completion |
| **Levenshtein distance** | Fewest edits to turn one word into another |
| **FSM** | Finite-state machine: a small set of states and rules for moving between them |

---

## 15. Course plan map: every unit in the project

Course plan: Deep Learning, CSAI3027P (UPES, 2026-27). Every unit has at least two topics implemented
and measured in Sanket. Topics marked *not used* have a prepared answer in section 13.11.

### Unit I: neural network foundations (CO1)

| Syllabus topic | Where it is in Sanket | File |
| --- | --- | --- |
| Multilayer perceptrons, feed-forward networks | MLP baselines for words (87.8%) and letters; dense layers in every model | `ml/models.py` (`dynamic_mlp`, `static_mlp`) |
| Backpropagation, gradient descent, stochastic GD | Mini-batch training by backpropagation, batch 64 / 256 | `ml/train_dynamic.py`, `ml/train_static.py` |
| Momentum-based GD | Adam's first moment (β₁ = 0.9) is momentum; AdamW optimiser | `ml/common.py` (`make_optimizer`) |
| Sigmoid neurons | Sigmoid gates in the squeeze-and-excitation blocks | `ml/models.py` |
| Parameters vs hyperparameters | 435,696 learned parameters vs learning rate, batch, dilation, dropout and threshold chosen on validation | section 5.4 |
| McCulloch-Pitts neuron, step function | The confidence gate is a threshold decision | `src/engine/spotter.ts` |
| Nesterov GD, SVD | *not used* | |

### Unit II: the maths of deep learning in code (CO1)

| Syllabus topic | Where it is in Sanket | File |
| --- | --- | --- |
| Operations with tensors, morphing shapes | 132 features reshaped to 2 × 22 × 3; windows as [batch, 32, 136] | `ml/features.py` |
| Array broadcasting | Wrist subtracted from all 21 points and divided by hand size in one step | `ml/features.py` (`keepdims=True`) |
| Scalar / inner product | Dense layers (Wx); cosine similarity of unit embeddings | `src/engine/fewshot.ts` (`dot`) |
| Matrix magic, computation in a network | All candidate windows classified in one batched GPU pass | `src/engine/model.ts` |
| Programmatic expression of the maths | The same feature maths in Python and TypeScript, checked to 1e-5 | `ml/check_parity.py` |
| Gradient calculation | Automatic differentiation in TensorFlow; softmax + cross-entropy gives p − y | training scripts |
| Visualising deep learning | Training curves, confusion matrix, t-SNE of embeddings, landmark overlay | Model lab, Learn |

### Unit III: learning, CNNs and training practice (CO2)

| Syllabus topic | Where it is in Sanket | File |
| --- | --- | --- |
| Error-correction learning | Supervised training with cross-entropy | training scripts |
| Competitive learning | Nearest-prototype matching in My signs (winner-take-all, with a margin) | `src/engine/fewshot.ts` |
| Pattern recognition | The whole task: 70 word signs and 35 letters | |
| Neurons, weights, biases, transfer and loss functions | ReLU, sigmoid, softmax; cross-entropy with label smoothing 0.1 | `ml/models.py` |
| Generalisation and overfitting | Session split (94.2% → 64.7%), early stopping, training curves | section 7 |
| GD and optimisers | AdamW, 5% warm-up then cosine decay, gradient clipping | `ml/common.py` |
| Parameter initialisation, hyperparameter tuning | Glorot uniform; scaled query initialisation in the Transformer; tuning on validation | `ml/models.py` |
| Batch normalisation, regularisation | BatchNorm in every block; dropout, spatial dropout, weight decay, label smoothing | `ml/models.py` |
| Data and label preparation | Landmark extraction, hand slots, IoU labelling of windows, background class | `ml/extract_include.py`, `ml/augment.py` |
| Data augmentation | Mirror, rotation, tilt, scale, jitter, time warp, movement size | `ml/augment.py` |
| CNN, 2-D convolution | Letters 2-D CNN on the hand grid; temporal 1-D CNN for words | `ml/models.py` |
| 3-D convolution | Considered (I3D-style) and rejected: too heavy and too data-hungry | section 6.2 |
| Deep neural networks | 4-block residual TCN with attention | `ml/models.py` (`dynamic_tcn`) |
| Hebbian, Boltzmann learning | *not used* | |

### Unit IV: vision architectures (CO3)

| Syllabus topic | Where it is in Sanket | File |
| --- | --- | --- |
| Image classification | Letter images classified through their landmarks; MediaPipe's landmark CNN | `ml/extract_static.py`, `ml/train_static.py` |
| Object detection | MediaPipe's single-shot palm detector on every video frame | `src/hooks/useLiveLoop.ts` |
| R-CNN, Fast / Faster R-CNN | Their recipe in time: window proposals, background class by IoU, non-maximum suppression | `ml/augment.py`, `src/engine/spotter.ts` |
| YOLO | The same single-shot idea as the palm detector; why not trained here: section 13.5 | |
| ResNet | Residual blocks in both models | `ml/models.py` (`residual_block`) |
| GoogLeNet | Inception module along time, compared (60.0% on new people) | `ml/models.py` (`dynamic_inception`) |
| Segmentation | Temporal: each video's active segment found from wrist height | `ml/extract_include.py` |
| RetinaNet | *not used* (classes are balanced, so no focal loss needed) | |

### Unit V: sequence and generative models (CO4)

| Syllabus topic | Where it is in Sanket | File |
| --- | --- | --- |
| DL packages, important architectures | TensorFlow / Keras, TensorFlow.js, MediaPipe; seven architectures compared | `ml/models.py` |
| RNN, deep RNN, LSTM | GRU and a 2-layer bidirectional LSTM, trained and compared | `ml/models.py` (`dynamic_gru`, `dynamic_bilstm`) |
| Tanh and step functions | tanh inside LSTM / GRU cells; a step decision in the confidence gate | |
| Transformers | Self-attention Transformer built from Dense / Dot / Softmax, compared (57.8%) | `ml/models.py` (`dynamic_transformer`) |
| Latent space | The 160-d embedding, used for few-shot learning and drawn with t-SNE | `src/engine/fewshot.ts`, Model lab |
| VAE, GAN, recursive networks | *not used* (generative; future work for synthetic signers) | |

### Lab experiments

| Experiment | In Sanket |
| --- | --- |
| 1. Basic neural network in TensorFlow | MLP baseline, trained in Keras |
| 2. CNN for image classification | Letters CNN (99.97%) |
| 3. Fine-tune a pretrained CNN | Partly: MediaPipe is used frozen (feature extraction, not fine-tuning) |
| 4. RNN on sequence data | GRU and BiLSTM on landmark sequences |
| 5. Pretrained object detector on video | MediaPipe palm detector on the live webcam |
| 6. Facial recognition | Not covered |
| 7. Digit recognition | Digits 1-9 in the letters model (the syllabus list also has "Hand movement recognition": the whole project) |
| 8. Attention mechanisms compared | Partly: attention pooling, squeeze-and-excitation, self-attention Transformer |
| 9. Synthetic data with GANs | Not covered (future work) |
| 10. Transfer learning | Frozen MediaPipe features; My signs reuses the TCN's embedding |

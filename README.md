# Sanket

Sanket — Where Hands Speak. A deep learning app that reads Indian Sign Language (ISL) from a webcam and turns it into text and speech in real time, to help deaf and hard-of-hearing people communicate in hospitals, at public counters, in emergencies, and at home.

University Deep Learning course project (UPES, CSAI3027P): a sign language recognition system built with TensorFlow and convolutional neural networks.

**Read [`docs/ALGORITHMS.md`](docs/ALGORITHMS.md) for every deep learning concept, data structure and algorithm used, with results.**

## What's in the app

- **Translate** (`/app`): the camera with a live hand overlay, a "now reading" board with the top three candidates, and a sentence that builds as you sign. Three modes: Words (70 word signs), Letters (A-Z and 1-9 for spelling), and Auto. Suggestions complete the word you are spelling and predict the next word. Speak says the sentence aloud; Caption speech turns the other person's voice into text.
- **Learn**: pick a sign, watch a real signer's hand movement (a recording from the test set), copy it on camera, and the model tells you when it reads it.
- **Model lab**: the pipeline, test metrics, training curves, confusion matrix, architecture comparison, a t-SNE plot, a live speed benchmark, and interactive demos of the trie and edit-distance table.
- **SOS**: press and hold (or make the Signal for Help on camera), get a 5-second countdown to cancel, then a full-screen "I am deaf and I need help" alert with Call 112, your location and your saved contacts. SMS is not sent automatically.
- **Demo stream**: every camera view can replay recorded landmarks through the same engine, so the whole pipeline can be shown without a webcam.
- **Accounts** (optional): sign up, log in, profile, emergency contacts. The translator works without one.

## Run the app

Prerequisites: Node.js 22+ and a browser with webcam access (Chrome or Edge recommended for speech recognition).

```bash
npm install
npm run dev
```

Then open http://localhost:3000. The trained models are already in `public/model/`.

Other scripts: `npm run build`, `npm run lint` (type check), `npm test` (unit tests, plus an end-to-end test that streams recordings through the engine; that one takes several minutes).

## How it works

```
camera → MediaPipe (21 landmarks per hand) → features → ring buffer
       → letters CNN (every frame)  → hold gate          ┐
       → words temporal CNN (windows) → peak suppression ┴→ sentence → suggestions → speech
```

- `src/engine/` is the recognition engine: plain TypeScript, no framework, unit-tested. Features, ring buffer, min-heap, trie, LRU cache, bigram model, the letter gate and the word spotter.
- `src/hooks/useLiveLoop.ts` runs it once per camera frame; `src/components/app/CameraStage.tsx` is the camera view.
- `docs/preprocessing.md` is the feature spec shared by the browser and the training code.

## Train the models yourself

Prerequisites: Python 3.11 and about 20 GB of free disk.

```bash
cd ml
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

| Step | Command | Time on a laptop CPU |
| --- | --- | --- |
| 1. Download the 70 chosen words from INCLUDE (16.9 GB) | `python include_remote.py download --words-file vocab_words.txt` | about 1 hour |
| 2. Videos → landmarks | `python extract_include.py` then `python extract_include.py --collect` | about 30 min |
| 3. Letter images → landmarks (put the parquet in `data/raw/isl_static/`) | `python extract_static.py` | about 10 min |
| 4. Train baselines | `python train_dynamic.py --model bilstm` (also `gru`, `mlp`), `python train_static.py --model mlp --aug 1.5` | about 25 min each for words |
| 5. Train and export the shipped models | `python train_dynamic.py`, `python train_static.py --mixup 0 --aug 1.5` | 25 min, 8 min |
| 6. Export the example recordings | `python export_exemplars.py` | 1 min |
| 7. Check | `python check_parity.py`, `node check_tfjs.mjs static`, `node check_tfjs.mjs dynamic` | 1 min |

Step 5 writes `public/model/static/` and `public/model/dynamic/`; reload the app and it uses them. Train the baselines first so the comparison table in the report includes them.

## Datasets and credit

- **Words**: [INCLUDE](https://zenodo.org/records/4010759), AI4Bharat, licensed CC BY 4.0. 70 of its 263 words are used.
- **Letters and digits**: the 35-class ISL image set published on Hugging Face as `Hemg/Indian_sign_language_dataset`. It has no stated licence, so treat the letters model as coursework only.
- **Hand tracking**: MediaPipe HandLandmarker.

Raw data and landmark files are not in this repository (`ml/data/` is git-ignored). `dataset/American Hand Signs Dataset.zip` is an older, unused ASL set that is also too large for GitHub.

## Limits

Test accuracy is measured on held-out data from the same datasets, so a new signer on a webcam will score lower. The models use hands only, were trained on isolated signs, and the signs have not been reviewed by an ISL teacher. The full list is in [`docs/ALGORITHMS.md`](docs/ALGORITHMS.md#8-limits).

## Accounts setup (Supabase)

Accounts are optional; without this the app runs in guest mode.

1. Create a free project at [supabase.com](https://supabase.com).
2. In the dashboard, open **SQL Editor** and run [`supabase/migrations/20261015000000_accounts.sql`](supabase/migrations/20261015000000_accounts.sql).
3. Under **Authentication → URL Configuration**, set the Site URL to `http://localhost:3000` and add `http://localhost:3000/**` to the redirect URLs.
4. Copy `.env.example` to `.env.local` and fill in the project URL and anon key.
5. Restart `npm run dev`.

## Tech stack

React, TypeScript, Tailwind CSS, Vite · MediaPipe Tasks Vision · TensorFlow (training) and TensorFlow.js (browser) · Web Speech API · Supabase

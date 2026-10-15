# Sanket
Sanket — Where Hands Speak. A deep learning app that translates Indian Sign Language (ISL) into text and speech in real time, to help deaf and hard-of-hearing people communicate in hospitals, at public counters, in emergencies, and at home.

University Deep Learning course project (UPES, CSAI3027P): a sign language recognition system built with TensorFlow and convolutional neural networks.

## What's in the app

- **Landing page** (`/`): a logo-forming startup animation, a hero, and a draggable 3D sphere of sign and place cards with a grid view and lightbox.
- **Home** (`/app`): a bento dashboard with the conversation entry point, the next lesson (turning 3D hand), today's signs, streak, SOS readiness, recent signs and a week waveform. Activity is stored only in the browser.
- **Converse**: a full-bleed camera stage with a live sign capsule and hold ring, plus a chat-style thread: your signed sentences on one side, the hearing person's speech as large captions on the other. Quick phrases speak instantly.
- **Learn**: watch an animated 3D hand demonstrate each sign (drag to rotate, slow motion, left-handed mirror, body silhouette, skin tones), then copy it on camera and watch the match ring fill.
- **SOS**: press and hold (or make the SOS sign), get a 5-second countdown to cancel, then a high-contrast "I am deaf and need help" screen with Call 112, your location and your saved contacts. SMS is not sent automatically yet.
- **Accounts** (optional): sign up, log in, email confirmation, password reset, profile, emergency contacts, change email/password, delete account. The translator works without an account.

## Run locally

Prerequisites: Node.js 20+ and a browser with webcam access (Chrome or Edge recommended for speech recognition).

```bash
npm install
npm run dev
```

Then open http://localhost:3000. Other scripts: `npm run build`, `npm run lint` (type check).

## Accounts setup (Supabase)

Accounts are optional; without this the app runs in guest mode.

1. Create a free project at [supabase.com](https://supabase.com).
2. In the dashboard, open **SQL Editor** and run [`supabase/migrations/20261015000000_accounts.sql`](supabase/migrations/20261015000000_accounts.sql). It creates the `profiles` and `emergency_contacts` tables with row-level security and a `delete_account()` function.
3. Under **Authentication → URL Configuration**, set the Site URL to `http://localhost:3000` (and later your deployed URL) and add `http://localhost:3000/**` to the redirect URLs.
4. Copy `.env.example` to `.env.local` and fill in the project URL and anon key from **Project Settings → API**.
5. Restart `npm run dev`.

## Status

- The recognition model is not trained yet. Until it is, a rule-based **mock predictor** runs behind the same interface, so the whole flow works. Its confidence values are simulated, not measured.
- The 3D lessons in [`src/data/signAnimations.ts`](src/data/signAnimations.ts) follow the demo vocabulary and **have not been reviewed by an ISL signer**. Check them against the ISLRTC dictionary or with an ISL teacher before relying on them. Each lesson can also take a real reference video (`videoUrl`).

## How it works

- `src/lib/preprocess.ts` turns MediaPipe landmarks into model input, following [`docs/preprocessing.md`](docs/preprocessing.md) (the shared spec for the Python training code).
- `src/lib/predictor.ts` defines the `Predictor` interface with a `MockPredictor` and a `TfjsPredictor` that loads `public/model/{model.json, labels.json, config.json}`.
- `src/lib/stability.ts` accepts a sign only after it is held above 80% confidence for one second, and won't repeat it until the hand changes.
- `src/lib/handModel.ts` and `src/lib/hand3d.ts` are the 3D hand: shapes are authored as joint angles and rendered with three.js.

## Tech stack

React, TypeScript, Tailwind CSS, Vite, motion · MediaPipe Tasks Vision · TensorFlow.js · three.js · Web Speech API · Supabase

## Dataset

`dataset/American Hand Signs Dataset.zip` (392 MB) is not included in this repo because it exceeds GitHub's 100 MB file limit. Note that it is an American Sign Language dataset; ISL data (for example the AI4Bharat INCLUDE dataset) is still needed for the final model.

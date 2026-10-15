# Sanket
Sanket — Where Hands Speak. A deep learning app that translates Indian Sign Language (ISL) into text and speech in real time, to help deaf and hard-of-hearing people communicate in hospitals, at public counters, in emergencies, and at home.

University Deep Learning course project (UPES, CSAI3027P): a sign language recognition system built with TensorFlow and convolutional neural networks.

## Modes

- **Conversation**: webcam with hand landmarks, the predicted sign with its confidence, a sentence builder with text-to-speech, speech-to-text captions for the hearing person, and quick phrase tiles.
- **SOS**: an emergency screen with a 5-second cancel countdown and the user's location. Messages are not actually sent yet.
- **Learn**: practise a target sign and get a match score.

## Run locally

Prerequisites: Node.js 20+ and a browser with webcam access (Chrome or Edge recommended for speech recognition).

```bash
npm install
npm run dev
```

Then open http://localhost:3000.

Other scripts: `npm run build` (production build), `npm run lint` (type check).

## Status

The recognition model is not trained yet. Until it is, the app uses a rule-based **mock predictor** behind the same interface, so the full camera → landmarks → prediction → sentence → speech flow can be tested. Its confidence values are simulated, not measured.

## Tech stack

- React, TypeScript, Tailwind CSS, Vite
- MediaPipe Tasks Vision (HandLandmarker) for in-browser hand landmarks
- TensorFlow.js to run the trained classifier
- Web Speech API for text-to-speech and speech-to-text

## Dataset

`dataset/American Hand Signs Dataset.zip` (392 MB) is not included in this repo because it exceeds GitHub's 100 MB file limit.

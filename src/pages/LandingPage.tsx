import React, { useEffect, useState } from 'react';
import { ArrowRight, Camera, GraduationCap, Mic, Siren } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { SanketMark, Wordmark } from '../components/Logo';
import { Link } from '../lib/router';

interface Numbers {
  words: number;
  wordAccuracy: number;
  letters: number;
  letterAccuracy: number;
}

/** Headline numbers come from the training reports, so the page can never drift from the models. */
function useNumbers(): Numbers | null {
  const [numbers, setNumbers] = useState<Numbers | null>(null);
  useEffect(() => {
    const base = `${import.meta.env.BASE_URL}model/`;
    const get = (name: string) =>
      fetch(`${base}${name}/report.json`).then((r) => (r.ok && r.headers.get('content-type')?.includes('json') ? r.json() : Promise.reject()));
    Promise.all([get('dynamic'), get('static')]).then(
      ([d, s]) =>
        setNumbers({
          words: d.labels.length - 1,
          wordAccuracy: d.test.word_accuracy,
          letters: s.labels.filter((l: string) => !l.startsWith('_')).length,
          letterAccuracy: s.test.accuracy,
        }),
      () => setNumbers(null)
    );
  }, []);
  return numbers;
}

const FEATURES = [
  {
    icon: Camera,
    title: 'Sign, and it speaks',
    hindi: 'इशारा करें, यह बोलेगा',
    text: 'Word signs and fingerspelling are read from your webcam and joined into a sentence. One key says it aloud.',
  },
  {
    icon: Mic,
    title: 'They speak, you read',
    hindi: 'वे बोलें, आप पढ़ें',
    text: "The other person's speech becomes large captions next to your sentence, so the conversation goes both ways.",
  },
  {
    icon: GraduationCap,
    title: 'Learn the signs',
    hindi: 'इशारे सीखें',
    text: "Watch a real signer's hand movement, copy it on camera, and the model tells you when it reads the sign.",
  },
  {
    icon: Siren,
    title: 'SOS without a voice',
    hindi: 'बिना आवाज़ के मदद',
    text: 'Hold one button, or make the Signal for Help, to show an alert with your location and emergency contacts.',
  },
];

const STEPS = [
  ['01', 'Find the hands', 'A pretrained detector and landmark network (MediaPipe) return 21 points per hand. Video never leaves your device.'],
  ['02', 'Normalise', 'Each hand is moved to the origin and scaled, so position and distance from the camera stop mattering.'],
  ['03', 'Classify', 'A 2-D CNN reads letters from one frame. A dilated temporal CNN reads words from the last second of movement.'],
  ['04', 'Decide', 'A hold gate and peak-picking turn noisy per-frame guesses into one committed sign, then a trie suggests the word.'],
];

export default function LandingPage() {
  const { user, enabled } = useAuth();
  const numbers = useNumbers();
  const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

  return (
    <div className="min-h-dvh">
      <header className="border-b-2 border-ink">
        <div className="mx-auto flex h-14 max-w-[1300px] items-center justify-between px-[var(--pad)]">
          <Link to="/" className="flex items-center gap-2.5" aria-label="Sanket home">
            <SanketMark className="h-8 w-8" />
            <Wordmark className="text-[26px]" />
          </Link>
          <nav className="flex items-center gap-2">
            {enabled && (
              <Link to={user ? '/account' : '/login'} className="btn btn-bare btn-sm">
                {user ? 'Account' : 'Log in'}
              </Link>
            )}
            <Link to="/app" className="btn btn-ink btn-sm">
              Open translator <ArrowRight className="h-4 w-4" />
            </Link>
          </nav>
        </div>
      </header>

      <main>
        {/* Hero: a station name board */}
        <section className="border-b-2 border-ink bg-signal">
          <div className="mx-auto grid max-w-[1300px] gap-8 px-[var(--pad)] py-[clamp(36px,7vw,88px)] lg:grid-cols-[1.5fr_1fr] lg:items-end">
            <div>
              <p className="tag">Indian Sign Language → text and speech · in your browser</p>
              <h1 className="display mt-4 text-[clamp(64px,13vw,190px)]">
                Where hands
                <br />
                speak.
              </h1>
              <p className="deva mt-3 text-[clamp(26px,4.4vw,56px)] font-extrabold leading-tight">जहाँ हाथ बोलते हैं।</p>
            </div>
            <div>
              <p className="max-w-[40ch] text-[19px] leading-snug">
                Sanket reads ISL signs from a webcam and says them aloud, so deaf and hard-of-hearing people can be
                understood at the clinic, the counter and at home.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                <Link to="/app" className="btn btn-ink !min-h-[54px] px-6 text-[17px]">
                  Start translating <ArrowRight className="h-5 w-5" />
                </Link>
                <Link to="/app?view=learn" className="btn !min-h-[54px] px-6 text-[17px]">
                  Learn signs
                </Link>
              </div>
              <p className="tag mt-4">No install · no account needed · video stays on your device</p>
            </div>
          </div>
        </section>

        {/* Numbers, straight from the training reports */}
        <section className="border-b-2 border-ink bg-ink text-paper">
          <dl className="mx-auto grid max-w-[1300px] grid-cols-2 px-[var(--pad)] md:grid-cols-4">
            {[
              [numbers ? String(numbers.words) : '70', 'word signs', 'INCLUDE dataset'],
              [numbers ? pct(numbers.wordAccuracy) : '–', 'word test accuracy', 'held-out videos'],
              [numbers ? String(numbers.letters) : '35', 'letters and digits', 'for fingerspelling'],
              [numbers ? pct(numbers.letterAccuracy) : '–', 'letter test accuracy', 'held-out images'],
            ].map(([value, label, note], i) => (
              <div key={label} className={`py-5 ${i % 2 ? 'pl-4' : ''} ${i ? 'md:border-l-2 md:border-paper/25 md:pl-5' : ''}`}>
                <dd className="display text-[clamp(44px,6vw,80px)] text-signal">{value}</dd>
                <dt className="mt-1 text-[16px] font-semibold">{label}</dt>
                <p className="tag text-paper/55">{note}</p>
              </div>
            ))}
          </dl>
        </section>

        <section className="mx-auto max-w-[1300px] px-[var(--pad)] py-[clamp(32px,6vw,72px)]">
          <h2 className="display text-[clamp(40px,6vw,76px)]">Four things it does</h2>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map(({ icon: Icon, title, hindi, text }) => (
              <article key={title} className="plate flex flex-col p-4">
                <Icon className="h-8 w-8" strokeWidth={1.75} />
                <h3 className="mt-4 text-[22px] font-bold leading-tight">{title}</h3>
                <p className="deva text-[15px] font-semibold text-mute">{hindi}</p>
                <p className="mt-3 text-[15.5px] leading-snug">{text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="border-y-2 border-ink bg-card">
          <div className="mx-auto max-w-[1300px] px-[var(--pad)] py-[clamp(32px,6vw,72px)]">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <h2 className="display text-[clamp(40px,6vw,76px)]">How it works</h2>
              <Link to="/app?view=lab" className="link text-[16px]">
                See the models, metrics and algorithms
              </Link>
            </div>
            <ol className="mt-6 grid gap-x-6 gap-y-5 md:grid-cols-2 lg:grid-cols-4">
              {STEPS.map(([n, title, text]) => (
                <li key={n} className="border-t-[6px] border-ink pt-3">
                  <p className="num text-[13px] font-semibold text-mute">{n}</p>
                  <h3 className="display mt-1 text-[30px]">{title}</h3>
                  <p className="mt-2 text-[15.5px] leading-snug">{text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="mx-auto max-w-[1300px] px-[var(--pad)] py-[clamp(32px,6vw,64px)]">
          <div className="grid gap-6 md:grid-cols-[1fr_1.2fr]">
            <h2 className="display text-[clamp(34px,5vw,60px)]">What to know before you rely on it</h2>
            <ul className="space-y-3 text-[16.5px] leading-snug">
              <li className="border-l-[6px] border-signal pl-3">
                The accuracy figures are measured on held-out data from the same datasets. A new signer, camera or room
                will score lower, so check the sentence on screen before you speak it.
              </li>
              <li className="border-l-[6px] border-signal pl-3">
                The vocabulary is {numbers?.words ?? 70} words plus letters and digits. Anything else is spelled or tapped from the
                suggestions.
              </li>
              <li className="border-l-[6px] border-signal pl-3">
                SOS shows an alert and your location on this screen. It does not send SMS or call anyone by itself.
              </li>
            </ul>
          </div>
        </section>
      </main>

      <footer className="border-t-2 border-ink">
        <div className="mx-auto flex max-w-[1300px] flex-wrap items-center justify-between gap-3 px-[var(--pad)] py-5 text-[14px] text-mute">
          <p>Sanket · Deep Learning course project (CSAI3027P), UPES</p>
          <p>
            Word data: INCLUDE, AI4Bharat (CC BY 4.0) · Hand tracking: MediaPipe · Models: TensorFlow / TensorFlow.js
          </p>
        </div>
      </footer>
    </div>
  );
}

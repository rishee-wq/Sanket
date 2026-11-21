import React, { useEffect, useState } from 'react';
import { ArrowRight, ArrowUpRight, FlaskConical, GraduationCap, Hand, Mic, Siren, Video } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { Intro, shouldShowIntro } from '../components/Intro';
import { SanketMark, Wordmark } from '../components/Logo';
import { LiveDemo } from '../components/cover/LiveDemo';
import { WORDS } from '../data/vocabulary';
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

const STEPS = [
  ['See', 'देखना', 'MediaPipe finds each hand in the webcam frame and returns 21 points per hand. The video never leaves your device.'],
  ['Measure', 'मापना', 'Each hand is centred on its wrist and scaled to its own size: 136 numbers a frame that ignore where you stand.'],
  ['Read', 'पढ़ना', 'A 2-D CNN reads letters from one frame. A dilated temporal CNN reads words from the last second of movement.'],
  ['Speak', 'बोलना', 'A state machine decides when a sign really ended, a trie suggests the next word, and the sentence is spoken aloud.'],
];

const FEATURES = [
  { icon: Video, title: 'Translate', hindi: 'अनुवाद', text: 'Sign words or spell letters; the sentence builds as you go and one key says it aloud.', to: '/app' },
  { icon: Mic, title: 'Caption speech', hindi: 'बोली को शब्दों में', text: 'The other person speaks, and their words appear as large captions beside yours.', to: '/app' },
  { icon: GraduationCap, title: 'Learn', hindi: 'सीखें', text: 'Words from a real signer on video, then sentences in ISL order, then fingerspelling. The model checks every try.', to: '/app?view=learn' },
  { icon: Hand, title: 'My signs', hindi: 'मेरे इशारे', text: 'Teach it your name sign from three recordings. Few-shot learning, no retraining, stays on your device.', to: '/app?view=mysigns' },
  { icon: Siren, title: 'SOS', hindi: 'आपातकाल', text: 'Hold one button or make the Signal for Help: a full-screen alert with your location and contacts.', to: '/app' },
  { icon: FlaskConical, title: 'Model lab', hindi: 'मॉडल लैब', text: 'Training curves, confusion matrix, the architecture comparison and a live speed test.', to: '/app?view=lab' },
];

const TCN = [
  ['d = 1', '5 frames'],
  ['d = 2', '13 frames'],
  ['d = 4', '29 frames'],
  ['d = 8', '61 frames'],
];

const IDEAS = [
  'Weight-shared 2-D CNN',
  'Dilated TCN',
  'Residual blocks',
  'Squeeze-and-excitation',
  'Attention pooling',
  'Background class + IoU',
  'Temporal NMS',
  'Prototypical network',
  'Temperature calibration',
  'Label smoothing',
  'AdamW + cosine decay',
  'Landmark augmentation',
];

const DSA = ['Ring buffer', 'Binary search', 'Min-heap', 'Trie', 'Levenshtein DP', 'Bigram model', 'LRU cache', 'State machines', 'One-Euro filter'];

const MARQUEE = Object.values(WORDS);

// Decided once per page load, so React's double-invoked initialisers in development cannot hide it.
let introPending: boolean | null = null;

export default function LandingPage() {
  const [intro, setIntro] = useState(() => (introPending ??= shouldShowIntro()));
  const { user, enabled } = useAuth();
  const numbers = useNumbers();
  const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

  return (
    <div className="min-h-dvh bg-paper text-ink">
      {intro && (
        <Intro
          onDone={() => {
            introPending = false;
            setIntro(false);
          }}
        />
      )}

      {/* ---------- Header ---------- */}
      <header className="sticky top-0 z-40 border-b-2 border-ink bg-paper/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-[1240px] items-center justify-between px-[var(--pad)]">
          <Link to="/" className="flex items-center gap-2.5" aria-label="Sanket home">
            <SanketMark className="h-9 w-9" />
            <Wordmark className="text-[25px]" />
          </Link>
          <nav className="hidden items-center gap-1 md:flex">
            {[
              ['#how', 'How it works'],
              ['#features', 'Features'],
              ['#inside', 'Inside the model'],
            ].map(([href, label]) => (
              <a key={href} href={href} className="rounded-full px-3.5 py-2 text-[15px] font-medium hover:bg-ink/5">
                {label}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            {enabled && (
              <Link to={user ? '/account' : '/login'} className="btn btn-bare btn-sm">
                {user ? 'Account' : 'Log in'}
              </Link>
            )}
            <Link to="/app" className="btn btn-ink btn-sm !rounded-full px-4">
              Open<span className="hidden sm:inline"> translator</span> <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </header>

      {/* ---------- Hero ---------- */}
      <section className="relative overflow-hidden">
        <div className="cover-paper pointer-events-none absolute inset-0" aria-hidden="true" />
        <div className="relative mx-auto grid max-w-[1240px] items-center gap-12 px-[var(--pad)] py-[clamp(36px,6vw,80px)] lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border-2 border-ink bg-card px-3 py-1 text-[13.5px] font-semibold">
              <span className="live-dot h-2 w-2 rounded-full bg-signal" /> Indian Sign Language · live · on your device
            </p>
            <h1 className="mt-6 text-[clamp(56px,8.4vw,118px)] font-extrabold leading-[0.9] tracking-[-0.04em] [font-variation-settings:'wdth'_88]">
              Speak with
              <br />
              your <span className="serif italic tracking-[-0.02em] text-signal">hands.</span>
            </h1>
            <p className="deva mt-4 text-[clamp(24px,3.2vw,38px)] font-bold text-ink/80">हाथों से बोलिए, Sanket सुनाएगा।</p>
            <p className="mt-5 max-w-[44ch] text-[18.5px] leading-relaxed text-ink/75">
              Sanket reads ISL signs from a webcam and says them aloud, so deaf and hard-of-hearing people can be understood at
              the clinic, the counter and at home.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/app" className="btn btn-signal !min-h-[56px] !rounded-full px-7 text-[17px] shadow-[4px_4px_0_var(--color-ink)]">
                Start translating <ArrowRight className="h-5 w-5" />
              </Link>
              <Link to="/app?view=learn" className="btn !min-h-[56px] !rounded-full px-7 text-[17px]">
                Learn signs
              </Link>
            </div>
          </div>
          <LiveDemo />
        </div>
      </section>

      {/* ---------- Numbers ---------- */}
      <section className="border-y-2 border-ink bg-card">
        <dl className="mx-auto grid max-w-[1240px] grid-cols-2 px-[var(--pad)] lg:grid-cols-4">
          {[
            [numbers ? String(numbers.words) : '70', 'word signs', 'from the INCLUDE dataset'],
            [numbers ? pct(numbers.wordAccuracy) : '–', 'words right', 'on held-out test videos'],
            [numbers ? String(numbers.letters) : '35', 'letters and digits', 'for fingerspelling'],
            [numbers ? pct(numbers.letterAccuracy) : '–', 'letters right', 'on held-out test images'],
          ].map(([value, label, note], i) => (
            <div key={label} className={`flex items-baseline gap-3 py-6 ${i % 2 ? 'pl-5' : ''} ${i ? 'lg:border-l-2 lg:border-ink lg:pl-6' : ''}`}>
              <dd className="text-[clamp(38px,4.6vw,60px)] font-extrabold leading-none tracking-[-0.04em]">{value}</dd>
              <div>
                <dt className="text-[15.5px] font-bold leading-tight">{label}</dt>
                <p className="text-[13px] text-mute">{note}</p>
              </div>
            </div>
          ))}
        </dl>
      </section>

      {/* ---------- How it works ---------- */}
      <section id="how" className="mx-auto max-w-[1240px] scroll-mt-20 px-[var(--pad)] py-[clamp(56px,8vw,112px)]">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)]">
          <div className="lg:sticky lg:top-28 lg:self-start">
            <p className="tag text-signal-deep">How it works</p>
            <h2 className="mt-3 text-[clamp(40px,5.4vw,72px)] font-extrabold leading-[0.95] tracking-[-0.035em]">
              From a hand to a <span className="serif italic text-signal">voice</span>, in four steps.
            </h2>
            <p className="mt-4 max-w-[36ch] text-[16.5px] leading-relaxed text-mute">
              Two pretrained networks find the hands. Everything after that, the features, both classifiers and the engine, was
              built and trained for this project.
            </p>
          </div>
          <ol className="divide-y-2 divide-ink border-y-2 border-ink">
            {STEPS.map(([title, hindi, text], i) => (
              <li key={title} className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 py-7 sm:grid-cols-[auto_200px_1fr]">
                <span className="row-span-2 text-[clamp(56px,6vw,84px)] font-extrabold leading-[0.8] tracking-[-0.05em] text-signal sm:row-span-1">
                  0{i + 1}
                </span>
                <div>
                  <h3 className="text-[28px] font-extrabold leading-none tracking-[-0.02em]">{title}</h3>
                  <p className="deva mt-1 text-[16px] font-semibold text-mute">{hindi}</p>
                </div>
                <p className="text-[16px] leading-relaxed text-ink/80">{text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ---------- Word marquee ---------- */}
      <div className="overflow-hidden border-y-2 border-ink bg-signal py-4 text-ink" aria-label="Some of the signs Sanket knows">
        <div className="marquee flex w-max gap-10 whitespace-nowrap">
          {[...MARQUEE, ...MARQUEE].map((w, i) => (
            <span key={i} className="flex items-baseline gap-2.5" aria-hidden={i >= MARQUEE.length}>
              <span className="serif text-[34px] italic leading-none">{w.text}</span>
              <span className="deva text-[18px] font-bold">{w.hindi}</span>
              <span className="ml-8 text-[20px]">✺</span>
            </span>
          ))}
        </div>
      </div>

      {/* ---------- Features ---------- */}
      <section id="features" className="mx-auto max-w-[1240px] scroll-mt-20 px-[var(--pad)] py-[clamp(56px,8vw,112px)]">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 className="max-w-[16ch] text-[clamp(40px,5.4vw,72px)] font-extrabold leading-[0.95] tracking-[-0.035em]">
            One app for the whole <span className="serif italic text-rail">conversation.</span>
          </h2>
          <p className="max-w-[34ch] text-[16px] text-mute">No install and no account. Open it in Chrome or Edge, allow the camera, and sign.</p>
        </div>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, hindi, text, to }, i) => {
            const sos = title === 'SOS';
            const dark = !sos && i % 3 === 1;
            return (
              <Link
                key={title}
                to={to}
                className={`group relative flex flex-col rounded-[22px] border-2 border-ink p-6 transition-transform duration-150 hover:-translate-y-1 hover:shadow-[6px_6px_0_var(--color-ink)] ${
                  sos ? 'bg-alarm text-white' : dark ? 'bg-ink text-paper' : 'bg-card'
                }`}
              >
                <span className={`grid h-14 w-14 place-items-center rounded-full border-2 ${sos ? 'border-white' : 'border-ink bg-signal text-ink'}`}>
                  <Icon className="h-6 w-6" strokeWidth={2} />
                </span>
                <h3 className="mt-6 text-[26px] font-extrabold leading-none tracking-[-0.02em]">{title}</h3>
                <p className={`deva mt-1 text-[15px] font-semibold ${sos || dark ? 'opacity-70' : 'text-mute'}`}>{hindi}</p>
                <p className={`mt-3 flex-1 text-[15.5px] leading-relaxed ${sos || dark ? 'opacity-85' : 'text-ink/80'}`}>{text}</p>
                <ArrowUpRight className="absolute right-5 top-5 h-6 w-6 opacity-40 transition-opacity group-hover:opacity-100" />
              </Link>
            );
          })}
        </div>
      </section>

      {/* ---------- Inside the model ---------- */}
      <section id="inside" className="scroll-mt-16 bg-ink text-paper">
        <div className="mx-auto max-w-[1240px] px-[var(--pad)] py-[clamp(56px,8vw,112px)]">
          <p className="tag text-signal">Inside the model</p>
          <h2 className="mt-3 max-w-[20ch] text-[clamp(40px,5.4vw,72px)] font-extrabold leading-[0.95] tracking-[-0.035em]">
            Small enough for a browser, <span className="serif italic text-signal">sharp enough</span> to read a sign.
          </h2>

          <div className="mt-12 grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
            <div className="rounded-[22px] border-2 border-paper/20 p-6 sm:p-8">
              <p className="text-[19px] font-bold">The words network: a dilated temporal CNN</p>
              <p className="mt-1 text-[15px] text-paper/60">
                32 frames × 136 numbers in. Each block doubles its dilation, so the last one sees the whole sign.
              </p>
              <div className="mt-6 space-y-2.5">
                {TCN.map(([d, field], i) => (
                  <div key={d} className="flex items-center gap-3">
                    <span className="num w-14 shrink-0 text-[13px] text-paper/60">{d}</span>
                    <div className="h-9 flex-1 overflow-hidden rounded-[8px] bg-paper/10">
                      <div
                        className="flex h-full items-center justify-end rounded-[8px] bg-signal pr-3 text-[13px] font-bold text-ink"
                        style={{ width: `${[22, 40, 64, 100][i]}%` }}
                      >
                        {field}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-[14px] text-paper/60">
                Then attention pooling over time, a 160-number embedding, and 71 outputs (70 words + "no sign").
              </p>
              <dl className="mt-6 grid grid-cols-3 gap-3 border-t border-paper/15 pt-5">
                {[
                  ['435,696', 'parameters'],
                  ['61', 'frame receptive field'],
                  ['T = 0.82', 'calibration'],
                ].map(([v, l]) => (
                  <div key={l}>
                    <dd className="text-[24px] font-extrabold leading-none text-signal">{v}</dd>
                    <dt className="mt-1 text-[13px] text-paper/60">{l}</dt>
                  </div>
                ))}
              </dl>
            </div>

            <div className="flex flex-col gap-6">
              <div className="rounded-[22px] bg-paper p-6 text-ink sm:p-8">
                <p className="text-[19px] font-bold">Deep learning ideas in use</p>
                <ul className="mt-4 flex flex-wrap gap-2">
                  {IDEAS.map((idea) => (
                    <li key={idea} className="rounded-full border-2 border-ink px-3 py-1 text-[14px] font-semibold">
                      {idea}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-[22px] bg-rail p-6 text-white sm:p-8">
                <p className="text-[19px] font-bold">Data structures and algorithms</p>
                <ul className="mt-4 flex flex-wrap gap-2">
                  {DSA.map((name) => (
                    <li key={name} className="rounded-full bg-white/15 px-3 py-1 text-[14px] font-semibold">
                      {name}
                    </li>
                  ))}
                </ul>
                <Link to="/app?view=lab" className="mt-5 inline-flex items-center gap-1.5 text-[15px] font-bold underline underline-offset-4">
                  See it all in the model lab <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </div>

          <div className="mt-6 grid gap-4 rounded-[22px] border-2 border-paper/20 p-6 sm:p-8 md:grid-cols-[auto_1fr] md:items-start md:gap-10">
            <p className="text-[19px] font-bold">Honest numbers</p>
            <ul className="grid gap-3 text-[15px] leading-relaxed text-paper/75 md:grid-cols-3">
              <li>
                <b className="text-paper">94.2% on held-out videos, 64.7% on people the model never saw.</b> A new signer, camera or
                room scores lower, so check the sentence before you speak it.
              </li>
              <li>
                <b className="text-paper">{numbers?.words ?? 70} words plus letters and digits.</b> Anything else is spelled, or taught
                in My signs.
              </li>
              <li>
                <b className="text-paper">SOS shows an alert on this screen.</b> It does not send SMS or call anyone by itself.
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* ---------- Call to action ---------- */}
      <section className="bg-signal">
        <div className="mx-auto flex max-w-[1240px] flex-col items-start justify-between gap-6 px-[var(--pad)] py-[clamp(48px,7vw,88px)] md:flex-row md:items-center">
          <div>
            <h2 className="text-[clamp(40px,6vw,80px)] font-extrabold leading-[0.9] tracking-[-0.04em]">
              Raise a hand. <span className="serif italic">Be heard.</span>
            </h2>
            <p className="deva mt-2 text-[22px] font-bold">हाथ उठाइए, अपनी बात कहिए।</p>
          </div>
          <Link to="/app" className="btn btn-ink !min-h-[60px] !rounded-full px-8 text-[18px] shadow-[4px_4px_0_var(--color-card)]">
            Start translating <ArrowRight className="h-5 w-5" />
          </Link>
        </div>
      </section>

      <footer className="bg-ink text-paper">
        <div className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-4 px-[var(--pad)] py-8 text-[14px] text-paper/60">
          <p className="flex items-center gap-2.5">
            <SanketMark className="h-7 w-7 rounded-[9px] ring-2 ring-paper/30" /> Sanket · Deep Learning course project (CSAI3027P), UPES
          </p>
          <p>Word data: INCLUDE, AI4Bharat (CC BY 4.0) · Hand tracking: MediaPipe · Models: TensorFlow / TensorFlow.js</p>
        </div>
      </footer>
    </div>
  );
}

import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { ArrowRight, Camera, Cpu, Volume2, ShieldCheck, UserPlus } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { Splash } from '../components/landing/Splash';
import { IntroAnimation } from '../components/landing/IntroAnimation';
import { LandingNav } from '../components/landing/LandingNav';
import { Hero } from '../components/landing/Hero';
import { SignSphere } from '../components/landing/SignSphere';
import { SanketMark, Wordmark } from '../components/Logo';
import { useCardArt } from '../hooks/useCardArt';
import { Link } from '../lib/router';

type Phase = 'splash' | 'intro' | 'revealed';

const INTRO_KEY = 'sanket:intro-seen';

/** Splash + intro play once per browser session (and never with reduced motion). */
function initialPhase(): Phase {
  try {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return 'revealed';
    return sessionStorage.getItem(INTRO_KEY) ? 'revealed' : 'splash';
  } catch {
    return 'splash';
  }
}

const STEPS = [
  {
    Icon: Camera,
    title: 'Your camera sees 21 points per hand',
    text: 'MediaPipe finds both hands and tracks every joint, right in the browser. Lighting and background matter far less than with raw video.',
  },
  {
    Icon: Cpu,
    title: 'A neural network reads the sign',
    text: 'A TensorFlow model built with 1D convolutions classifies the hand shape. A sign is only accepted after it is held steadily for a second.',
  },
  {
    Icon: Volume2,
    title: 'Words become speech, replies become captions',
    text: 'Signs build a sentence that Sanket speaks aloud. The hearing person answers out loud and sees their words appear as large captions.',
  },
];

export default function LandingPage() {
  const { user, enabled } = useAuth();
  const [phase, setPhase] = useState<Phase>(initialPhase);
  const [introStarted, setIntroStarted] = useState(false);
  const { urls, progress, ready } = useCardArt();
  const revealed = phase === 'revealed';

  useEffect(() => {
    document.body.classList.toggle('locked', !revealed);
    if (revealed) {
      try {
        sessionStorage.setItem(INTRO_KEY, '1');
      } catch {
        // Private mode: the intro simply plays again next time.
      }
      // Arriving at /#signs or /#how: jump there once the page is visible.
      if (location.hash) document.querySelector(location.hash)?.scrollIntoView();
    }
    return () => document.body.classList.remove('locked');
  }, [revealed]);

  return (
    <div className="bg-black text-white">
      {phase === 'splash' && <Splash
          progress={progress}
          ready={ready}
          onDone={() => {
            setIntroStarted(true);
            setPhase('intro');
          }}
        />}
      {/* Mounts as the splash starts fading, so the intro is already underneath it, and
          stays mounted through its own fade-out after the page is revealed. */}
      {introStarted && <IntroAnimation onReveal={() => setPhase('revealed')} />}

      <LandingNav visible={revealed} />
      <main>
        <Hero revealed={revealed} />
        <SignSphere urls={urls} revealed={revealed} />

        <section id="how" className="relative mx-auto max-w-6xl px-6 py-28 sm:py-36">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.6 }}
            className="max-w-2xl"
          >
            <p className="text-xs uppercase tracking-[.24em] text-saffron">How it works</p>
            <h2 className="mt-4 font-serif text-4xl leading-[1.05] sm:text-6xl">
              From a raised hand to a spoken sentence, <em className="text-glow">in about a second.</em>
            </h2>
          </motion.div>

          <ol className="mt-16 grid gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 md:grid-cols-3">
            {STEPS.map(({ Icon, title, text }, i) => (
              <motion.li
                key={title}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-60px' }}
                transition={{ delay: i * 0.12, duration: 0.6 }}
                className="flex flex-col gap-5 bg-[#060606] p-8"
              >
                <div className="flex items-center justify-between">
                  <span className="grid h-11 w-11 place-items-center rounded-full border border-white/15 text-saffron">
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="font-mono text-xs text-white/35">0{i + 1}</span>
                </div>
                <h3 className="text-xl font-semibold leading-snug">{title}</h3>
                <p className="text-[15px] leading-relaxed text-white/60">{text}</p>
              </motion.li>
            ))}
          </ol>

          <div className="mt-6 flex items-start gap-3 rounded-2xl border border-white/10 bg-[#060606] p-6 text-sm text-white/60">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-periwinkle" />
            <p>
              Video never leaves your device: hand tracking and recognition run in the browser. An account only stores your
              name, your emergency contacts and your preferences.
            </p>
          </div>
        </section>

        <section className="relative overflow-hidden border-y border-white/10">
          <div className="pointer-events-none absolute left-1/2 top-1/2 h-[480px] w-[900px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-orange-900/25 blur-[140px]" />
          <div className="relative mx-auto flex max-w-4xl flex-col items-center gap-8 px-6 py-28 text-center">
            <h2 className="font-serif text-4xl leading-[1.05] sm:text-6xl">Start a conversation now.</h2>
            <p className="max-w-lg text-lg text-white/65">
              The translator works without an account. Create one to keep emergency contacts ready on the SOS screen.
            </p>
            <div className="flex flex-col items-center gap-4 sm:flex-row">
              <Link
                to="/app"
                className="group flex items-center gap-4 rounded-full bg-white py-2 pl-6 pr-2 text-lg font-medium text-[#0a0400] transition-all hover:scale-105 hover:shadow-[0_0_20px_rgba(255,255,255,0.3)]"
              >
                Open the translator
                <span className="grid h-10 w-10 place-items-center rounded-full bg-saffron-deep group-hover:bg-[#d95f10]">
                  <ArrowRight className="h-5 w-5 text-white" />
                </span>
              </Link>
              {enabled && !user && (
                <Link
                  to="/signup"
                  className="flex items-center gap-2 rounded-full border border-white/20 px-6 py-3.5 text-white/80 transition-colors hover:border-white/50 hover:text-white"
                >
                  <UserPlus className="h-4 w-4" /> Create an account
                </Link>
              )}
            </div>
          </div>
        </section>
      </main>

      <footer className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-12 text-sm text-white/45 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3 text-white">
          <SanketMark className="h-5 w-5" accent="#ff9a3c" />
          <Wordmark className="text-xl" />
          <span className="font-deva text-white/40">संकेत</span>
        </div>
        <p>A Deep Learning course project · UPES · CSAI3027P</p>
        <nav className="flex gap-5" aria-label="Footer">
          <Link to="/app" className="hover:text-white">Translator</Link>
          <Link to="/app?mode=learn" className="hover:text-white">Learn</Link>
          {enabled && <Link to={user ? '/account' : '/login'} className="hover:text-white">{user ? 'Account' : 'Log in'}</Link>}
        </nav>
      </footer>
    </div>
  );
}

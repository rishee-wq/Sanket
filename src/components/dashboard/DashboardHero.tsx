import React from 'react';
import { motion } from 'motion/react';
import { ArrowRight } from 'lucide-react';
import { HandField } from '../landing/HandField';

function greeting(now = new Date()) {
  const h = now.getHours();
  return h < 5 ? 'Good night' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

interface Props {
  name: string | null;
  onTranslate: () => void;
  onPractise: () => void;
}

/** Dashboard hero, laid out to the hero spec: serif pre-headline, huge gradient headline, two CTAs. */
export const DashboardHero: React.FC<Props> = ({ name, onTranslate, onPractise }) => (
  <section className="relative flex min-h-[86dvh] w-full flex-col items-center justify-center overflow-hidden bg-black px-6 text-white">
    <div className="absolute inset-0 opacity-60">
      <HandField />
    </div>
    <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" />
    <div className="pointer-events-none absolute left-[20%] top-[-20%] h-[600px] w-[600px] rounded-full bg-blue-900/20 blur-[120px] mix-blend-screen" />
    <div className="pointer-events-none absolute bottom-[-10%] right-[20%] h-[500px] w-[500px] rounded-full bg-indigo-900/20 blur-[120px] mix-blend-screen" />
    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-black" />

    <div className="relative z-10 mx-auto mt-20 flex max-w-5xl flex-col items-center space-y-12 text-center">
      <motion.p
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="font-serif text-3xl leading-[1.1] text-white sm:text-5xl lg:text-[48px]"
      >
        {greeting()}
        {name ? `, ${name}` : ''}
      </motion.p>

      <motion.h1
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.2, duration: 0.6 }}
        className="bg-gradient-to-b from-white via-white to-[#b4c0ff] bg-clip-text pb-2 font-sans text-6xl font-semibold leading-[0.9] tracking-tighter text-transparent sm:text-8xl lg:text-[136px]"
      >
        Sign Freely.
      </motion.h1>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.7 }}
        transition={{ delay: 0.4, duration: 0.6 }}
        className="max-w-xl text-lg leading-[1.65] text-white sm:text-[20px]"
      >
        Your signs become speech. Their replies become captions. Pick up a conversation, or practise a new sign.
      </motion.p>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6, duration: 0.5 }}
        className="flex flex-col items-center gap-6 sm:flex-row"
      >
        <button
          onClick={onTranslate}
          className="group flex items-center gap-4 rounded-full bg-white py-2 pl-6 pr-2 text-lg font-medium text-[#0a0400] transition-all hover:scale-105 hover:shadow-[0_0_20px_rgba(255,255,255,0.3)]"
        >
          Start Translating
          <span className="grid h-10 w-10 place-items-center rounded-full bg-saffron-deep transition-colors group-hover:bg-[#d95f10]">
            <ArrowRight className="h-5 w-5 text-white" />
          </span>
        </button>
        <button
          onClick={onPractise}
          className="group flex items-center gap-2 rounded-lg px-4 py-2 text-white/70 backdrop-blur-sm transition-colors hover:bg-white/5 hover:text-white"
        >
          Practise a sign
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
        </button>
      </motion.div>
    </div>
  </section>
);

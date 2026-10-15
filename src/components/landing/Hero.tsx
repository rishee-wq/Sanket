import React from 'react';
import { motion, type TargetAndTransition } from 'motion/react';
import { ArrowRight } from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider';
import { Link } from '../../lib/router';
import { HandField } from './HandField';

/** Dark hero: drifting landmark field, soft gradients, headline, two calls to action. */
export const Hero: React.FC<{ revealed: boolean }> = ({ revealed }) => {
  const { user, enabled } = useAuth();
  const play = (to: TargetAndTransition) => (revealed ? to : undefined);

  return (
    <section className="relative flex min-h-dvh w-full flex-col items-center justify-center overflow-hidden bg-black px-6 text-white">
      {/* Background layer */}
      <div className="absolute inset-0 opacity-60">
        <HandField />
      </div>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" />
      <div className="pointer-events-none absolute left-[20%] top-[-20%] h-[600px] w-[600px] rounded-full bg-orange-900/20 blur-[120px] mix-blend-screen" />
      <div className="pointer-events-none absolute bottom-[-10%] right-[20%] h-[500px] w-[500px] rounded-full bg-indigo-900/20 blur-[120px] mix-blend-screen" />

      <div className="relative z-10 mx-auto mt-20 flex max-w-5xl flex-col items-center space-y-12 text-center">
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={play({ opacity: 1, y: 0 })}
          transition={{ duration: 0.6 }}
          className="font-serif text-3xl leading-[1.1] text-white sm:text-5xl lg:text-[48px]"
        >
          Indian Sign Language, understood in real time
        </motion.p>

        <motion.h1
          initial={{ opacity: 0, scale: 0.9 }}
          animate={play({ opacity: 1, scale: 1 })}
          transition={{ delay: 0.2, duration: 0.6 }}
          className="bg-gradient-to-b from-white via-white to-glow bg-clip-text pb-2 font-sans text-6xl font-semibold leading-[0.9] tracking-tighter text-transparent sm:text-8xl lg:text-[136px]"
        >
          Hands Speak.
        </motion.h1>

        <motion.p
          initial={{ opacity: 0 }}
          animate={play({ opacity: 0.7 })}
          transition={{ delay: 0.4, duration: 0.6 }}
          className="max-w-xl text-lg leading-[1.65] text-white sm:text-[20px]"
        >
          Sanket turns signs into text and speech, and speech into captions, right in your browser. Be understood
          at the clinic, at the counter, and at home.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={play({ opacity: 1, y: 0 })}
          transition={{ delay: 0.6, duration: 0.5 }}
          className="flex flex-col items-center gap-6 sm:flex-row"
        >
          <Link
            to="/app"
            className="group flex items-center gap-4 rounded-full bg-white py-2 pl-6 pr-2 text-lg font-medium text-[#0a0400] transition-all hover:scale-105 hover:shadow-[0_0_20px_rgba(255,255,255,0.3)]"
          >
            Start Translating
            <span className="grid h-10 w-10 place-items-center rounded-full bg-saffron-deep transition-colors group-hover:bg-[#d95f10]">
              <ArrowRight className="h-5 w-5 text-white" />
            </span>
          </Link>
          <Link
            to={enabled && !user ? '/signup' : '/#signs'}
            className="group flex items-center gap-2 rounded-lg px-4 py-2 text-white/70 backdrop-blur-sm transition-colors hover:bg-white/5 hover:text-white"
          >
            {enabled && !user ? 'Create a free account' : 'See who it helps'}
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Link>
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={play({ opacity: 0.45 })}
          transition={{ delay: 0.9, duration: 0.6 }}
          className="text-xs uppercase tracking-[.24em]"
        >
          No account needed to translate · Camera stays on your device
        </motion.p>
      </div>
    </section>
  );
};

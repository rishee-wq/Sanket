import React from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, Info } from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider';
import { HandField } from '../../components/landing/HandField';
import { SanketMark, Wordmark } from '../../components/Logo';
import { Link } from '../../lib/router';

interface AuthLayoutProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

/** Split screen: a dark landmark field with a quote on the left, the form on the right. */
export const AuthLayout: React.FC<AuthLayoutProps> = ({ title, subtitle, children, footer }) => {
  const { enabled } = useAuth();

  return (
    <div className="grid min-h-dvh bg-black text-ink lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden overflow-hidden border-r border-white/10 lg:block">
        <div className="absolute inset-0 opacity-70">
          <HandField density={0.8} />
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-black/70" />
        <div className="pointer-events-none absolute -left-24 top-1/4 h-[520px] w-[520px] rounded-full bg-orange-900/25 blur-[120px]" />
        <div className="relative flex h-full flex-col justify-between p-12">
          <Link to="/" className="flex items-center gap-3 text-white" aria-label="Sanket home">
            <SanketMark className="h-7 w-7" />
            <Wordmark className="text-[28px]" />
          </Link>
          <motion.blockquote
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="max-w-md"
          >
            <p className="font-deva text-3xl text-saffron/90">संकेत</p>
            <p className="mt-4 font-serif text-5xl leading-[1.05]">
              Every sign deserves <em className="text-glow">to be heard.</em>
            </p>
            <p className="mt-6 text-sm leading-relaxed text-white/55">
              An account keeps your emergency contacts ready on the SOS screen and remembers how you like Sanket to
              speak. Translating never needs one.
            </p>
          </motion.blockquote>
        </div>
      </aside>

      <main className="relative flex flex-col px-6 pb-10 pt-[calc(1.25rem+var(--safe-top))] sm:px-10">
        <div className="flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 text-sm text-white/60 hover:text-white">
            <ArrowLeft className="h-4 w-4" /> Home
          </Link>
          <Link to="/app" className="text-sm text-white/60 hover:text-white">
            Continue as guest
          </Link>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mx-auto flex w-full max-w-[420px] flex-1 flex-col justify-center py-12"
        >
          <Link to="/" className="mb-10 flex items-center gap-2.5 text-white lg:hidden" aria-label="Sanket home">
            <SanketMark className="h-6 w-6" />
            <Wordmark className="text-2xl" />
          </Link>
          <h1 className="font-serif text-[40px] leading-[1.05] sm:text-5xl">{title}</h1>
          {subtitle && <p className="mt-3 text-[15px] leading-relaxed text-white/60">{subtitle}</p>}

          {!enabled && (
            <div className="mt-8 flex gap-3 rounded-xl border border-amber-400/30 bg-amber-400/5 p-4 text-sm text-amber-100/90">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
              <p>
                Accounts aren’t set up on this copy of Sanket yet. Add your Supabase URL and anon key to{' '}
                <code className="font-mono text-xs">.env.local</code> (see the README). You can still{' '}
                <Link to="/app" className="underline underline-offset-2">
                  use the translator as a guest
                </Link>
                .
              </p>
            </div>
          )}

          <div className="mt-8">{children}</div>
          {footer && <div className="mt-8 text-sm text-white/55">{footer}</div>}
        </motion.div>
      </main>
    </div>
  );
};

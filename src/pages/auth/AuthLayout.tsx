import React from 'react';
import { ArrowLeft, Info } from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider';
import { SanketMark, Wordmark } from '../../components/Logo';
import { Link } from '../../lib/router';

interface AuthLayoutProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

/** Split screen: a yellow name board on the left, the form on the right. */
export const AuthLayout: React.FC<AuthLayoutProps> = ({ title, subtitle, children, footer }) => {
  const { enabled } = useAuth();

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_1.1fr]">
      <aside className="hidden flex-col justify-between border-r-2 border-ink bg-signal p-10 lg:flex">
        <Link to="/" className="flex items-center gap-3" aria-label="Sanket home">
          <SanketMark className="h-9 w-9" />
          <Wordmark className="text-[30px]" />
        </Link>
        <div>
          <p className="display text-[clamp(56px,6.5vw,104px)]">
            Every sign
            <br />
            deserves to
            <br />
            be heard.
          </p>
          <p className="deva mt-4 text-[28px] font-extrabold">हर इशारे को सुना जाना चाहिए।</p>
          <p className="mt-6 max-w-[44ch] text-[16px] leading-snug">
            An account keeps your emergency contacts ready on the SOS screen and remembers how you like Sanket to speak.
            Translating never needs one.
          </p>
        </div>
        <div className="hazard h-4 border-2 border-ink" aria-hidden="true" />
      </aside>

      <main className="flex flex-col px-6 pb-10 pt-[calc(1.25rem+var(--safe-top))] sm:px-10">
        <div className="flex items-center justify-between">
          <Link to="/" className="btn btn-bare btn-sm">
            <ArrowLeft className="h-4 w-4" /> Home
          </Link>
          <Link to="/app" className="btn btn-sm">
            Continue as guest
          </Link>
        </div>

        <div className="mx-auto flex w-full max-w-[440px] flex-1 flex-col justify-center py-10">
          <Link to="/" className="mb-8 flex items-center gap-2.5 lg:hidden" aria-label="Sanket home">
            <SanketMark className="h-8 w-8" />
            <Wordmark className="text-[26px]" />
          </Link>
          <h1 className="display text-[52px] sm:text-[64px]">{title}</h1>
          {subtitle && <p className="mt-3 text-[16px] leading-relaxed text-mute">{subtitle}</p>}

          {!enabled && (
            <div className="mt-6 flex gap-3 rounded-md border-2 border-ink bg-signal p-3.5 text-[15px]">
              <Info className="mt-0.5 h-5 w-5 shrink-0" />
              <p>
                Accounts aren’t set up on this copy of Sanket yet. Add your Supabase URL and anon key to{' '}
                <code className="num text-[13px]">.env.local</code> (see the README). You can still{' '}
                <Link to="/app" className="font-semibold underline underline-offset-2">
                  use the translator as a guest
                </Link>
                .
              </p>
            </div>
          )}

          <div className="mt-7">{children}</div>
          {footer && <div className="mt-7 text-[15px] text-mute">{footer}</div>}
        </div>
      </main>
    </div>
  );
};

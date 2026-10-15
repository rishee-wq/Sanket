import React, { useId, useState } from 'react';
import { AlertCircle, CheckCircle2, Eye, EyeOff, Loader2 } from 'lucide-react';

const inputClass =
  'w-full rounded-xl border border-white/12 bg-white/[.04] px-4 py-3 text-[15px] text-ink placeholder:text-white/30 outline-none transition-colors hover:border-white/25 focus:border-saffron focus:bg-white/[.06] focus:ring-4 focus:ring-saffron/15 disabled:opacity-50 aria-[invalid=true]:border-rose-400/70';

type FieldProps = React.InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: React.ReactNode;
  error?: string | null;
  trailing?: React.ReactNode;
};

export const TextField = React.forwardRef<HTMLInputElement, FieldProps>(
  ({ label, hint, error, trailing, className = '', ...input }, ref) => {
    const id = useId();
    const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
    return (
      <div className={className}>
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <label htmlFor={id} className="text-sm font-medium text-white/85">
            {label}
          </label>
          {trailing}
        </div>
        <input
          ref={ref}
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={inputClass}
          {...input}
        />
        {error ? (
          <p id={`${id}-error`} className="mt-2 text-[13px] text-rose-300">
            {error}
          </p>
        ) : hint ? (
          <p id={`${id}-hint`} className="mt-2 text-[13px] text-white/45">
            {hint}
          </p>
        ) : null}
      </div>
    );
  }
);
TextField.displayName = 'TextField';

/** Rough strength score 0..4 with a label; length matters most. */
export function passwordStrength(pw: string): { score: number; label: string } {
  if (!pw) return { score: 0, label: '' };
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) score++;
  if (pw.length < 8) score = Math.min(score, 1);
  return { score, label: ['Too short', 'Weak', 'Fair', 'Good', 'Strong'][score] };
}

export const PasswordField: React.FC<
  Omit<FieldProps, 'type'> & { showStrength?: boolean }
> = ({ showStrength, value, ...rest }) => {
  const [visible, setVisible] = useState(false);
  const { score, label } = passwordStrength(String(value ?? ''));
  const colors = ['bg-rose-400', 'bg-rose-400', 'bg-amber-400', 'bg-lime-400', 'bg-emerald-400'];

  return (
    <div>
      <div className="relative">
        <TextField type={visible ? 'text' : 'password'} value={value} {...rest} className="[&_input]:pr-12" />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Hide password' : 'Show password'}
          className="absolute right-1.5 top-[34px] grid h-10 w-10 place-items-center rounded-lg text-white/50 hover:text-white"
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      {showStrength && String(value ?? '').length > 0 && (
        <div className="mt-2.5 flex items-center gap-3" aria-live="polite">
          <div className="flex flex-1 gap-1.5">
            {[1, 2, 3, 4].map((i) => (
              <span key={i} className={`h-1 flex-1 rounded-full ${i <= Math.max(1, score) ? colors[score] : 'bg-white/10'}`} />
            ))}
          </div>
          <span className="w-16 text-right text-xs text-white/55">{label}</span>
        </div>
      )}
    </div>
  );
};

export const Alert: React.FC<{ kind: 'error' | 'success'; children: React.ReactNode }> = ({ kind, children }) => (
  <div
    role={kind === 'error' ? 'alert' : 'status'}
    className={`flex gap-3 rounded-xl border p-3.5 text-sm ${
      kind === 'error'
        ? 'border-rose-400/30 bg-rose-500/10 text-rose-100'
        : 'border-emerald-400/30 bg-emerald-500/10 text-emerald-100'
    }`}
  >
    {kind === 'error' ? (
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-300" />
    ) : (
      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
    )}
    <div>{children}</div>
  </div>
);

export const SubmitButton: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { busy?: boolean }> = ({
  busy,
  children,
  disabled,
  className = '',
  ...rest
}) => (
  <button
    type="submit"
    disabled={busy || disabled}
    className={`flex w-full items-center justify-center gap-2 rounded-full bg-white px-6 py-3.5 text-[15px] font-semibold text-[#0a0400] transition-all hover:shadow-[0_0_24px_rgba(255,255,255,.25)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:shadow-none ${className}`}
    {...rest}
  >
    {busy && <Loader2 className="h-4 w-4 animate-spin" />}
    {children}
  </button>
);

export const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s.trim());

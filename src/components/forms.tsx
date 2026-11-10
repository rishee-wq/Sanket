import React, { useId, useState } from 'react';
import { AlertCircle, CheckCircle2, Eye, EyeOff, Loader2 } from 'lucide-react';

const inputClass = 'field';

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
          <label htmlFor={id} className="text-[15px] font-semibold">
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
          <p id={`${id}-error`} className="mt-2 text-[14px] font-semibold text-alarm">
            {error}
          </p>
        ) : hint ? (
          <p id={`${id}-hint`} className="mt-2 text-[14px] text-mute">
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
  const colors = ['bg-alarm', 'bg-alarm', 'bg-signal-deep', 'bg-go', 'bg-go'];

  return (
    <div>
      <div className="relative">
        <TextField type={visible ? 'text' : 'password'} value={value} {...rest} className="[&_input]:pr-12" />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Hide password' : 'Show password'}
          className="absolute right-1 top-[33px] grid h-10 w-10 place-items-center rounded text-mute hover:text-ink"
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      {showStrength && String(value ?? '').length > 0 && (
        <div className="mt-2.5 flex items-center gap-3" aria-live="polite">
          <div className="flex flex-1 gap-1.5">
            {[1, 2, 3, 4].map((i) => (
              <span key={i} className={`h-2 flex-1 border border-ink ${i <= Math.max(1, score) ? colors[score] : 'bg-white'}`} />
            ))}
          </div>
          <span className="w-16 text-right text-xs text-mute">{label}</span>
        </div>
      )}
    </div>
  );
};

export const Alert: React.FC<{ kind: 'error' | 'success'; children: React.ReactNode }> = ({ kind, children }) => (
  <div
    role={kind === 'error' ? 'alert' : 'status'}
    className={`flex gap-3 rounded-md border-2 bg-white p-3 text-[15px] ${kind === 'error' ? 'border-alarm' : 'border-go'}`}
  >
    {kind === 'error' ? (
      <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-alarm" />
    ) : (
      <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-go" />
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
    className={`btn btn-ink w-full !min-h-[50px] text-[16px] ${className}`}
    {...rest}
  >
    {busy && <Loader2 className="h-4 w-4 animate-spin" />}
    {children}
  </button>
);

export const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s.trim());

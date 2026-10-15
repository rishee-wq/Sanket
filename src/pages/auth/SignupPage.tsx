import React, { useState } from 'react';
import { motion } from 'motion/react';
import { MailCheck } from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider';
import { Alert, PasswordField, SubmitButton, TextField, isEmail, passwordStrength } from '../../components/forms';
import { Profile, ROLE_LABELS, friendlyAuthError } from '../../lib/supabase';
import { Link, navigate } from '../../lib/router';
import { AuthLayout } from './AuthLayout';

type Errors = Partial<Record<'name' | 'email' | 'password' | 'confirm', string>>;

export default function SignupPage() {
  const { signUp, resendConfirmation, enabled } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [role, setRole] = useState<Profile['role']>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [resent, setResent] = useState(false);

  const validate = (): Errors => {
    const e: Errors = {};
    if (!name.trim()) e.name = 'Tell us what to call you.';
    if (!isEmail(email)) e.email = 'Enter a valid email address.';
    if (password.length < 8) e.password = 'Use at least 8 characters.';
    else if (passwordStrength(password).score < 2) e.password = 'Add length, or mix in numbers and symbols.';
    if (confirm !== password) e.confirm = 'The passwords don’t match.';
    return e;
  };

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setFormError(null);
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      const { needsConfirmation } = await signUp({ email: email.trim(), password, fullName: name.trim(), role });
      if (needsConfirmation) setSentTo(email.trim());
      else navigate('/app?welcome=1', { replace: true });
    } catch (err) {
      setFormError(friendlyAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  if (sentTo) {
    return (
      <AuthLayout title="Check your email" subtitle={<>We sent a confirmation link to <b className="text-white">{sentTo}</b>.</>}>
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          className="space-y-5 rounded-2xl border border-white/10 bg-white/[.03] p-6"
        >
          <MailCheck className="h-8 w-8 text-saffron" />
          <p className="text-[15px] leading-relaxed text-white/70">
            Open the link on this device to finish creating your account. It can take a minute to arrive; check your
            spam folder too.
          </p>
          {resent ? (
            <Alert kind="success">Sent again.</Alert>
          ) : (
            <button
              onClick={async () => {
                try {
                  await resendConfirmation(sentTo);
                  setResent(true);
                } catch (err) {
                  setFormError(friendlyAuthError(err));
                }
              }}
              className="text-sm font-medium text-white underline underline-offset-4"
            >
              Resend the link
            </button>
          )}
          {formError && <Alert kind="error">{formError}</Alert>}
        </motion.div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title={
        <>
          Create your <em className="text-glow">account.</em>
        </>
      }
      subtitle="Free. Keeps your emergency contacts and preferences in one place."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-white underline-offset-4 hover:underline">
            Log in
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-5" noValidate>
        {formError && <Alert kind="error">{formError}</Alert>}
        <TextField
          label="Name"
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={errors.name}
          maxLength={120}
          disabled={!enabled}
          placeholder="Your name"
        />
        <TextField
          label="Email"
          type="email"
          inputMode="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={errors.email}
          disabled={!enabled}
          placeholder="you@example.com"
        />
        <PasswordField
          label="Password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={errors.password}
          hint="At least 8 characters."
          showStrength
          disabled={!enabled}
        />
        <PasswordField
          label="Confirm password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          error={errors.confirm}
          disabled={!enabled}
        />

        <fieldset disabled={!enabled}>
          <legend className="mb-2 text-sm font-medium text-white/85">
            I am <span className="font-normal text-white/40">(optional)</span>
          </legend>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(ROLE_LABELS) as NonNullable<Profile['role']>[]).map((key) => (
              <button
                key={key}
                type="button"
                aria-pressed={role === key}
                onClick={() => setRole(role === key ? null : key)}
                className={`rounded-full border px-3.5 py-2 text-[13px] transition-colors ${
                  role === key
                    ? 'border-saffron bg-saffron/15 text-white'
                    : 'border-white/12 text-white/65 hover:border-white/30 hover:text-white'
                }`}
              >
                {ROLE_LABELS[key]}
              </button>
            ))}
          </div>
        </fieldset>

        <SubmitButton busy={busy} disabled={!enabled}>
          Create account
        </SubmitButton>
        <p className="text-center text-xs leading-relaxed text-white/40">
          We store your name, email and emergency contacts. Camera video never leaves your device.
        </p>
      </form>
    </AuthLayout>
  );
}

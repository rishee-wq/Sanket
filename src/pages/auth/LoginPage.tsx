import React, { useState } from 'react';
import { useAuth } from '../../auth/AuthProvider';
import { Alert, PasswordField, SubmitButton, TextField, isEmail } from '../../components/forms';
import { friendlyAuthError } from '../../lib/supabase';
import { Link, navigate, useSearchParams } from '../../lib/router';
import { AuthLayout } from './AuthLayout';

/** Only allow redirects back into this app. */
function safeNext(next: string | null) {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/app';
}

export default function LoginPage() {
  const { signIn, resendConfirmation, enabled } = useAuth();
  const params = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(
    params.get('reset') === 'done' ? 'Your password has been changed. Log in with the new one.' : null
  );
  const [unconfirmed, setUnconfirmed] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setUnconfirmed(false);
    if (!isEmail(email)) return setError('Enter the email address you signed up with.');
    if (!password) return setError('Enter your password.');
    setBusy(true);
    try {
      await signIn(email.trim(), password);
      navigate(safeNext(params.get('next')), { replace: true });
    } catch (err) {
      const message = friendlyAuthError(err);
      setError(message);
      setUnconfirmed(message.includes('confirm your email'));
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setError(null);
    try {
      await resendConfirmation(email.trim());
      setNotice(`We sent a new confirmation link to ${email.trim()}.`);
      setUnconfirmed(false);
    } catch (err) {
      setError(friendlyAuthError(err));
    }
  };

  return (
    <AuthLayout
      title={
        <>
          Welcome <em className="text-glow">back.</em>
        </>
      }
      subtitle="Log in to see your emergency contacts on the SOS screen and keep your settings in sync."
      footer={
        <>
          New to Sanket?{' '}
          <Link to="/signup" className="font-medium text-white underline-offset-4 hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-5" noValidate>
        {notice && <Alert kind="success">{notice}</Alert>}
        {error && (
          <Alert kind="error">
            {error}
            {unconfirmed && (
              <button type="button" onClick={resend} className="ml-1 font-medium underline underline-offset-2">
                Resend link
              </button>
            )}
          </Alert>
        )}
        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={!enabled}
          placeholder="you@example.com"
        />
        <PasswordField
          label="Password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={!enabled}
          trailing={
            <Link to="/forgot-password" className="text-[13px] text-white/55 hover:text-white">
              Forgot password?
            </Link>
          }
        />
        <SubmitButton busy={busy} disabled={!enabled}>
          Log in
        </SubmitButton>
      </form>
    </AuthLayout>
  );
}

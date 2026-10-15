import React, { useState } from 'react';
import { useAuth } from '../../auth/AuthProvider';
import { Alert, PasswordField, SubmitButton, passwordStrength } from '../../components/forms';
import { friendlyAuthError } from '../../lib/supabase';
import { Link, navigate } from '../../lib/router';
import { AuthLayout } from './AuthLayout';

/** Reached from the reset email, which signs the user in with a short-lived recovery session. */
export default function ResetPasswordPage() {
  const { setPassword, signOut, session, loading } = useAuth();
  const [password, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) return setError('Use at least 8 characters.');
    if (passwordStrength(password).score < 2) return setError('Add length, or mix in numbers and symbols.');
    if (password !== confirm) return setError('The passwords don’t match.');
    setBusy(true);
    try {
      await setPassword(password);
      await signOut();
      navigate('/login?reset=done', { replace: true });
    } catch (err) {
      setError(friendlyAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  if (!loading && !session) {
    return (
      <AuthLayout title="Link expired" subtitle="This reset link is no longer valid. Reset links work once and expire after an hour.">
        <Link
          to="/forgot-password"
          className="inline-flex rounded-full bg-white px-6 py-3 text-[15px] font-semibold text-[#0a0400]"
        >
          Send a new link
        </Link>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Choose a new password" subtitle="You’ll use it to log in from now on.">
      <form onSubmit={submit} className="space-y-5" noValidate>
        {error && <Alert kind="error">{error}</Alert>}
        <PasswordField
          label="New password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPw(e.target.value)}
          showStrength
          hint="At least 8 characters."
        />
        <PasswordField
          label="Confirm new password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
        <SubmitButton busy={busy}>Save password</SubmitButton>
      </form>
    </AuthLayout>
  );
}

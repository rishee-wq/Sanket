import React, { useState } from 'react';
import { useAuth } from '../../auth/AuthProvider';
import { Alert, SubmitButton, TextField, isEmail } from '../../components/forms';
import { friendlyAuthError } from '../../lib/supabase';
import { Link } from '../../lib/router';
import { AuthLayout } from './AuthLayout';

export default function ForgotPasswordPage() {
  const { sendPasswordReset, enabled } = useAuth();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!isEmail(email)) return setError('Enter the email address you signed up with.');
    setBusy(true);
    try {
      await sendPasswordReset(email.trim());
      setSent(true);
    } catch (err) {
      setError(friendlyAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      title="Reset your password"
      subtitle="Enter your email and we’ll send you a link to choose a new password."
      footer={
        <Link to="/login" className="font-medium text-white underline-offset-4 hover:underline">
          Back to log in
        </Link>
      }
    >
      {sent ? (
        // Same message whether or not the email has an account, so this page can't be used to probe for users.
        <Alert kind="success">
          If an account exists for <b>{email.trim()}</b>, a reset link is on its way. Open it on this device.
        </Alert>
      ) : (
        <form onSubmit={submit} className="space-y-5" noValidate>
          {error && <Alert kind="error">{error}</Alert>}
          <TextField
            label="Email"
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={!enabled}
            placeholder="you@example.com"
          />
          <SubmitButton busy={busy} disabled={!enabled}>
            Send reset link
          </SubmitButton>
        </form>
      )}
    </AuthLayout>
  );
}

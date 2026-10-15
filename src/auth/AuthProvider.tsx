import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { Profile, supabase } from '../lib/supabase';
import { navigate } from '../lib/router';

interface SignUpInput {
  email: string;
  password: string;
  fullName: string;
  role: Profile['role'];
}

interface AuthContextValue {
  enabled: boolean;
  /** True until the stored session has been read. */
  loading: boolean;
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  /** Returns true when the user must confirm their email before logging in. */
  signUp: (input: SignUpInput) => Promise<{ needsConfirmation: boolean }>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  resendConfirmation: (email: string) => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  /** Sets a new password for the signed-in user (also used after a reset link). */
  setPassword: (password: string) => Promise<void>;
  /** Checks the current password, then sets a new one. */
  changePassword: (current: string, next: string) => Promise<void>;
  changeEmail: (email: string) => Promise<void>;
  updateProfile: (changes: Partial<Pick<Profile, 'full_name' | 'role' | 'preferred_language'>>) => Promise<void>;
  deleteAccount: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function requireClient() {
  if (!supabase) throw new Error('Accounts are not configured on this copy of Sanket.');
  return supabase;
}

const redirect = (path: string) => `${window.location.origin}${path}`;

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [loading, setLoading] = useState(supabase !== null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const user = session?.user ?? null;

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next);
      // The reset email signs the user in with a recovery session; send them to set a password.
      if (event === 'PASSWORD_RECOVERY') navigate('/reset-password', { replace: true });
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const loadProfile = useCallback(async (userId: string) => {
    const { data, error } = await requireClient().from('profiles').select('*').eq('id', userId).maybeSingle();
    if (error) console.warn('Could not load profile', error);
    setProfile((data as Profile | null) ?? null);
  }, []);

  useEffect(() => {
    if (user) loadProfile(user.id);
    else setProfile(null);
  }, [user?.id, loadProfile]);

  const value = useMemo<AuthContextValue>(
    () => ({
      enabled: supabase !== null,
      loading,
      session,
      user,
      profile,

      async signUp({ email, password, fullName, role }) {
        const { data, error } = await requireClient().auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName, role }, emailRedirectTo: redirect('/app?welcome=1') },
        });
        if (error) throw error;
        // With email confirmation on, Supabase returns a user without a session. For an
        // email that is already registered it returns a user with no identities.
        if (data.user && data.user.identities?.length === 0) throw new Error('User already registered');
        return { needsConfirmation: !data.session };
      },

      async signIn(email, password) {
        const { error } = await requireClient().auth.signInWithPassword({ email, password });
        if (error) throw error;
      },

      async signOut() {
        const { error } = await requireClient().auth.signOut();
        if (error) throw error;
      },

      async resendConfirmation(email) {
        const { error } = await requireClient().auth.resend({
          type: 'signup',
          email,
          options: { emailRedirectTo: redirect('/app?welcome=1') },
        });
        if (error) throw error;
      },

      async sendPasswordReset(email) {
        const { error } = await requireClient().auth.resetPasswordForEmail(email, {
          redirectTo: redirect('/reset-password'),
        });
        if (error) throw error;
      },

      async setPassword(password) {
        const { error } = await requireClient().auth.updateUser({ password });
        if (error) throw error;
      },

      async changePassword(current, next) {
        const client = requireClient();
        if (!user?.email) throw new Error('Not signed in.');
        const check = await client.auth.signInWithPassword({ email: user.email, password: current });
        if (check.error) throw new Error('Your current password is incorrect.');
        const { error } = await client.auth.updateUser({ password: next });
        if (error) throw error;
      },

      async changeEmail(email) {
        const { error } = await requireClient().auth.updateUser(
          { email },
          { emailRedirectTo: redirect('/account?email=changed') }
        );
        if (error) throw error;
      },

      async updateProfile(changes) {
        if (!user) throw new Error('Not signed in.');
        const { data, error } = await requireClient()
          .from('profiles')
          .update(changes)
          .eq('id', user.id)
          .select()
          .single();
        if (error) throw error;
        setProfile(data as Profile);
      },

      async deleteAccount() {
        const client = requireClient();
        const { error } = await client.rpc('delete_account');
        if (error) throw error;
        await client.auth.signOut({ scope: 'local' });
      },
    }),
    [loading, session, user, profile]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

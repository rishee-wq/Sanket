import { createClient, SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/**
 * The Supabase client, or null when .env.local has no project configured.
 * Without it, accounts are disabled but the translator still works for guests.
 */
export const supabase: SupabaseClient | null =
  url && anonKey
    ? createClient(url, anonKey, {
        auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      })
    : null;

export const accountsEnabled = supabase !== null;

export interface Profile {
  id: string;
  full_name: string;
  role: 'deaf' | 'hard_of_hearing' | 'hearing' | 'interpreter' | 'other' | null;
  preferred_language: string;
  created_at: string;
  updated_at: string;
}

export interface EmergencyContact {
  id: string;
  user_id: string;
  name: string;
  phone: string;
  relation: string | null;
  created_at: string;
}

export const ROLE_LABELS: Record<NonNullable<Profile['role']>, string> = {
  deaf: 'Deaf',
  hard_of_hearing: 'Hard of hearing',
  hearing: 'Hearing (family, friend, colleague)',
  interpreter: 'ISL interpreter or teacher',
  other: 'Other',
};

/** Turns Supabase auth errors into sentences a person can act on. */
export function friendlyAuthError(err: unknown): string {
  const message = err instanceof Error ? err.message : typeof err === 'object' && err && 'message' in err ? String(err.message) : String(err);
  const m = message.toLowerCase();
  if (m.includes('invalid login credentials')) return 'That email and password don’t match an account.';
  if (m.includes('email not confirmed')) return 'Please confirm your email first. We can send the link again.';
  if (m.includes('user already registered')) return 'An account with this email already exists. Try logging in instead.';
  if (m.includes('password should be at least')) return 'Your password needs to be at least 8 characters.';
  if (m.includes('rate limit') || m.includes('too many')) return 'Too many attempts. Please wait a minute and try again.';
  if (m.includes('failed to fetch') || m.includes('network')) return 'Can’t reach the account server. Check your connection.';
  if (m.includes('same password')) return 'Your new password must be different from the current one.';
  return message;
}

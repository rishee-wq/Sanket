import { useCallback, useEffect, useState } from 'react';
import { EmergencyContact, friendlyAuthError, supabase } from '../lib/supabase';
import { useAuth } from './AuthProvider';

/** The signed-in user's emergency contacts (row-level security limits the query to them). */
export function useEmergencyContacts() {
  const { user } = useAuth();
  const [contacts, setContacts] = useState<EmergencyContact[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!supabase || !user) {
      setContacts([]);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.from('emergency_contacts').select('*').order('created_at');
    setLoading(false);
    if (error) setError(friendlyAuthError(error));
    else {
      setError(null);
      setContacts(data as EmergencyContact[]);
    }
  }, [user?.id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const add = async (contact: Pick<EmergencyContact, 'name' | 'phone' | 'relation'>) => {
    if (!supabase) throw new Error('Accounts are not configured.');
    const { data, error } = await supabase.from('emergency_contacts').insert(contact).select().single();
    if (error) throw error;
    setContacts((prev) => [...prev, data as EmergencyContact]);
  };

  const remove = async (id: string) => {
    if (!supabase) throw new Error('Accounts are not configured.');
    const { error } = await supabase.from('emergency_contacts').delete().eq('id', id);
    if (error) throw error;
    setContacts((prev) => prev.filter((c) => c.id !== id));
  };

  return { contacts, loading, error, add, remove, refresh };
}

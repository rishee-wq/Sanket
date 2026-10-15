import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { ArrowRight, LogOut, Phone, Plus, Trash2, UserRound, ShieldAlert, KeyRound, Mail, Siren } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { useEmergencyContacts } from '../auth/useEmergencyContacts';
import { Alert, PasswordField, SubmitButton, TextField, isEmail, passwordStrength } from '../components/forms';
import { SanketMark, Wordmark } from '../components/Logo';
import { Profile, ROLE_LABELS, friendlyAuthError } from '../lib/supabase';
import { Link, navigate, useSearchParams } from '../lib/router';

const LANGUAGES = [
  { value: 'en-IN', label: 'English (India)' },
  { value: 'hi-IN', label: 'हिन्दी (Hindi)' },
];

const SECTIONS = [
  { id: 'profile', label: 'Profile', Icon: UserRound },
  { id: 'contacts', label: 'Emergency contacts', Icon: Siren },
  { id: 'email', label: 'Email', Icon: Mail },
  { id: 'password', label: 'Password', Icon: KeyRound },
  { id: 'danger', label: 'Delete account', Icon: ShieldAlert },
];

const Card: React.FC<{ id: string; title: string; text?: React.ReactNode; children: React.ReactNode; danger?: boolean }> = ({
  id,
  title,
  text,
  children,
  danger,
}) => (
  <motion.section
    id={id}
    initial={{ opacity: 0, y: 14 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.45 }}
    className={`scroll-mt-24 rounded-2xl border p-6 sm:p-8 ${danger ? 'border-rose-400/25 bg-rose-500/[.03]' : 'border-white/10 bg-white/[.02]'}`}
  >
    <h2 className="font-serif text-[28px] leading-tight">{title}</h2>
    {text && <p className="mt-1.5 text-sm leading-relaxed text-white/55">{text}</p>}
    <div className="mt-6">{children}</div>
  </motion.section>
);

function useStatus() {
  const [status, setStatus] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);
  return { status, ok: (text: string) => setStatus({ kind: 'success', text }), fail: (err: unknown) => setStatus({ kind: 'error', text: friendlyAuthError(err) }), clear: () => setStatus(null) };
}

const ProfileCard: React.FC = () => {
  const { profile, updateProfile } = useAuth();
  const [name, setName] = useState('');
  const [role, setRole] = useState<Profile['role']>(null);
  const [lang, setLang] = useState('en-IN');
  const [busy, setBusy] = useState(false);
  const s = useStatus();

  useEffect(() => {
    if (!profile) return;
    setName(profile.full_name);
    setRole(profile.role);
    setLang(profile.preferred_language);
  }, [profile]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    s.clear();
    if (!name.trim()) return s.fail(new Error('Your name can’t be empty.'));
    setBusy(true);
    try {
      await updateProfile({ full_name: name.trim(), role, preferred_language: lang });
      s.ok('Profile saved.');
    } catch (err) {
      s.fail(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card id="profile" title="Profile" text="How Sanket greets you, and the voice it uses to speak your sentences.">
      <form onSubmit={save} className="space-y-5">
        {s.status && <Alert kind={s.status.kind}>{s.status.text}</Alert>}
        <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} autoComplete="name" />
        <div>
          <label htmlFor="role" className="mb-2 block text-sm font-medium text-white/85">
            I am
          </label>
          <select
            id="role"
            value={role ?? ''}
            onChange={(e) => setRole((e.target.value || null) as Profile['role'])}
            className="w-full rounded-xl border border-white/12 bg-[#0b0b0b] px-4 py-3 text-[15px] outline-none focus:border-saffron focus:ring-4 focus:ring-saffron/15"
          >
            <option value="">Prefer not to say</option>
            {(Object.keys(ROLE_LABELS) as NonNullable<Profile['role']>[]).map((k) => (
              <option key={k} value={k}>
                {ROLE_LABELS[k]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="lang" className="mb-2 block text-sm font-medium text-white/85">
            Speech language
          </label>
          <select
            id="lang"
            value={lang}
            onChange={(e) => setLang(e.target.value)}
            className="w-full rounded-xl border border-white/12 bg-[#0b0b0b] px-4 py-3 text-[15px] outline-none focus:border-saffron focus:ring-4 focus:ring-saffron/15"
          >
            {LANGUAGES.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
        </div>
        <SubmitButton busy={busy} className="sm:w-auto">
          Save profile
        </SubmitButton>
      </form>
    </Card>
  );
};

const ContactsCard: React.FC = () => {
  const { contacts, loading, add, remove, error } = useEmergencyContacts();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [relation, setRelation] = useState('');
  const [busy, setBusy] = useState(false);
  const s = useStatus();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    s.clear();
    if (!name.trim()) return s.fail(new Error('Add a name for this contact.'));
    if (!/^\+?[0-9 ()-]{6,20}$/.test(phone.trim())) return s.fail(new Error('Enter a phone number, e.g. +91 98765 43210.'));
    setBusy(true);
    try {
      await add({ name: name.trim(), phone: phone.trim(), relation: relation.trim() || null });
      setName('');
      setPhone('');
      setRelation('');
      s.ok('Contact added.');
    } catch (err) {
      s.fail(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card
      id="contacts"
      title="Emergency contacts"
      text="Shown on the SOS screen with the alert message and your location. Up to 5. (Sending SMS automatically isn’t built yet.)"
    >
      {error && <Alert kind="error">{error}</Alert>}
      <ul className="divide-y divide-white/8 overflow-hidden rounded-xl border border-white/10">
        {loading && <li className="p-4 text-sm text-white/45">Loading…</li>}
        {!loading && contacts.length === 0 && (
          <li className="p-4 text-sm text-white/45">No contacts yet. Add the people who should hear from you first.</li>
        )}
        {contacts.map((c) => (
          <li key={c.id} className="flex items-center gap-4 p-4">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-saffron/12 text-saffron">
              <Phone className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">
                {c.name} {c.relation && <span className="font-normal text-white/45">· {c.relation}</span>}
              </p>
              <a href={`tel:${c.phone.replace(/[^+\d]/g, '')}`} className="font-mono text-sm text-white/60 hover:text-white">
                {c.phone}
              </a>
            </div>
            <button
              onClick={() => remove(c.id).catch(s.fail)}
              aria-label={`Remove ${c.name}`}
              className="grid h-10 w-10 place-items-center rounded-lg text-white/45 hover:bg-rose-500/10 hover:text-rose-300"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </li>
        ))}
      </ul>

      {contacts.length < 5 && (
        <form onSubmit={submit} className="mt-6 space-y-4">
          {s.status && <Alert kind={s.status.kind}>{s.status.text}</Alert>}
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
            <TextField label="Relation" value={relation} onChange={(e) => setRelation(e.target.value)} maxLength={40} placeholder="Mother, friend…" />
          </div>
          <TextField
            label="Phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+91 98765 43210"
          />
          <button
            type="submit"
            disabled={busy}
            className="flex items-center gap-2 rounded-full border border-white/20 px-5 py-2.5 text-sm font-medium hover:border-white/50 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" /> Add contact
          </button>
        </form>
      )}
    </Card>
  );
};

const EmailCard: React.FC = () => {
  const { user, changeEmail } = useAuth();
  const params = useSearchParams();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const s = useStatus();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    s.clear();
    if (!isEmail(email)) return s.fail(new Error('Enter a valid email address.'));
    setBusy(true);
    try {
      await changeEmail(email.trim());
      s.ok(`Confirm the change from the links sent to ${user?.email} and ${email.trim()}.`);
      setEmail('');
    } catch (err) {
      s.fail(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card id="email" title="Email" text={<>Signed in as <b className="text-white/85">{user?.email}</b>.</>}>
      <form onSubmit={submit} className="space-y-5">
        {params.get('email') === 'changed' && !s.status && <Alert kind="success">Email change confirmed.</Alert>}
        {s.status && <Alert kind={s.status.kind}>{s.status.text}</Alert>}
        <TextField label="New email" type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <SubmitButton busy={busy} className="sm:w-auto">
          Change email
        </SubmitButton>
      </form>
    </Card>
  );
};

const PasswordCard: React.FC = () => {
  const { changePassword } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState(false);
  const s = useStatus();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    s.clear();
    if (!current) return s.fail(new Error('Enter your current password.'));
    if (next.length < 8 || passwordStrength(next).score < 2) return s.fail(new Error('Choose a stronger new password (at least 8 characters).'));
    setBusy(true);
    try {
      await changePassword(current, next);
      setCurrent('');
      setNext('');
      s.ok('Password changed.');
    } catch (err) {
      s.fail(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card id="password" title="Password">
      <form onSubmit={submit} className="space-y-5">
        {s.status && <Alert kind={s.status.kind}>{s.status.text}</Alert>}
        <PasswordField label="Current password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        <PasswordField label="New password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} showStrength />
        <SubmitButton busy={busy} className="sm:w-auto">
          Change password
        </SubmitButton>
      </form>
    </Card>
  );
};

const DangerCard: React.FC = () => {
  const { deleteAccount } = useAuth();
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const s = useStatus();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (confirm !== 'DELETE') return;
    setBusy(true);
    try {
      await deleteAccount();
      navigate('/?deleted=1', { replace: true });
    } catch (err) {
      s.fail(err);
      setBusy(false);
    }
  };

  return (
    <Card
      id="danger"
      danger
      title="Delete account"
      text="Permanently deletes your account, profile and emergency contacts. This can’t be undone. The translator keeps working as a guest."
    >
      <form onSubmit={submit} className="space-y-5">
        {s.status && <Alert kind={s.status.kind}>{s.status.text}</Alert>}
        <TextField
          label="Type DELETE to confirm"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
        <button
          type="submit"
          disabled={confirm !== 'DELETE' || busy}
          className="rounded-full bg-rose-500 px-6 py-3 text-[15px] font-semibold text-white transition-opacity hover:bg-rose-400 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? 'Deleting…' : 'Delete my account'}
        </button>
      </form>
    </Card>
  );
};

export default function AccountPage() {
  const { profile, user, signOut } = useAuth();
  const firstName = (profile?.full_name || user?.email || '').split(/[ @]/)[0];

  return (
    <div className="min-h-dvh bg-black text-ink">
      <div className="pointer-events-none fixed left-[10%] top-[-20%] h-[600px] w-[600px] rounded-full bg-orange-900/15 blur-[120px]" />
      <header className="sticky top-0 z-40 border-b border-white/8 bg-black/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link to="/" className="flex items-center gap-2.5 text-white" aria-label="Sanket home">
            <SanketMark className="h-6 w-6" accent="#ff9a3c" />
            <Wordmark className="text-[22px]" />
          </Link>
          <div className="flex items-center gap-3">
            <button
              onClick={() => signOut().then(() => navigate('/'))}
              className="flex items-center gap-2 rounded-full px-4 py-2 text-sm text-white/65 hover:bg-white/5 hover:text-white"
            >
              <LogOut className="h-4 w-4" /> Log out
            </button>
            <Link to="/app" className="group flex items-center gap-2 rounded-full bg-white py-1.5 pl-4 pr-1.5 text-sm font-semibold text-black">
              Open app
              <span className="grid h-7 w-7 place-items-center rounded-full bg-saffron-deep">
                <ArrowRight className="h-3.5 w-3.5 text-white" />
              </span>
            </Link>
          </div>
        </div>
      </header>

      <div className="relative mx-auto grid max-w-6xl gap-10 px-6 py-12 lg:grid-cols-[220px_1fr]">
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <p className="font-serif text-4xl leading-tight">
            {firstName ? (
              <>
                Hello, <em className="text-glow">{firstName}.</em>
              </>
            ) : (
              'Your account'
            )}
          </p>
          <nav className="mt-8 hidden flex-col gap-1 lg:flex" aria-label="Account sections">
            {SECTIONS.map(({ id, label, Icon }) => (
              <a key={id} href={`#${id}`} className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-white/60 hover:bg-white/5 hover:text-white">
                <Icon className="h-4 w-4" /> {label}
              </a>
            ))}
          </nav>
        </aside>

        <div className="space-y-6">
          <ProfileCard />
          <ContactsCard />
          <EmailCard />
          <PasswordCard />
          <DangerCard />
        </div>
      </div>
    </div>
  );
}

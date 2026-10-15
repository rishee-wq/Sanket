/**
 * A small on-device log of accepted signs and practice successes, for the dashboard.
 * Stored in localStorage only; it never leaves the browser.
 */
import { useSyncExternalStore } from 'react';

export interface SignEvent {
  label: string;
  source: 'conversation' | 'learn';
  ts: number;
}

const KEY = 'sanket:history:v1';
const MAX = 500;
const listeners = new Set<() => void>();
let cache: SignEvent[] | null = null;

function read(): SignEvent[] {
  if (cache) return cache;
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    cache = Array.isArray(parsed) ? parsed : [];
  } catch {
    cache = [];
  }
  return cache;
}

export function recordSign(label: string, source: SignEvent['source']) {
  const next = [{ label, source, ts: Date.now() }, ...read()].slice(0, MAX);
  cache = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage full or blocked: keep the in-memory copy for this session.
  }
  listeners.forEach((l) => l());
}

export function clearHistory() {
  cache = [];
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      cache = null;
      l();
    }
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(l);
    window.removeEventListener('storage', onStorage);
  };
}

export function useSignHistory(): SignEvent[] {
  return useSyncExternalStore(subscribe, read);
}

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

/** Derived numbers for the dashboard cards. */
export function summarize(events: SignEvent[], now = new Date()) {
  const today = dayKey(now);
  const signsToday = events.filter((e) => e.source === 'conversation' && dayKey(new Date(e.ts)) === today).length;

  const week = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now);
    d.setDate(d.getDate() - (6 - i));
    return { key: dayKey(d), label: d.toLocaleDateString([], { weekday: 'narrow' }), count: 0 };
  });
  for (const e of events) {
    const slot = week.find((w) => w.key === dayKey(new Date(e.ts)));
    if (slot) slot.count++;
  }

  // Consecutive days (ending today or yesterday) with any activity.
  const active = new Set(events.map((e) => dayKey(new Date(e.ts))));
  let streak = 0;
  const cursor = new Date(now);
  if (!active.has(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  while (active.has(dayKey(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }

  const practised = new Set(events.filter((e) => e.source === 'learn').map((e) => e.label));
  const counts = new Map<string, number>();
  for (const e of events) if (e.source === 'conversation') counts.set(e.label, (counts.get(e.label) ?? 0) + 1);
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

  return { signsToday, week, streak, practised, top, last: events[0] ?? null, total: events.length };
}

export function relativeTime(ts: number, now = Date.now()) {
  const s = Math.round((now - ts) / 1000);
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? 'yesterday' : `${d} days ago`;
}

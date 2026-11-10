import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { vocab } from '../data/vocabulary';
import type { Token } from '../engine/engine';
import { LanguageModel } from '../engine/language';
import { speechService } from '../services/speechService';

export interface Message {
  id: number;
  who: 'me' | 'them';
  text: string;
  ts: number;
}

export interface SuggestionChip {
  text: string;
  /** "complete" replaces the word being spelled; "next" is appended. */
  kind: 'complete' | 'next';
}

/** The word being fingerspelled at the end of the draft ("" if the draft ends with a space or a normal word). */
export function spellingTail(draft: string): string {
  const last = draft.split(' ').pop() ?? '';
  return /^[A-Z0-9]+$/.test(last) ? last : '';
}

/**
 * Appends a recognised sign. Fingerspelled letters and digits join into one
 * word (H, O, S, P -> HOSP) while that word is still being spelled; word signs
 * are always separated by a space.
 */
export function appendToken(draft: string, token: Pick<Token, 'kind' | 'label'>): string {
  const text = vocab(token.label).text;
  if (!draft.trim()) return text;
  if (token.kind === 'letter' && spellingTail(draft)) return draft + text;
  return draft.endsWith(' ') ? draft + text : `${draft} ${text}`;
}

/** What is spoken and shown in the thread: spelled words are lowered, the sentence is capitalised. */
export function tidy(draft: string): string {
  const words = draft
    .trim()
    .split(/\s+/)
    .map((w) => (/^[A-Z]{2,}$/.test(w) ? w.toLowerCase() : w));
  const text = words.join(' ');
  return text ? text[0].toUpperCase() + text.slice(1) : '';
}

let nextId = 1;
let sharedLanguage: LanguageModel | null = null;

/** The signed draft, its suggestions, the spoken thread, and speech in both directions. */
export function useConversation(lang: string, vocabulary: readonly string[]) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [lastToken, setLastToken] = useState<Token | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [micError, setMicError] = useState<string | null>(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;

  const language = useMemo(() => (sharedLanguage ??= new LanguageModel([...vocabulary])), [vocabulary]);

  const suggestions = useMemo<SuggestionChip[]>(() => {
    const tail = spellingTail(draft);
    if (tail) return language.completions(tail, 4).map((s) => ({ text: s.word.toLowerCase(), kind: 'complete' }));
    const words = draft.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const previous = words.length ? words[words.length - 1] : '<s>';
    return language.nextWords(previous, 4).map((text) => ({ text, kind: 'next' }));
  }, [draft, language]);

  const push = (who: Message['who'], text: string) =>
    setMessages((m) => [...m, { id: nextId++, who, text, ts: Date.now() }]);

  const say = useCallback(
    async (text: string) => {
      setSpeaking(true);
      await speechService.speak(text, lang);
      setSpeaking(false);
    },
    [lang]
  );

  const addToken = useCallback((token: Token) => {
    setDraft((d) => appendToken(d, token));
    setLastToken(token);
  }, []);

  const applySuggestion = useCallback((chip: SuggestionChip) => {
    setDraft((d) => {
      const word = chip.text === 'i' ? 'I' : chip.text;
      if (chip.kind === 'complete') {
        const cut = d.lastIndexOf(' ') + 1;
        return `${d.slice(0, cut)}${word} `;
      }
      return `${d && !d.endsWith(' ') ? `${d} ` : d}${word} `;
    });
  }, []);

  const speakDraft = useCallback(() => {
    const text = tidy(draftRef.current);
    if (!text) return;
    language.learn(text);
    push('me', text);
    setDraft('');
    say(text);
  }, [language, say]);

  /** Quick phrases are spoken straight away. */
  const sayPhrase = useCallback(
    (text: string) => {
      push('me', text);
      say(text);
    },
    [say]
  );

  const space = useCallback(() => setDraft((d) => (d && !d.endsWith(' ') ? `${d} ` : d)), []);

  /** Removes the last letter of a word being spelled, otherwise the last word. */
  const undo = useCallback(
    () =>
      setDraft((d) => {
        const t = d.trimEnd();
        if (spellingTail(t).length > 1) return t.slice(0, -1);
        const i = t.lastIndexOf(' ');
        return i === -1 ? '' : `${t.slice(0, i)} `;
      }),
    []
  );

  const toggleListening = useCallback(() => {
    if (listening) {
      speechService.stopListening();
      return;
    }
    setMicError(null);
    speechService.startListening(
      {
        onTranscript: (text, isFinal) => {
          if (isFinal) {
            push('them', text);
            setInterim('');
          } else setInterim(text);
        },
        onStateChange: (on) => {
          setListening(on);
          if (!on) setInterim('');
        },
        onError: (err) => {
          setMicError(err);
          setListening(false);
        },
      },
      lang
    );
  }, [listening, lang]);

  useEffect(() => () => speechService.stopListening(), []);

  return {
    messages,
    draft,
    setDraft,
    lastToken,
    suggestions,
    language,
    addToken,
    applySuggestion,
    speakDraft,
    sayPhrase,
    space,
    undo,
    clearDraft: () => setDraft(''),
    clearThread: () => setMessages([]),
    speaking,
    listening,
    interim,
    micError,
    toggleListening,
    sttSupported: speechService.isSpeechRecognitionSupported(),
  };
}

export type Conversation = ReturnType<typeof useConversation>;

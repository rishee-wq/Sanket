import { useCallback, useEffect, useRef, useState } from 'react';
import { speechService } from '../services/speechService';

export interface Message {
  id: number;
  who: 'me' | 'them';
  text: string;
  ts: number;
}

/**
 * Appends an accepted sign. Fingerspelled letters and digits join into one word
 * (H, E, L, L, O -> HELLO) as long as the current word is itself spelled out;
 * word signs are always separated by a space.
 */
export function appendSign(sentence: string, label: string): string {
  if (!sentence.trim()) return label;
  const lastWord = sentence.split(' ').pop() ?? '';
  const spelling = label.length === 1 && /^[A-Z0-9]+$/.test(lastWord);
  if (spelling) return sentence + label;
  return sentence.endsWith(' ') ? sentence + label : `${sentence} ${label}`;
}

let nextId = 1;

/** The signed draft, the spoken thread, and the speech in both directions. */
export function useConversation(lang: string) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [lastAdded, setLastAdded] = useState<string | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [micError, setMicError] = useState<string | null>(null);
  const lastAddedTimer = useRef<number | undefined>(undefined);

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

  const addSign = useCallback((label: string) => {
    setDraft((d) => appendSign(d, label));
    setLastAdded(label);
    window.clearTimeout(lastAddedTimer.current);
    lastAddedTimer.current = window.setTimeout(() => setLastAdded(null), 2200);
  }, []);

  const speakDraft = useCallback(() => {
    const text = draft.trim();
    if (!text) return;
    push('me', text);
    setDraft('');
    say(text);
  }, [draft, say]);

  /** Quick phrases are spoken straight away. */
  const sayPhrase = useCallback(
    (text: string) => {
      push('me', text);
      say(text);
    },
    [say]
  );

  const space = () => setDraft((d) => (d && !d.endsWith(' ') ? `${d} ` : d));
  const undo = () =>
    setDraft((d) => {
      const t = d.trimEnd();
      const i = t.lastIndexOf(' ');
      return i === -1 ? '' : t.slice(0, i);
    });

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
    lastAdded,
    addSign,
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

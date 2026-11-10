/** Phrases spoken with one tap, for when signing would take too long. */
export interface QuickPhrase {
  id: string;
  label: string;
  hindi: string;
  /** The sentence the speech synthesiser says. */
  speak: string;
}

export const QUICK_PHRASES: QuickPhrase[] = [
  { id: 'deaf', label: 'I am deaf', hindi: 'मैं बधिर हूँ', speak: 'I am deaf. Please read my words on this screen.' },
  { id: 'help', label: 'I need help', hindi: 'मुझे मदद चाहिए', speak: 'I need help, please.' },
  { id: 'doctor', label: 'I need a doctor', hindi: 'मुझे डॉक्टर चाहिए', speak: 'I need a doctor.' },
  { id: 'write', label: 'Please write it', hindi: 'कृपया लिखकर बताएँ', speak: 'Please write it down for me.' },
  { id: 'slow', label: 'Speak slowly', hindi: 'धीरे बोलिए', speak: 'Please speak slowly and face me.' },
  { id: 'thanks', label: 'Thank you', hindi: 'धन्यवाद', speak: 'Thank you.' },
  { id: 'yes', label: 'Yes', hindi: 'हाँ', speak: 'Yes.' },
  { id: 'no', label: 'No', hindi: 'नहीं', speak: 'No.' },
];

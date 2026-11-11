/**
 * The Learn course: word units first, then sentences built from those words,
 * then fingerspelling for names and anything outside the vocabulary.
 */
import type { VocabEntry } from './vocabulary';

export interface WordUnit {
  kind: 'words';
  id: string;
  title: string;
  hindi: string;
  groups: VocabEntry['group'][];
}

export interface SentenceUnit {
  kind: 'sentences';
  id: string;
  title: string;
  hindi: string;
}

export type Unit = WordUnit | SentenceUnit;

export const UNITS: Unit[] = [
  { kind: 'words', id: 'greet', title: 'Greetings', hindi: 'अभिवादन', groups: ['greeting'] },
  { kind: 'words', id: 'people', title: 'People', hindi: 'लोग', groups: ['people'] },
  { kind: 'words', id: 'health', title: 'Health and help', hindi: 'स्वास्थ्य और मदद', groups: ['health'] },
  { kind: 'words', id: 'describe', title: 'Describing', hindi: 'वर्णन', groups: ['describe'] },
  { kind: 'words', id: 'time', title: 'Time', hindi: 'समय', groups: ['time'] },
  { kind: 'words', id: 'place', title: 'Places and things', hindi: 'जगहें और चीज़ें', groups: ['place'] },
  { kind: 'sentences', id: 'sentences', title: 'Making sentences', hindi: 'वाक्य बनाना' },
  { kind: 'words', id: 'spell', title: 'Fingerspelling', hindi: 'अक्षर और अंक', groups: ['letter', 'number'] },
];

export type RuleId = 'together' | 'no-be' | 'topic-first' | 'time-first';

export const RULES: Record<RuleId, { title: string; text: string }> = {
  together: {
    title: 'Greetings stay together',
    text: 'A greeting and the person you greet are signed one after the other, much like English.',
  },
  'no-be': {
    title: 'Drop am, is, are, a and the',
    text: 'ISL has no signs for these little words. Sign only the words that carry the meaning: I SICK means "I am sick".',
  },
  'topic-first': {
    title: 'The thing first, then what it is like',
    text: 'Name the person or thing first, then describe it: BUS SLOW, not SLOW BUS.',
  },
  'time-first': {
    title: 'Time comes first',
    text: 'Say WHEN before anything else, then who, then what: YESTERDAY I SICK means "I was sick yesterday".',
  },
};

export interface Sentence {
  id: string;
  english: string;
  hindi: string;
  /** Word labels in ISL order. */
  gloss: string[];
  rule: RuleId;
}

/** Ordered from simplest to the ones that combine two rules. */
export const SENTENCES: Sentence[] = [
  { id: 'hello-how', english: 'Hello, how are you?', hindi: 'नमस्ते, आप कैसे हैं?', gloss: ['hello', 'how are you'], rule: 'together' },
  { id: 'morning-teacher', english: 'Good morning, teacher.', hindi: 'सुप्रभात, शिक्षक।', gloss: ['good morning', 'teacher'], rule: 'together' },
  { id: 'thanks-doctor', english: 'Thank you, doctor.', hindi: 'धन्यवाद, डॉक्टर।', gloss: ['thank you', 'doctor'], rule: 'together' },
  { id: 'i-sick', english: 'I am sick.', hindi: 'मैं बीमार हूँ।', gloss: ['i', 'sick'], rule: 'no-be' },
  { id: 'you-friend', english: 'You are a friend.', hindi: 'आप दोस्त हैं।', gloss: ['you', 'friend'], rule: 'no-be' },
  { id: 'bus-slow', english: 'The bus is slow.', hindi: 'बस धीमी है।', gloss: ['bus', 'slow'], rule: 'topic-first' },
  { id: 'father-old', english: 'Father is old.', hindi: 'पिता बूढ़े हैं।', gloss: ['father', 'old'], rule: 'topic-first' },
  { id: 'hospital-new', english: 'The hospital is new.', hindi: 'अस्पताल नया है।', gloss: ['hospital', 'new'], rule: 'topic-first' },
  { id: 'yesterday-sick', english: 'I was sick yesterday.', hindi: 'मैं कल बीमार था।', gloss: ['yesterday', 'i', 'sick'], rule: 'time-first' },
  { id: 'today-mother', english: 'Mother is happy today.', hindi: 'आज माँ खुश हैं।', gloss: ['today', 'mother', 'happy'], rule: 'time-first' },
  { id: 'night-house', english: 'The house is quiet at night.', hindi: 'रात को घर शांत है।', gloss: ['night', 'house', 'quiet'], rule: 'time-first' },
];

export const sentenceKey = (s: Sentence) => `sentence:${s.id}`;

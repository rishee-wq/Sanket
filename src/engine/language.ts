/**
 * The small language layer on top of recognition: what word is being spelled,
 * and what word is likely to come next.
 *
 * - Lexicon in a TRIE: prefix completion and fuzzy (edit-distance) correction.
 * - BIGRAM MODEL in a hash map of hash maps: count[previous][next] is how often
 *   `next` followed `previous`. The most likely next words are the largest
 *   counts in one row, picked with a top-k heap. It starts from the seed
 *   phrases below and keeps learning from every sentence the user speaks.
 * - LRU cache in front of the trie searches.
 */
import { TopK } from './heap.ts';
import { LruCache } from './lru.ts';
import { type Suggestion, Trie } from './trie.ts';

/** Common words, most useful first. Position sets the autocomplete weight. */
const COMMON_WORDS = `
i you he she it we they me my your his her our their this that these those
is am are was were be have has had do does did will can could should would may must
not no yes please sorry thanks thank hello hi bye welcome okay help need want like know go come
see look hear feel give take get make tell ask call wait stop start open close eat drink sleep sit stand
walk run work study read write pay buy sell bring send show find lose use try
what where when who why how which here there now later soon today tomorrow yesterday morning afternoon
evening night day week month year time hour minute early late always never again
doctor nurse hospital clinic medicine tablet pain fever cough cold headache stomach chest injury blood
sick ill healthy allergy emergency ambulance police fire danger safe accident
water food tea milk rice bread fruit hungry thirsty tired happy sad angry afraid fine good bad
hot cool warm big small long short new old young fast slow loud quiet clean dirty right wrong left
mother father brother sister son daughter husband wife child baby friend family teacher student
man woman boy girl people person name age address phone number email
home house room bathroom toilet kitchen bed door window key school college office bank market shop
station bus train car auto taxi ticket road street city village india delhi
money rupees price bill cash card change form document sign interpreter deaf hearing
one two three four five six seven eight nine ten
and or but because if then with without for from to in on at of the a an
`
  .trim()
  .split(/\s+/);

/** Seed sentences for the bigram model: things people say at a clinic, a counter, in an emergency, at home. */
const SEED_PHRASES = [
  'i need help', 'i need a doctor', 'i need medicine', 'i need water', 'i need an interpreter',
  'i am deaf', 'i am sick', 'i am fine', 'i am happy', 'i am hungry', 'i am tired', 'i am sorry',
  'i have pain', 'i have fever', 'i have a headache', 'i want water', 'i want food', 'i want to go home',
  'please help me', 'please call police', 'please call ambulance', 'please call my family', 'please wait',
  'please write it', 'please speak slow',
  'where is the hospital', 'where is the bathroom', 'where is the doctor', 'where is the bus', 'where is the station',
  'what is your name', 'what is the time', 'what is the price', 'how are you', 'how much money',
  'thank you', 'thank you doctor', 'good morning', 'good night', 'hello how are you',
  'my name is', 'my mother is sick', 'my father is sick', 'my child is sick', 'my friend is sick',
  'my family is here', 'my phone is lost', 'my key is lost',
  'call my mother', 'call my father', 'call my brother', 'call my sister', 'call the police', 'call a doctor',
  'he is my brother', 'she is my sister', 'she is my mother', 'he is my father', 'they are my family',
  'we need help', 'we are fine', 'you are good', 'it is hot', 'it is cold', 'it is bad', 'it is good',
  'today i am sick', 'tomorrow i will come', 'yesterday i was sick', 'i will come tomorrow',
  'doctor i have pain', 'medicine time', 'hospital is where', 'police help',
];

const STORAGE_KEY = 'sanket.bigrams.v1';

export class LanguageModel {
  readonly trie = new Trie();
  private readonly bigrams = new Map<string, Map<string, number>>();
  private readonly cache = new LruCache<string, Suggestion[]>(64);

  constructor(extraWords: string[] = []) {
    COMMON_WORDS.forEach((word, i) => this.trie.insert(word, COMMON_WORDS.length - i));
    for (const word of extraWords) for (const part of word.split(/\s+/)) this.trie.insert(part, COMMON_WORDS.length);
    for (const phrase of SEED_PHRASES) this.learn(phrase, 2, false);
    this.restore();
  }

  get cacheStats() {
    return { hits: this.cache.hits, misses: this.cache.misses, size: this.cache.size };
  }

  /**
   * Suggestions for the word being spelled: completions of the prefix first,
   * then near-misses (one edit for short words, two for long ones). Cached.
   */
  completions(prefix: string, k = 4): Suggestion[] {
    const key = prefix.toUpperCase();
    if (!key) return [];
    const hit = this.cache.get(key);
    if (hit) return hit;

    const out = this.trie.complete(key, k).filter((s) => s.word !== key);
    if (out.length < k && key.length >= 3) {
      const seen = new Set(out.map((s) => s.word));
      for (const s of this.trie.fuzzy(key, key.length >= 6 ? 2 : 1, k * 2)) {
        if (out.length >= k) break;
        if (!seen.has(s.word) && s.word !== key) out.push(s);
      }
    }
    this.cache.set(key, out);
    return out;
  }

  /** The k words most often seen after `previous`. */
  nextWords(previous: string, k = 4): string[] {
    const row = this.bigrams.get(previous.toLowerCase());
    if (!row) return [];
    const top = new TopK<string>(k);
    for (const [word, count] of row) top.offer(word, count);
    return top.result().map((s) => s.item);
  }

  /** Counts every adjacent word pair of a sentence. "<s>" stands for the start. */
  learn(sentence: string, weight = 1, persist = true) {
    const words = sentence.toLowerCase().match(/[a-z0-9']+/g);
    if (!words) return;
    let prev = '<s>';
    for (const word of words) {
      let row = this.bigrams.get(prev);
      if (!row) this.bigrams.set(prev, (row = new Map()));
      row.set(word, (row.get(word) ?? 0) + weight);
      if (!this.trie.has(word) && word.length > 1) {
        this.trie.insert(word, 1);
        this.cache.clear();
      }
      prev = word;
    }
    if (persist) this.save(sentence);
  }

  private save(sentence: string) {
    try {
      const learned: string[] = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
      learned.push(sentence);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(learned.slice(-200)));
    } catch {
      // Storage unavailable (private mode): suggestions just don't persist.
    }
  }

  private restore() {
    try {
      const learned: string[] = JSON.parse(globalThis.localStorage?.getItem(STORAGE_KEY) ?? '[]');
      for (const sentence of learned) this.learn(sentence, 3, false);
    } catch {
      // Ignore unreadable history.
    }
  }
}

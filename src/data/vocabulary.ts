/**
 * Display text and Hindi for every label the models can output.
 * Keys are the exact strings in public/model/<name>/labels.json.
 */
export interface VocabEntry {
  /** Text added to the sentence. */
  text: string;
  hindi: string;
  group: 'greeting' | 'people' | 'health' | 'describe' | 'time' | 'place' | 'letter' | 'number';
}

const w = (text: string, hindi: string, group: VocabEntry['group']): VocabEntry => ({ text, hindi, group });

export const WORDS: Record<string, VocabEntry> = {
  hello: w('hello', 'नमस्ते', 'greeting'),
  'how are you': w('how are you', 'आप कैसे हैं', 'greeting'),
  'thank you': w('thank you', 'धन्यवाद', 'greeting'),
  'good morning': w('good morning', 'सुप्रभात', 'greeting'),
  'good afternoon': w('good afternoon', 'शुभ दोपहर', 'greeting'),
  'good evening': w('good evening', 'शुभ संध्या', 'greeting'),
  'good night': w('good night', 'शुभ रात्रि', 'greeting'),
  alright: w('alright', 'ठीक है', 'greeting'),
  pleased: w('pleased', 'प्रसन्न', 'greeting'),

  i: w('I', 'मैं', 'people'),
  you: w('you', 'आप', 'people'),
  he: w('he', 'वह', 'people'),
  she: w('she', 'वह', 'people'),
  it: w('it', 'यह', 'people'),
  we: w('we', 'हम', 'people'),
  they: w('they', 'वे', 'people'),
  mother: w('mother', 'माँ', 'people'),
  father: w('father', 'पिता', 'people'),
  brother: w('brother', 'भाई', 'people'),
  sister: w('sister', 'बहन', 'people'),
  friend: w('friend', 'दोस्त', 'people'),
  family: w('family', 'परिवार', 'people'),
  child: w('child', 'बच्चा', 'people'),
  baby: w('baby', 'शिशु', 'people'),
  husband: w('husband', 'पति', 'people'),
  wife: w('wife', 'पत्नी', 'people'),
  teacher: w('teacher', 'शिक्षक', 'people'),
  student: w('student', 'छात्र', 'people'),

  doctor: w('doctor', 'डॉक्टर', 'health'),
  patient: w('patient', 'मरीज़', 'health'),
  hospital: w('hospital', 'अस्पताल', 'health'),
  medicine: w('medicine', 'दवा', 'health'),
  sick: w('sick', 'बीमार', 'health'),
  healthy: w('healthy', 'स्वस्थ', 'health'),
  police: w('police', 'पुलिस', 'health'),
  attack: w('attack', 'हमला', 'health'),
  death: w('death', 'मृत्यु', 'health'),
  money: w('money', 'पैसा', 'health'),

  good: w('good', 'अच्छा', 'describe'),
  bad: w('bad', 'बुरा', 'describe'),
  hot: w('hot', 'गरम', 'describe'),
  cold: w('cold', 'ठंडा', 'describe'),
  happy: w('happy', 'खुश', 'describe'),
  fast: w('fast', 'तेज़', 'describe'),
  slow: w('slow', 'धीमा', 'describe'),
  loud: w('loud', 'ऊँची आवाज़', 'describe'),
  quiet: w('quiet', 'शांत', 'describe'),
  old: w('old', 'पुराना', 'describe'),
  new: w('new', 'नया', 'describe'),
  young: w('young', 'जवान', 'describe'),

  today: w('today', 'आज', 'time'),
  tomorrow: w('tomorrow', 'आने वाला कल', 'time'),
  yesterday: w('yesterday', 'बीता हुआ कल', 'time'),
  morning: w('morning', 'सुबह', 'time'),
  night: w('night', 'रात', 'time'),
  time: w('time', 'समय', 'time'),

  house: w('house', 'घर', 'place'),
  school: w('school', 'स्कूल', 'place'),
  bank: w('bank', 'बैंक', 'place'),
  office: w('office', 'दफ़्तर', 'place'),
  market: w('market', 'बाज़ार', 'place'),
  bathroom: w('bathroom', 'शौचालय', 'place'),
  bed: w('bed', 'बिस्तर', 'place'),
  door: w('door', 'दरवाज़ा', 'place'),
  telephone: w('telephone', 'टेलीफ़ोन', 'place'),
  key: w('key', 'चाबी', 'place'),
  bus: w('bus', 'बस', 'place'),
  car: w('car', 'कार', 'place'),
  train: w('train', 'रेलगाड़ी', 'place'),
  'cell phone': w('cell phone', 'मोबाइल फ़ोन', 'place'),
};

const HINDI_DIGITS = ['शून्य', 'एक', 'दो', 'तीन', 'चार', 'पाँच', 'छह', 'सात', 'आठ', 'नौ'];
const HINDI_LETTERS: Record<string, string> = {
  A: 'ए', B: 'बी', C: 'सी', D: 'डी', E: 'ई', F: 'एफ़', G: 'जी', H: 'एच', I: 'आई', J: 'जे', K: 'के', L: 'एल', M: 'एम',
  N: 'एन', O: 'ओ', P: 'पी', Q: 'क्यू', R: 'आर', S: 'एस', T: 'टी', U: 'यू', V: 'वी', W: 'डब्ल्यू', X: 'एक्स', Y: 'वाई', Z: 'ज़ेड',
};

/** Looks up any model label. Unknown labels are shown as they are. */
export function vocab(label: string): VocabEntry {
  const word = WORDS[label];
  if (word) return word;
  if (label.startsWith('_')) return { text: 'no sign', hindi: '', group: 'describe' };
  if (/^[0-9]$/.test(label)) return { text: label, hindi: HINDI_DIGITS[Number(label)], group: 'number' };
  if (/^[A-Z]$/.test(label)) return { text: label, hindi: HINDI_LETTERS[label] ?? label, group: 'letter' };
  return { text: label, hindi: '', group: 'describe' };
}

export const GROUP_NAMES: Record<VocabEntry['group'], string> = {
  greeting: 'Greetings',
  people: 'People',
  health: 'Health and help',
  describe: 'Describing',
  time: 'Time',
  place: 'Places and things',
  letter: 'Letters',
  number: 'Numbers',
};

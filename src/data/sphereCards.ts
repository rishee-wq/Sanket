import type { ArtPose } from '../lib/signArt';

export interface SphereCard {
  id: string;
  title: string;
  /** "sign" cards show one hand shape; "place" cards show where being understood matters. */
  kind: 'sign' | 'place';
  /** Small line under the title, e.g. "Sign · Courtesy" or "Hospitals · Clinics". */
  where: string;
  note: string;
  hindi: string;
  poses: ArtPose[];
  tall?: boolean;
}

/** 21 cards for the landing-page sphere, in sphere order. Exactly one is tall. */
export const SPHERE_CARDS: SphereCard[] = [
  {
    id: 'hello', title: 'Hello', kind: 'sign', where: 'Sign · Courtesy', hindi: 'नमस्ते', poses: ['Hello'],
    note: 'The first sign most people learn, and the one that opens every conversation in Sanket. Open palm, fingers spread, held for a second.',
  },
  {
    id: 'clinic', title: 'At the Clinic', kind: 'place', where: 'Hospitals · Clinics', hindi: 'दवाखाना', poses: ['Pain', 'Help'],
    note: 'A patient explains where it hurts. The doctor reads the words on screen and answers out loud, and Sanket turns the reply into large captions.',
  },
  {
    id: 'help', title: 'Help', kind: 'sign', where: 'Sign · Everyday', hindi: 'मदद', poses: ['Help'],
    note: 'Thumb, index and little finger out. It adds “Help” to the sentence. It is not the emergency trigger; that is the SOS sign.',
  },
  {
    id: 'bank', title: 'The Bank Counter', kind: 'place', where: 'Public counters', hindi: 'बैंक', poses: ['Hello', '2'],
    note: 'Account, cash, signature. Short, practical exchanges that should not need an interpreter booked days in advance.',
  },
  {
    id: 'water', title: 'Water', kind: 'sign', where: 'Sign · Needs', hindi: 'पानी', poses: ['Water'],
    note: 'Little finger raised. Water is one of the eight quick phrases on the conversation screen, because it is asked for so often.',
  },
  {
    id: 'railway', title: 'Railway Enquiry', kind: 'place', where: 'Stations', hindi: 'रेलवे', poses: ['1', '3'],
    note: 'Which platform, which train, how late. Questions that should take ten seconds, not ten minutes of pointing.',
  },
  {
    id: 'doctor', title: 'Doctor', kind: 'sign', where: 'Sign · Health', hindi: 'डॉक्टर', poses: ['Doctor'],
    note: 'Thumb and index finger form an L. Together with Pain, it is enough to start a conversation at any front desk.',
  },
  {
    id: 'emergency', title: 'When Help Can’t Be Called', kind: 'place', where: 'Emergencies', hindi: 'आपातकाल', poses: ['SOS', 'SOS'],
    note: 'Hold the SOS sign and Sanket opens an alert with your location and the message for your emergency contacts. You have five seconds to cancel.',
  },
  {
    id: 'yes', title: 'Yes', kind: 'sign', where: 'Sign · Answers', hindi: 'हाँ', poses: ['Yes'],
    note: 'Thumb up. Small signs like Yes and No carry most of a real conversation.',
  },
  {
    id: 'family', title: 'Dinner Table', kind: 'place', where: 'Families', hindi: 'परिवार', poses: ['Hello', 'Yes'],
    note: 'Hearing parents and siblings learning ISL one sign at a time, with a match score that tells them how close they are.',
  },
  {
    id: 'pain', title: 'Pain', kind: 'sign', where: 'Sign · Health', hindi: 'दर्द', poses: ['Pain'],
    note: 'Thumb pointing down. Sanket adds the word; you point to where it hurts.',
  },
  {
    id: 'office', title: 'Government Office', kind: 'place', where: 'Public services', hindi: 'दफ़्तर', poses: ['No', '1'],
    note: 'Forms, queues, and officials who rarely know ISL. Signs become speech one way and speech becomes captions the other.',
  },
  {
    id: 'thanks', title: 'Thank You', kind: 'sign', where: 'Sign · Courtesy', hindi: 'धन्यवाद', poses: ['Thank you'],
    note: 'Thumb and index finger touching, the other fingers open. Every conversation deserves a proper ending.',
  },
  {
    id: 'classroom', title: 'Learning Together', kind: 'place', where: 'Classrooms', hindi: 'कक्षा', poses: ['2', '3'],
    note: 'Learn mode shows a target sign, watches you perform it and scores the match, so practice always has feedback.',
  },
  {
    id: 'no', title: 'No', kind: 'sign', where: 'Sign · Answers', hindi: 'नहीं', poses: ['No'],
    note: 'A closed fist. Clear, fast, and hard to mistake for anything else on camera.',
  },
  {
    id: 'pharmacy', title: 'The Pharmacy', kind: 'place', where: 'Everyday errands', hindi: 'दवा', poses: ['Water', 'O'],
    note: 'Naming a medicine, asking how often to take it. Captions make sure the answer is not lost.',
  },
  {
    id: 'sos', title: 'SOS', kind: 'sign', where: 'Sign · Emergency', hindi: 'बचाओ', poses: ['SOS'],
    note: 'Open palm with the thumb folded across it, adapted from the international Signal for Help. Held for a second, it opens the SOS screen.',
  },
  {
    id: 'friends', title: 'Out with Friends', kind: 'place', where: 'Everyday life', hindi: 'दोस्त', poses: ['Thank you', 'Hello'],
    note: 'Not every conversation is a transaction. Sometimes it is just catching up.',
  },
  {
    id: 'numbers', title: 'Numbers', kind: 'sign', where: 'Sign · Spelling', hindi: 'अंक', poses: ['3'],
    note: 'Numbers and letters are signed one at a time and join into a single word, so 2, 0, 2, 6 becomes 2026.',
  },
  {
    id: 'sanket', title: 'Sanket', kind: 'place', where: 'संकेत · signal, gesture', hindi: 'संकेत', poses: ['Hello'], tall: true,
    note: 'A sign is a signal. Sanket reads 21 points on each hand in every video frame, entirely in your browser. No video leaves your device.',
  },
  {
    id: 'letters', title: 'O', kind: 'sign', where: 'Sign · Letters', hindi: 'अक्षर', poses: ['O'],
    note: 'Fingertips curved to meet the thumb. Letters spell what a single sign cannot say yet: names, places, medicines.',
  },
];

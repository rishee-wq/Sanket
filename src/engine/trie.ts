/**
 * Trie (prefix tree) of the app's vocabulary.
 *
 * DATA STRUCTURE: each node has one child per next letter; a path from the root
 * spells a prefix. Looking up a prefix of length m costs O(m), no matter how
 * many words are stored.
 *
 * Two queries power fingerspelling:
 *
 * 1. complete(prefix, k): autocomplete. Walk down to the prefix node, then
 *    explore its subtree and keep the k most frequent words with a min-heap.
 *    Each node stores the best weight below it, so subtrees that cannot beat
 *    the current k-th best are skipped (branch and bound).
 *
 * 2. fuzzy(word, maxEdits): spelling correction with LEVENSHTEIN EDIT DISTANCE
 *    (dynamic programming). The classic algorithm fills a table where
 *    row[j] = fewest insert/delete/substitute edits to turn the first j letters
 *    of `word` into the current trie prefix. Walking the trie depth-first, each
 *    node computes its row from its parent's row in O(len(word)), so words that
 *    share a prefix share that work. If every entry in a row already exceeds
 *    maxEdits, nothing below that node can match, and the subtree is pruned.
 *    Recognising "HOSPITL" or "HOSPTAL" still offers HOSPITAL.
 */
import { TopK } from './heap.ts';

class TrieNode {
  children = new Map<string, TrieNode>();
  /** > 0 if a word ends here. */
  weight = 0;
  /** Highest weight of any word at or below this node. */
  best = 0;
  word: string | null = null;
}

export interface Suggestion {
  word: string;
  weight: number;
  /** Edit distance from the query (0 for prefix completions). */
  edits: number;
}

export class Trie {
  private readonly root = new TrieNode();
  size = 0;

  /** Adds a word, or raises its weight if it is already present. O(length). */
  insert(word: string, weight = 1) {
    const key = word.toUpperCase();
    if (!key) return;
    let node = this.root;
    node.best = Math.max(node.best, weight);
    for (const ch of key) {
      let next = node.children.get(ch);
      if (!next) {
        next = new TrieNode();
        node.children.set(ch, next);
      }
      node = next;
      node.best = Math.max(node.best, weight);
    }
    if (node.word === null) this.size++;
    node.word = key;
    node.weight = Math.max(node.weight, weight);
  }

  has(word: string): boolean {
    const node = this.find(word.toUpperCase());
    return node !== null && node.word !== null;
  }

  private find(prefix: string): TrieNode | null {
    let node = this.root;
    for (const ch of prefix) {
      const next = node.children.get(ch);
      if (!next) return null;
      node = next;
    }
    return node;
  }

  /** The k heaviest words that start with `prefix`. */
  complete(prefix: string, k = 5): Suggestion[] {
    const start = this.find(prefix.toUpperCase());
    if (!start) return [];
    const top = new TopK<string>(k);
    const stack: TrieNode[] = [start];
    while (stack.length) {
      const node = stack.pop()!;
      if (node.best <= top.floor()) continue; // nothing below can enter the top k
      if (node.word !== null) top.offer(node.word, node.weight);
      for (const child of node.children.values()) stack.push(child);
    }
    return top.result().map((s) => ({ word: s.item, weight: s.score, edits: 0 }));
  }

  /** Words within `maxEdits` insertions, deletions or substitutions of `word`, closest first. */
  fuzzy(word: string, maxEdits = 1, k = 5): Suggestion[] {
    const target = word.toUpperCase();
    const n = target.length;
    const found: Suggestion[] = [];
    const firstRow = new Uint16Array(n + 1);
    for (let j = 0; j <= n; j++) firstRow[j] = j;

    const visit = (node: TrieNode, ch: string, prev: Uint16Array) => {
      const row = new Uint16Array(n + 1);
      row[0] = prev[0] + 1;
      let rowMin = row[0];
      for (let j = 1; j <= n; j++) {
        const cost = target[j - 1] === ch ? 0 : 1;
        row[j] = Math.min(row[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
        if (row[j] < rowMin) rowMin = row[j];
      }
      if (node.word !== null && row[n] <= maxEdits) found.push({ word: node.word, weight: node.weight, edits: row[n] });
      if (rowMin > maxEdits) return; // prune: no extension of this prefix can get closer
      for (const [next, child] of node.children) visit(child, next, row);
    };
    for (const [ch, child] of this.root.children) visit(child, ch, firstRow);

    found.sort((a, b) => a.edits - b.edits || b.weight - a.weight);
    return found.slice(0, k);
  }
}

/** Plain two-row Levenshtein distance, O(len(a) × len(b)) time and O(len(b)) memory. */
export function editDistance(a: string, b: string): number {
  let prev = new Uint16Array(b.length + 1);
  let row = new Uint16Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(row[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    [prev, row] = [row, prev];
  }
  return prev[b.length];
}

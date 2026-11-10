/**
 * LRU (least recently used) cache.
 *
 * DATA STRUCTURES: a hash map for O(1) lookup + a doubly linked list that keeps
 * entries in order of use. On every get/set the entry is unlinked and moved to
 * the front in O(1); when the cache is full the entry at the back (the one not
 * touched for the longest time) is evicted in O(1).
 *
 * Used to memoise suggestion queries: while someone fingerspells, the same
 * prefixes are asked for again and again (after every accepted letter and on
 * every re-render), and each trie search is far more work than a map lookup.
 */
interface Node<K, V> {
  key: K;
  value: V;
  prev: Node<K, V> | null;
  next: Node<K, V> | null;
}

export class LruCache<K, V> {
  private readonly map = new Map<K, Node<K, V>>();
  private head: Node<K, V> | null = null; // most recently used
  private tail: Node<K, V> | null = null; // least recently used
  private readonly capacity: number;
  hits = 0;
  misses = 0;

  constructor(capacity: number) {
    this.capacity = capacity;
  }

  get size(): number {
    return this.map.size;
  }

  get(key: K): V | undefined {
    const node = this.map.get(key);
    if (!node) {
      this.misses++;
      return undefined;
    }
    this.hits++;
    this.unlink(node);
    this.pushFront(node);
    return node.value;
  }

  set(key: K, value: V) {
    const existing = this.map.get(key);
    if (existing) {
      existing.value = value;
      this.unlink(existing);
      this.pushFront(existing);
      return;
    }
    if (this.map.size >= this.capacity && this.tail) {
      this.map.delete(this.tail.key);
      this.unlink(this.tail);
    }
    const node: Node<K, V> = { key, value, prev: null, next: null };
    this.map.set(key, node);
    this.pushFront(node);
  }

  clear() {
    this.map.clear();
    this.head = this.tail = null;
  }

  private unlink(node: Node<K, V>) {
    if (node.prev) node.prev.next = node.next;
    else this.head = node.next;
    if (node.next) node.next.prev = node.prev;
    else this.tail = node.prev;
    node.prev = node.next = null;
  }

  private pushFront(node: Node<K, V>) {
    node.next = this.head;
    if (this.head) this.head.prev = node;
    this.head = node;
    if (!this.tail) this.tail = node;
  }
}

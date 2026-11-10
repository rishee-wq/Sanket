/**
 * Top-k selection with a bounded min-heap.
 *
 * DATA STRUCTURE: binary min-heap stored in an array (parent of i is (i-1)>>1).
 * ALGORITHM: keep the k largest items seen so far; the SMALLEST of them sits at
 * the root, so each new item is compared with the root in O(1) and, only if it
 * is larger, replaces it and sifts down in O(log k).
 *
 *   top-k of n items: O(n log k) time, O(k) memory
 *   full sort:        O(n log n) time, O(n) memory
 *
 * Used for the "top 3 candidates" of every model output (71 classes, every
 * frame) and for ranking autocomplete suggestions.
 */
export interface Scored<T> {
  item: T;
  score: number;
}

export class MinHeap<T> {
  private readonly data: Scored<T>[] = [];

  get size(): number {
    return this.data.length;
  }

  peek(): Scored<T> | undefined {
    return this.data[0];
  }

  push(item: T, score: number) {
    const data = this.data;
    data.push({ item, score });
    let i = data.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (data[parent].score <= data[i].score) break;
      [data[parent], data[i]] = [data[i], data[parent]];
      i = parent;
    }
  }

  pop(): Scored<T> | undefined {
    const data = this.data;
    const top = data[0];
    const last = data.pop();
    if (data.length > 0 && last) {
      data[0] = last;
      this.siftDown(0);
    }
    return top;
  }

  /** Replaces the root (the smallest item) and restores the heap. */
  replaceRoot(item: T, score: number) {
    this.data[0] = { item, score };
    this.siftDown(0);
  }

  private siftDown(i: number) {
    const data = this.data;
    const n = data.length;
    for (;;) {
      const left = 2 * i + 1;
      const right = left + 1;
      let smallest = i;
      if (left < n && data[left].score < data[smallest].score) smallest = left;
      if (right < n && data[right].score < data[smallest].score) smallest = right;
      if (smallest === i) return;
      [data[smallest], data[i]] = [data[i], data[smallest]];
      i = smallest;
    }
  }

  /** Empties the heap, returning its items from highest to lowest score. */
  drainDescending(): Scored<T>[] {
    const out: Scored<T>[] = [];
    for (let s = this.pop(); s; s = this.pop()) out.push(s);
    return out.reverse();
  }
}

/** Keeps the k highest-scoring items offered to it. */
export class TopK<T> {
  private readonly heap = new MinHeap<T>();
  private readonly k: number;

  constructor(k: number) {
    this.k = k;
  }

  offer(item: T, score: number) {
    if (this.heap.size < this.k) this.heap.push(item, score);
    else if (score > this.heap.peek()!.score) this.heap.replaceRoot(item, score);
  }

  /** Score an item must beat to enter the top k (-Infinity until k items are held). */
  floor(): number {
    return this.heap.size < this.k ? -Infinity : this.heap.peek()!.score;
  }

  result(): Scored<T>[] {
    return this.heap.drainDescending();
  }
}

/** Indices of the k largest values, highest first. Indices in `skip` are ignored. */
export function topKIndices(values: ArrayLike<number>, k: number, skip = -1): Scored<number>[] {
  const top = new TopK<number>(k);
  for (let i = 0; i < values.length; i++) if (i !== skip) top.offer(i, values[i]);
  return top.result();
}

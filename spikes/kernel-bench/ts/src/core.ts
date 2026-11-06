// Kernel hot-path primitives shared by every benchmark variant.
// The Go implementation in ../../go/core.go must produce identical results.

export const KINDS = 34;

// mulberry32: identical integer arithmetic in Go (uint32 wraparound).
export function createRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  };
}

// Physical tiles 0..135, kind = id >> 2. Fisher-Yates with integer modulo.
export function buildWall(rng: () => number): Uint8Array {
  const wall = new Uint8Array(136);
  for (let i = 0; i < 136; i++) wall[i] = i;
  for (let i = 135; i > 0; i--) {
    const j = rng() % (i + 1);
    const tmp = wall[i]!;
    wall[i] = wall[j]!;
    wall[j] = tmp;
  }
  return wall;
}

function countMelds(c: Uint8Array, start: number): number {
  let i = start;
  while (i < KINDS && c[i] === 0) i++;
  if (i === KINDS) return 1;
  let ways = 0;
  if (c[i]! >= 3) {
    c[i]! -= 3;
    ways += countMelds(c, i);
    c[i]! += 3;
  }
  if (i < 27 && i % 9 <= 6 && c[i + 1]! > 0 && c[i + 2]! > 0) {
    c[i]!--;
    c[i + 1]!--;
    c[i + 2]!--;
    ways += countMelds(c, i);
    c[i]!++;
    c[i + 1]!++;
    c[i + 2]!++;
  }
  return ways;
}

function hasMelds(c: Uint8Array, start: number): boolean {
  let i = start;
  while (i < KINDS && c[i] === 0) i++;
  if (i === KINDS) return true;
  if (c[i]! >= 3) {
    c[i]! -= 3;
    const ok = hasMelds(c, i);
    c[i]! += 3;
    if (ok) return true;
  }
  if (i < 27 && i % 9 <= 6 && c[i + 1]! > 0 && c[i + 2]! > 0) {
    c[i]!--;
    c[i + 1]!--;
    c[i + 2]!--;
    const ok = hasMelds(c, i);
    c[i]!++;
    c[i + 1]!++;
    c[i + 2]!++;
    if (ok) return true;
  }
  return false;
}

const TERMINALS_HONORS = [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33];

function isChiitoi(c: Uint8Array): boolean {
  let pairs = 0;
  for (let k = 0; k < KINDS; k++) {
    if (c[k] === 2) pairs++;
    else if (c[k] !== 0) return false;
  }
  return pairs === 7;
}

function isKokushi(c: Uint8Array): boolean {
  let total = 0;
  let hasPair = false;
  for (const k of TERMINALS_HONORS) {
    if (c[k] === 0) return false;
    if (c[k] === 2) hasPair = true;
    total += c[k]!;
  }
  return total === 14 && hasPair;
}

// Number of distinct decompositions of a 14-tile hand (standard + chiitoi + kokushi).
export function countDecompositions(c: Uint8Array): number {
  let total = 0;
  for (let p = 0; p < KINDS; p++) {
    if (c[p]! >= 2) {
      c[p]! -= 2;
      total += countMelds(c, 0);
      c[p]! += 2;
    }
  }
  if (isChiitoi(c)) total++;
  if (isKokushi(c)) total++;
  return total;
}

export function isComplete(c: Uint8Array): boolean {
  for (let p = 0; p < KINDS; p++) {
    if (c[p]! >= 2) {
      c[p]! -= 2;
      const ok = hasMelds(c, 0);
      c[p]! += 2;
      if (ok) return true;
    }
  }
  return isChiitoi(c) || isKokushi(c);
}

// Kinds that complete a 13-tile hand.
export function waits(c: Uint8Array): number[] {
  const out: number[] = [];
  for (let k = 0; k < KINDS; k++) {
    if (c[k]! >= 4) continue;
    c[k]!++;
    if (isComplete(c)) out.push(k);
    c[k]!--;
  }
  return out;
}

// "123m456p789s11122z" -> counts. z: 1-4 winds, 5-7 dragons.
export function parseHand(text: string): Uint8Array {
  const c = new Uint8Array(KINDS);
  let digits: number[] = [];
  for (const ch of text) {
    if (ch >= '0' && ch <= '9') {
      digits.push(Number(ch));
      continue;
    }
    const base = { m: 0, p: 9, s: 18, z: 27 }[ch];
    if (base === undefined) throw new Error(`bad suit ${ch}`);
    for (const d of digits) c[base + d - 1]!++;
    digits = [];
  }
  return c;
}

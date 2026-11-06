import { KINDS, countDecompositions, waits } from './core';

export type Responder = {
  seat: number;
  counts: Uint8Array; // 13 tiles
  discards: number[]; // kinds
};

export type Situation = {
  discarder: number;
  discardKind: number;
  players: Responder[]; // all four seats; the discarder is skipped at evaluation
};

export type RuleInput = {
  hand: ArrayLike<number>;
  waits: number[];
  discards: number[];
  seatWind: number;
  roundWind: number;
  ronDecomps: number;
};

export type RuleOutput = {
  furiten: boolean;
  tanyao: boolean;
  yakuhai: number;
  canRon: boolean;
};

function randomHand(rng: () => number): Uint8Array {
  const c = new Uint8Array(KINDS);
  let n = 0;
  while (n < 13) {
    const k = rng() % KINDS;
    if (c[k]! < 4) {
      c[k]!++;
      n++;
    }
  }
  return c;
}

// A complete 14-tile hand with one tile removed, so it is tenpai.
function tenpaiHand(rng: () => number): Uint8Array {
  const c = new Uint8Array(KINDS);
  c[rng() % KINDS]! += 2;
  for (let m = 0; m < 4; m++) {
    for (;;) {
      if (rng() % 2 === 0) {
        const k = rng() % KINDS;
        if (c[k]! + 3 <= 4) {
          c[k]! += 3;
          break;
        }
      } else {
        const k = (rng() % 3) * 9 + (rng() % 7);
        if (c[k]! < 4 && c[k + 1]! < 4 && c[k + 2]! < 4) {
          c[k]!++;
          c[k + 1]!++;
          c[k + 2]!++;
          break;
        }
      }
    }
  }
  const tiles: number[] = [];
  for (let k = 0; k < KINDS; k++) for (let i = 0; i < c[k]!; i++) tiles.push(k);
  c[tiles[rng() % 14]!]!--;
  return c;
}

export function generateSituations(
  rng: () => number,
  count: number,
): Situation[] {
  const out: Situation[] = [];
  for (let s = 0; s < count; s++) {
    const discarder = rng() % 4;
    const discardKind = rng() % KINDS;
    const players: Responder[] = [];
    for (let seat = 0; seat < 4; seat++) {
      const counts = rng() % 2 === 0 ? randomHand(rng) : tenpaiHand(rng);
      const n = rng() % 13;
      const discards: number[] = [];
      for (let i = 0; i < n; i++) discards.push(rng() % KINDS);
      players.push({ seat, counts, discards });
    }
    out.push({ discarder, discardKind, players });
  }
  return out;
}

// Kernel work for one responder. Returns the core facts and the rule input.
export function evaluateCore(
  sit: Situation,
  p: Responder,
): { canPon: boolean; canChi: boolean; input: RuleInput } {
  const c = p.counts;
  const d = sit.discardKind;
  let ronDecomps = 0;
  if (c[d]! < 4) {
    c[d]!++;
    ronDecomps = countDecompositions(c);
    c[d]!--;
  }
  const canPon = c[d]! >= 2;
  let canChi = false;
  if (p.seat === (sit.discarder + 1) % 4 && d < 27) {
    const r = d % 9;
    canChi =
      (r >= 2 && c[d - 2]! > 0 && c[d - 1]! > 0) ||
      (r >= 1 && r <= 7 && c[d - 1]! > 0 && c[d + 1]! > 0) ||
      (r <= 6 && c[d + 1]! > 0 && c[d + 2]! > 0);
  }
  const w = waits(c);
  return {
    canPon,
    canChi,
    input: {
      hand: c,
      waits: w,
      discards: p.discards,
      seatWind: 27 + p.seat,
      roundWind: 27,
      ronDecomps,
    },
  };
}

export function responders(sit: Situation): Responder[] {
  return [1, 2, 3].map((o) => sit.players[(sit.discarder + o) % 4]!);
}

export function checksumOf(
  ronDecomps: number,
  waitCount: number,
  canPon: boolean,
  canChi: boolean,
  r: RuleOutput,
): number {
  return (
    ronDecomps +
    waitCount * 7 +
    (canPon ? 3 : 0) +
    (canChi ? 5 : 0) +
    (r.furiten ? 11 : 0) +
    (r.tanyao ? 13 : 0) +
    r.yakuhai * 17 +
    (r.canRon ? 19 : 0)
  );
}

// Plain-array copy for crossing a sandbox boundary (JSON of a Uint8Array is an object).
export function toWire(input: RuleInput) {
  return { ...input, hand: Array.from(input.hand) };
}

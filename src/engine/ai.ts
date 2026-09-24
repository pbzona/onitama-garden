import { CARDS } from './cards.ts';
import {
  applyMove,
  clone,
  EMPTY,
  type GameState,
  legalMoves,
  type Move,
  owner,
  P0_MASTER,
  P1_MASTER,
  type Player,
  TEMPLE,
  xOf,
  yOf,
  idx,
  delta,
} from './game.ts';

// Negamax + alpha-beta + iterative deepening + transposition table.

export type Difficulty = 'easy' | 'normal' | 'hard';

const WIN = 100000;

// ---- Zobrist hashing (two 32-bit halves to keep collisions rare) ----
let seed = 0x9e3779b9;
const rnd32 = () => {
  seed ^= seed << 13;
  seed ^= seed >>> 17;
  seed ^= seed << 5;
  return seed >>> 0;
};
const Z_PIECE = Array.from({ length: 25 * 5 }, rnd32);
const Z_HAND = Array.from({ length: 16 * 2 }, rnd32);
const Z_SIDE = Array.from({ length: 16 }, rnd32);
const Z_TURN = rnd32();

function hash(s: GameState): number {
  let h = 0;
  const b = s.board;
  for (let i = 0; i < 25; i++) if (b[i]) h ^= Z_PIECE[i * 5 + b[i]];
  h ^= Z_HAND[s.hands[0][0]] ^ Z_HAND[s.hands[0][1]];
  h ^= Z_HAND[16 + s.hands[1][0]] ^ Z_HAND[16 + s.hands[1][1]];
  h ^= Z_SIDE[s.side];
  if (s.turn) h ^= Z_TURN;
  return h >>> 0;
}

interface TTEntry {
  depth: number;
  score: number;
  flag: 0 | 1 | 2; // exact, lower, upper
  best: Move | null;
}

// ---- Evaluation (from the perspective of the side to move) ----
const CENTER = [0, 1, 2, 1, 0];

function canWinNow(s: GameState, pl: Player): boolean {
  // Can `pl`, using its current hand, capture the enemy master or reach the enemy temple?
  const b = s.board;
  const enemyMaster = pl === 0 ? P1_MASTER : P0_MASTER;
  const myMaster = pl === 0 ? P0_MASTER : P1_MASTER;
  const goal = TEMPLE[pl === 0 ? 1 : 0];
  for (const card of s.hands[pl]) {
    const n = CARDS[card].moves.length;
    for (let i = 0; i < 25; i++) {
      const p = b[i];
      if (owner(p) !== pl) continue;
      const x = xOf(i), y = yOf(i);
      for (let k = 0; k < n; k++) {
        const [dx, dy] = delta(card, pl, k);
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || nx > 4 || ny < 0 || ny > 4) continue;
        const t = idx(nx, ny);
        if (b[t] === enemyMaster) return true;
        if (p === myMaster && t === goal && owner(b[t]) !== pl) return true;
      }
    }
  }
  return false;
}

function mobility(s: GameState, pl: Player): number {
  const b = s.board;
  let m = 0;
  for (const card of s.hands[pl]) {
    const n = CARDS[card].moves.length;
    for (let i = 0; i < 25; i++) {
      if (owner(b[i]) !== pl) continue;
      const x = xOf(i), y = yOf(i);
      for (let k = 0; k < n; k++) {
        const [dx, dy] = delta(card, pl, k);
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || nx > 4 || ny < 0 || ny > 4) continue;
        if (owner(b[idx(nx, ny)]) !== pl) m++;
      }
    }
  }
  return m;
}

function evaluate(s: GameState): number {
  const me = s.turn;
  if (canWinNow(s, me)) return WIN - 50;
  const b = s.board;
  let score = 0;
  for (let i = 0; i < 25; i++) {
    const p = b[i];
    if (p === EMPTY) continue;
    const pl = owner(p);
    const sign = pl === me ? 1 : -1;
    const x = xOf(i), y = yOf(i);
    const adv = pl === 0 ? y : 4 - y;
    if (p === P0_MASTER || p === P1_MASTER) {
      const goal = TEMPLE[pl === 0 ? 1 : 0];
      const dist = Math.max(Math.abs(xOf(goal) - x), Math.abs(yOf(goal) - y));
      score += sign * (4 - dist) * 6;
    } else {
      score += sign * (100 + adv * 3 + CENTER[x] * 4 + CENTER[y] * 2);
    }
  }
  score += (mobility(s, me) - mobility(s, (1 - me) as Player)) * 2;
  // Being threatened while it's the opponent's reply matters: if the opponent could win from
  // here with their hand we can still parry, so only a mild penalty.
  if (canWinNow(s, (1 - me) as Player)) score -= 60;
  return score;
}

// ---- Search ----
class Search {
  tt = new Map<number, TTEntry>();
  nodes = 0;
  deadline = Infinity;
  aborted = false;

  order(s: GameState, moves: Move[], ttMove: Move | null) {
    const b = s.board;
    const scored = moves.map((m) => {
      let v = 0;
      if (ttMove && m.card === ttMove.card && m.from === ttMove.from && m.to === ttMove.to) v = 1e6;
      else if (m.to >= 0) {
        const cap = b[m.to];
        if (cap === P0_MASTER || cap === P1_MASTER) v = 5e5;
        else if (cap !== EMPTY) v = 1e4;
        const p = b[m.from];
        if ((p === P0_MASTER || p === P1_MASTER) && m.to === TEMPLE[s.turn === 0 ? 1 : 0]) v = 5e5;
      }
      return { m, v };
    });
    scored.sort((a, c) => c.v - a.v);
    return scored.map((x) => x.m);
  }

  negamax(s: GameState, depth: number, alpha: number, beta: number, ply: number): number {
    this.nodes++;
    if ((this.nodes & 1023) === 0 && performance.now() > this.deadline) this.aborted = true;
    if (this.aborted) return 0;
    if (s.winner !== -1) return s.winner === s.turn ? WIN - ply : -(WIN - ply);
    if (depth <= 0) return evaluate(s);

    const key = hash(s);
    const e = this.tt.get(key);
    const a0 = alpha;
    if (e && e.depth >= depth) {
      if (e.flag === 0) return e.score;
      if (e.flag === 1) alpha = Math.max(alpha, e.score);
      else beta = Math.min(beta, e.score);
      if (alpha >= beta) return e.score;
    }

    const moves = this.order(s, legalMoves(s), e?.best ?? null);
    let best = -Infinity;
    let bestMove: Move | null = null;
    for (const m of moves) {
      const c = clone(s);
      applyMove(c, m);
      const v = -this.negamax(c, depth - 1, -beta, -alpha, ply + 1);
      if (this.aborted) return 0;
      if (v > best) {
        best = v;
        bestMove = m;
      }
      if (v > alpha) alpha = v;
      if (alpha >= beta) break;
    }
    this.tt.set(key, {
      depth,
      score: best,
      flag: best <= a0 ? 2 : best >= beta ? 1 : 0,
      best: bestMove,
    });
    return best;
  }

  root(s: GameState, depth: number): { move: Move; score: number; scores: { m: Move; v: number }[] } | null {
    const e = this.tt.get(hash(s));
    const moves = this.order(s, legalMoves(s), e?.best ?? null);
    let alpha = -Infinity;
    let best: Move = moves[0];
    const scores: { m: Move; v: number }[] = [];
    for (const m of moves) {
      const c = clone(s);
      applyMove(c, m);
      const v = -this.negamax(c, depth - 1, -Infinity, -alpha, 1);
      if (this.aborted) return null;
      scores.push({ m, v });
      if (v > alpha) {
        alpha = v;
        best = m;
      }
    }
    this.tt.set(hash(s), { depth, score: alpha, flag: 0, best });
    return { move: best, score: alpha, scores };
  }
}

export interface AIResult {
  move: Move;
  score: number;
  depth: number;
  nodes: number;
}

const LEVELS: Record<Difficulty, { maxDepth: number; timeMs: number; noise: number }> = {
  easy: { maxDepth: 2, timeMs: 300, noise: 90 },
  normal: { maxDepth: 5, timeMs: 700, noise: 12 },
  hard: { maxDepth: 14, timeMs: 1600, noise: 0 },
};

export function chooseMove(state: GameState, level: Difficulty, rng: () => number = Math.random): AIResult {
  const cfg = LEVELS[level];
  const moves = legalMoves(state);
  if (moves.length === 1) return { move: moves[0], score: 0, depth: 0, nodes: 0 };
  const search = new Search();
  search.deadline = performance.now() + cfg.timeMs;
  let result: { move: Move; score: number; scores: { m: Move; v: number }[] } | null = null;
  let depth = 0;
  for (let d = 1; d <= cfg.maxDepth; d++) {
    const r = search.root(state, d);
    if (!r) break;
    result = r;
    depth = d;
    if (Math.abs(r.score) > WIN - 100) break; // forced win/loss found
  }
  if (!result) {
    const m = moves[Math.floor(rng() * moves.length)];
    return { move: m, score: 0, depth: 0, nodes: search.nodes };
  }
  let move = result.move;
  if (cfg.noise > 0 && Math.abs(result.score) < WIN - 100) {
    // Pick among near-best moves with noise so easier levels feel human, never missing a mate.
    let bestV = -Infinity;
    for (const { m, v } of result.scores) {
      const nv = v + (rng() - 0.5) * 2 * cfg.noise;
      if (nv > bestV) {
        bestV = nv;
        move = m;
      }
    }
  }
  return { move, score: result.score, depth, nodes: search.nodes };
}

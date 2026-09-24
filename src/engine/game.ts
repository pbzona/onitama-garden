import { CARDS, stampOwner } from './cards.ts';

// Board: 25 cells, index = y * 5 + x. x = column 0..4 (left→right from player 0's seat),
// y = row 0..4. Player 0 (Granite) starts on row 0 and moves toward +y.
// Player 1 (Basalt) starts on row 4 and moves toward −y (card deltas are rotated 180°).

export type Player = 0 | 1;
export const EMPTY = 0;
export const P0_STUDENT = 1;
export const P0_MASTER = 2;
export const P1_STUDENT = 3;
export const P1_MASTER = 4;

export const TEMPLE: readonly [number, number] = [2, 22]; // player 0 temple (x2,y0), player 1 temple (x2,y4)

export type WinReason = 'stone' | 'stream' | null;

export interface GameState {
  board: Int8Array;
  hands: [[number, number], [number, number]];
  side: number;
  turn: Player;
  winner: Player | -1;
  reason: WinReason;
  ply: number;
}

/** A move. from/to === -1 means a forced pass (card still exchanged). */
export interface Move {
  card: number;
  from: number;
  to: number;
}

export interface MoveResult {
  captured: number; // piece code captured, or EMPTY
  winner: Player | -1;
  reason: WinReason;
}

export const idx = (x: number, y: number) => y * 5 + x;
export const xOf = (i: number) => i % 5;
export const yOf = (i: number) => (i / 5) | 0;

export const owner = (p: number): Player | -1 => (p === EMPTY ? -1 : p <= 2 ? 0 : 1);
export const isMaster = (p: number) => p === P0_MASTER || p === P1_MASTER;

export function delta(card: number, player: Player, k: number): [number, number] {
  const [dx, dy] = CARDS[card].moves[k];
  return player === 0 ? [dx, dy] : [-dx, -dy];
}

export function newGame(rng: () => number = Math.random, deal?: number[]): GameState {
  const board = new Int8Array(25);
  for (let x = 0; x < 5; x++) {
    board[idx(x, 0)] = x === 2 ? P0_MASTER : P0_STUDENT;
    board[idx(x, 4)] = x === 2 ? P1_MASTER : P1_STUDENT;
  }
  let cards = deal;
  if (!cards) {
    const deck = CARDS.map((c) => c.id);
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    cards = deck.slice(0, 5);
  }
  const side = cards[4];
  return {
    board,
    hands: [
      [cards[0], cards[1]],
      [cards[2], cards[3]],
    ],
    side,
    turn: stampOwner(CARDS[side].stamp),
    winner: -1,
    reason: null,
    ply: 0,
  };
}

export function clone(s: GameState): GameState {
  return {
    board: s.board.slice(),
    hands: [
      [s.hands[0][0], s.hands[0][1]],
      [s.hands[1][0], s.hands[1][1]],
    ],
    side: s.side,
    turn: s.turn,
    winner: s.winner,
    reason: s.reason,
    ply: s.ply,
  };
}

/** Destinations for a single piece using a single card (no legality beyond board/own-piece). */
export function targetsFor(s: GameState, from: number, card: number): number[] {
  const p = s.board[from];
  const pl = owner(p);
  if (pl === -1) return [];
  const out: number[] = [];
  const x = xOf(from);
  const y = yOf(from);
  const n = CARDS[card].moves.length;
  for (let k = 0; k < n; k++) {
    const [dx, dy] = delta(card, pl, k);
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || nx > 4 || ny < 0 || ny > 4) continue;
    const t = idx(nx, ny);
    if (owner(s.board[t]) === pl) continue;
    out.push(t);
  }
  return out;
}

export function legalMoves(s: GameState): Move[] {
  if (s.winner !== -1) return [];
  const pl = s.turn;
  const moves: Move[] = [];
  const hand = s.hands[pl];
  for (let h = 0; h < 2; h++) {
    const card = hand[h];
    for (let i = 0; i < 25; i++) {
      if (owner(s.board[i]) !== pl) continue;
      for (const t of targetsFor(s, i, card)) moves.push({ card, from: i, to: t });
    }
  }
  if (moves.length === 0) {
    // Forced pass: still must exchange one of the two cards.
    moves.push({ card: hand[0], from: -1, to: -1 });
    if (hand[1] !== hand[0]) moves.push({ card: hand[1], from: -1, to: -1 });
  }
  return moves;
}

/** Mutates s. Returns info needed for undo/animation. */
export function applyMove(s: GameState, m: Move): MoveResult {
  const pl = s.turn;
  let captured = EMPTY;
  if (m.from >= 0) {
    const piece = s.board[m.from];
    captured = s.board[m.to];
    s.board[m.to] = piece;
    s.board[m.from] = EMPTY;
    if (captured === (pl === 0 ? P1_MASTER : P0_MASTER)) {
      s.winner = pl;
      s.reason = 'stone';
    } else if (isMaster(piece) && m.to === TEMPLE[pl === 0 ? 1 : 0]) {
      s.winner = pl;
      s.reason = 'stream';
    }
  }
  // Card exchange: used card goes to the side, player takes the old side card.
  const hand = s.hands[pl];
  const h = hand[0] === m.card ? 0 : 1;
  hand[h] = s.side;
  s.side = m.card;
  s.turn = (1 - pl) as Player;
  s.ply++;
  return { captured, winner: s.winner, reason: s.reason };
}

export function sameMove(a: Move, b: Move) {
  return a.card === b.card && a.from === b.from && a.to === b.to;
}

const FILES = 'abcde';
export function squareName(i: number) {
  return FILES[xOf(i)] + (yOf(i) + 1);
}
export function moveName(m: Move) {
  const c = CARDS[m.card].name;
  return m.from < 0 ? `${c} — pass` : `${c} ${squareName(m.from)}→${squareName(m.to)}`;
}

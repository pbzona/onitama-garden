// Run with: node --test tests/  (Node 22.6+ strips TypeScript types natively)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CARDS } from '../src/engine/cards.ts';
import {
  applyMove,
  EMPTY,
  idx,
  legalMoves,
  newGame,
  P0_MASTER,
  P0_STUDENT,
  P1_MASTER,
  P1_STUDENT,
  targetsFor,
} from '../src/engine/game.ts';
import { chooseMove } from '../src/engine/ai.ts';

const id = (n: string) => CARDS.findIndex((c) => c.name === n);
const empty = () => {
  const s = newGame(Math.random, [id('Tiger'), id('Crab'), id('Ox'), id('Horse'), id('Monkey')]);
  s.board.fill(EMPTY);
  return s;
};

test('16 cards, 8 per stamp colour', () => {
  assert.equal(CARDS.length, 16);
  assert.equal(CARDS.filter((c) => c.stamp === 'blue').length, 8);
});

test('first player comes from the side card stamp', () => {
  const blueSide = newGame(Math.random, [id('Crab'), id('Ox'), id('Horse'), id('Boar'), id('Tiger')]);
  assert.equal(blueSide.turn, 0);
  const redSide = newGame(Math.random, [id('Crab'), id('Ox'), id('Horse'), id('Boar'), id('Dragon')]);
  assert.equal(redSide.turn, 1);
});

test('card deltas are mirrored for player 1', () => {
  const s = empty();
  s.board[idx(2, 2)] = P0_STUDENT;
  // Tiger for player 0: forward 2 (y+2) and back 1 (y-1)
  assert.deepEqual(targetsFor(s, idx(2, 2), id('Tiger')).sort(), [idx(2, 4), idx(2, 1)].sort());
  s.board[idx(2, 2)] = P1_STUDENT;
  assert.deepEqual(targetsFor(s, idx(2, 2), id('Tiger')).sort(), [idx(2, 0), idx(2, 3)].sort());
  // Rabbit (right 2) is to the left in board terms for player 1
  assert.ok(targetsFor(s, idx(2, 2), id('Rabbit')).includes(idx(0, 2)));
  s.board[idx(2, 2)] = P0_STUDENT;
  assert.ok(targetsFor(s, idx(2, 2), id('Rabbit')).includes(idx(4, 2)));
});

test('card exchange: used card goes to side, side card joins hand', () => {
  const s = newGame(Math.random, [id('Tiger'), id('Crab'), id('Ox'), id('Horse'), id('Monkey')]);
  const m = legalMoves(s).find((m) => m.card === id('Crab'))!;
  applyMove(s, m);
  assert.equal(s.side, id('Crab'));
  assert.deepEqual([...s.hands[0]].sort(), [id('Tiger'), id('Monkey')].sort());
  assert.equal(s.turn, 1);
});

test('Way of the Stone: capturing the master wins', () => {
  const s = empty();
  s.board[idx(2, 1)] = P0_MASTER;
  s.board[idx(2, 3)] = P1_MASTER;
  s.board[idx(0, 0)] = P0_STUDENT;
  s.turn = 0;
  const r = applyMove(s, { card: id('Tiger'), from: idx(2, 1), to: idx(2, 3) });
  assert.equal(r.winner, 0);
  assert.equal(r.reason, 'stone');
});

test('Way of the Stream: master on enemy temple wins, student does not', () => {
  const s = empty();
  s.board[idx(2, 2)] = P0_MASTER;
  s.board[idx(0, 4)] = P1_MASTER;
  s.turn = 0;
  const r = applyMove(s, { card: id('Tiger'), from: idx(2, 2), to: idx(2, 4) });
  assert.equal(r.reason, 'stream');
  const s2 = empty();
  s2.board[idx(2, 2)] = P0_STUDENT;
  s2.board[idx(0, 0)] = P0_MASTER;
  s2.board[idx(0, 4)] = P1_MASTER;
  s2.turn = 0;
  assert.equal(applyMove(s2, { card: id('Tiger'), from: idx(2, 2), to: idx(2, 4) }).winner, -1);
});

test('forced pass when no legal move still exchanges a card', () => {
  const s = empty();
  // Player 0 master boxed into a corner by own pieces, cards only allow forward moves off-board.
  s.board[idx(0, 4)] = P0_MASTER;
  s.board[idx(4, 0)] = P1_MASTER;
  s.hands[0] = [id('Tiger'), id('Crab')];
  s.board[idx(0, 3)] = P0_STUDENT; // Tiger back-1 blocked by own piece
  s.board[idx(1, 3)] = P0_STUDENT;
  s.board[idx(2, 3)] = P0_STUDENT;
  s.board[idx(3, 3)] = P0_STUDENT;
  s.turn = 0;
  // Remaining students: Crab (forward 1 / sideways 2) - students on row 3 can move forward to row 4 -> not a pass.
  // Put them on row 4 instead so forward is off board and sideways 2 is blocked.
  s.board.fill(EMPTY);
  s.board[idx(0, 4)] = P0_MASTER;
  s.board[idx(2, 4)] = P0_STUDENT;
  s.board[idx(4, 4)] = P0_STUDENT;
  s.board[idx(0, 3)] = P0_STUDENT;
  s.board[idx(2, 3)] = P0_STUDENT;
  s.board[idx(4, 1)] = P1_MASTER;
  s.hands[0] = [id('Crab'), id('Crab')].map((c, i) => (i ? id('Tiger') : c)) as [number, number];
  const moves = legalMoves(s);
  // Tiger: forward 2 off board for row 3/4; back 1: (0,4)->(0,3) own, (2,4)->(2,3) own, (4,4)->(4,3) empty -> legal.
  // So this configuration is not a pass; build a stricter one:
  assert.ok(moves.length > 0);
  s.board.fill(EMPTY);
  s.board[idx(0, 4)] = P0_MASTER;
  s.board[idx(0, 3)] = P0_STUDENT;
  s.board[idx(4, 0)] = P1_MASTER;
  s.hands[0] = [id('Tiger'), id('Tiger')];
  // Master: fwd2 off-board, back1 own. Student (0,3): fwd2 off-board, back1 (0,2) empty -> legal. Block it:
  s.board[idx(0, 2)] = P0_STUDENT;
  s.board[idx(0, 1)] = P0_STUDENT;
  s.board[idx(0, 0)] = P0_STUDENT;
  // (0,2): fwd2 -> (0,4) own; back1 -> (0,1) own. (0,1): fwd2 -> (0,3) own; back1 (0,0) own. (0,0): fwd2 (0,2) own; back1 off.
  const pass = legalMoves(s);
  assert.ok(pass.every((m) => m.from === -1));
  applyMove(s, pass[0]);
  assert.equal(s.side, id('Tiger'));
  assert.equal(s.turn, 1);
});

test('AI takes an immediate master capture', () => {
  const s = empty();
  s.board[idx(2, 0)] = P0_MASTER;
  s.board[idx(1, 1)] = P0_STUDENT;
  s.board[idx(2, 2)] = P1_MASTER;
  s.board[idx(4, 4)] = P1_STUDENT;
  s.hands[0] = [id('Monkey'), id('Crab')];
  s.hands[1] = [id('Horse'), id('Ox')];
  s.side = id('Boar');
  s.turn = 0;
  for (const lvl of ['easy', 'normal', 'hard'] as const) {
    const r = chooseMove(s, lvl);
    assert.equal(r.move.to, idx(2, 2), lvl);
  }
});

test('AI self-play finishes games without errors', () => {
  for (let g = 0; g < 6; g++) {
    const s = newGame();
    let n = 0;
    while (s.winner === -1 && n < 200) {
      const r = chooseMove(s, g % 2 ? 'easy' : 'normal');
      const legal = legalMoves(s);
      assert.ok(legal.some((m) => m.card === r.move.card && m.from === r.move.from && m.to === r.move.to));
      applyMove(s, r.move);
      n++;
    }
  }
});

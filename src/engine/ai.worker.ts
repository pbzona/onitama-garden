import { chooseMove, type Difficulty } from './ai.ts';
import type { GameState } from './game.ts';

interface Req {
  id: number;
  state: Omit<GameState, 'board'> & { board: number[] };
  level: Difficulty;
}

self.onmessage = (e: MessageEvent<Req>) => {
  const { id, state, level } = e.data;
  const s: GameState = { ...state, board: Int8Array.from(state.board) };
  const r = chooseMove(s, level);
  (self as unknown as Worker).postMessage({ id, ...r });
};

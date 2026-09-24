import { chooseMove } from '../src/engine/ai.ts';
import { newGame, applyMove, legalMoves } from '../src/engine/game.ts';
// hard vs normal, hard vs easy match
const levels = [['hard','normal'],['hard','easy'],['normal','easy']] as const;
for (const [a, b] of levels) {
  let wa = 0, wb = 0, draws = 0;
  for (let g = 0; g < 6; g++) {
    const s = newGame();
    const side: Record<number, any> = g % 2 ? { 0: a, 1: b } : { 0: b, 1: a };
    let n = 0; let maxD = 0;
    while (s.winner === -1 && n < 120) { const r = chooseMove(s, side[s.turn]); if (side[s.turn]==='hard') maxD=Math.max(maxD,r.depth); applyMove(s, r.move); n++; }
    if (s.winner === -1) draws++; else if (side[s.winner] === a) wa++; else wb++;
    if (g===0) console.log(`  sample hard depth reached: ${maxD}`);
  }
  console.log(`${a} vs ${b}: ${wa}-${wb} (${draws} unfinished)`);
}

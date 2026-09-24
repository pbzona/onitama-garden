// The 16 Onitama move cards from the base game.
// Deltas are [dx, dy] from the owning player's point of view:
//   +dx = to that player's right, +dy = forward (toward the opponent).
// Stamp colour decides who moves first when the card is dealt as the side card.

export type Stamp = 'blue' | 'red';

export interface CardDef {
  id: number;
  name: string;
  kanji: string;
  stamp: Stamp;
  moves: ReadonlyArray<readonly [number, number]>;
  motto: string;
}

const raw: Omit<CardDef, 'id'>[] = [
  { name: 'Tiger', kanji: '虎', stamp: 'blue', moves: [[0, 2], [0, -1]], motto: 'Pounce with certainty and strength.' },
  { name: 'Dragon', kanji: '龍', stamp: 'red', moves: [[-2, 1], [2, 1], [-1, -1], [1, -1]], motto: 'Swift as the thunder before you cover your ears.' },
  { name: 'Frog', kanji: '蛙', stamp: 'red', moves: [[-2, 0], [-1, 1], [1, -1]], motto: 'Emulate the mountain stream; mimic its power.' },
  { name: 'Rabbit', kanji: '兎', stamp: 'blue', moves: [[2, 0], [1, 1], [-1, -1]], motto: 'The art of the Rabbit is the art of speed.' },
  { name: 'Crab', kanji: '蟹', stamp: 'blue', moves: [[0, 1], [-2, 0], [2, 0]], motto: 'The tide is sure and strong.' },
  { name: 'Elephant', kanji: '象', stamp: 'red', moves: [[-1, 1], [1, 1], [-1, 0], [1, 0]], motto: 'Only the strong may pursue your art.' },
  { name: 'Goose', kanji: '雁', stamp: 'blue', moves: [[-1, 1], [-1, 0], [1, 0], [1, -1]], motto: 'Spread your wings to hide your intentions.' },
  { name: 'Rooster', kanji: '鶏', stamp: 'red', moves: [[1, 1], [-1, 0], [1, 0], [-1, -1]], motto: 'Deliver quick, sharp strikes whenever he lags.' },
  { name: 'Monkey', kanji: '猿', stamp: 'blue', moves: [[-1, 1], [1, 1], [-1, -1], [1, -1]], motto: 'Without deception there is no strategy.' },
  { name: 'Mantis', kanji: '螳', stamp: 'red', moves: [[-1, 1], [1, 1], [0, -1]], motto: 'Distract the watchful, misguide the wary.' },
  { name: 'Horse', kanji: '馬', stamp: 'red', moves: [[0, 1], [-1, 0], [0, -1]], motto: 'Tireless; sure in its actions.' },
  { name: 'Ox', kanji: '牛', stamp: 'blue', moves: [[0, 1], [1, 0], [0, -1]], motto: 'Pour your strength into the steady advance.' },
  { name: 'Crane', kanji: '鶴', stamp: 'blue', moves: [[0, 1], [-1, -1], [1, -1]], motto: 'Make no unnecessary movement.' },
  { name: 'Boar', kanji: '猪', stamp: 'red', moves: [[0, 1], [-1, 0], [1, 0]], motto: 'Focus all your might into a single rush.' },
  { name: 'Eel', kanji: '鰻', stamp: 'blue', moves: [[-1, 1], [-1, -1], [1, 0]], motto: 'Counter fire with water; become fluid.' },
  { name: 'Cobra', kanji: '蛇', stamp: 'red', moves: [[1, 1], [1, -1], [-1, 0]], motto: 'Show leisure, then suddenly strike.' },
];

export const CARDS: ReadonlyArray<CardDef> = raw.map((c, id) => ({ ...c, id }));

/** Stamp colour → player who owns that colour. Player 0 (granite) is blue, player 1 (basalt) is red. */
export const stampOwner = (s: Stamp): 0 | 1 => (s === 'blue' ? 0 : 1);

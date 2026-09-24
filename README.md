# Onitama · The Stone Garden

A browser-playable 3D take on **Onitama**, the two-player martial-arts strategy game, played on a slate board in a Japanese dry garden (*karesansui*) at dusk.

Everything is procedural: no model, texture, or audio files. The stones are sculpted with lathe geometry and shaded with object-space noise. The raked gravel is computed analytically in a shader. The cards are painted onto canvases with brush-script kanji. The sound (stone clacks, paper swishes, wind, crickets, wind chimes) is synthesised with WebAudio.

## Play

- **vs the Garden Master (AI)**: Novice / Adept / Sensei. It runs a negamax search with alpha-beta pruning, a transposition table, and iterative deepening in a Web Worker. Sensei searches about 8–10 plies deep.
- **Two players**: hotseat mode. The camera swings around to whoever is to move.

Click a card, then a stone, then a glowing square (the card and stone can be picked in either order). Hover any card to see it enlarged, oriented from your seat. Drag to orbit and scroll to zoom. Keys: **Z** undo, **H** rules, **M** sound, **Esc** menu.

### Rules implemented

- 5×5 board. Each side has 1 Master (on its temple square) and 4 Students.
- Five of the 16 base-game cards are dealt: two to each player plus one side card. The side card's seal colour decides who opens (indigo 石 = Granite, vermilion 岩 = Basalt).
- Move one stone using one of your cards; the patterns are mirrored for the far player. Capture by landing on an enemy stone.
- The used card goes to the side; you take the old side card.
- If no legal move exists, you still have to exchange a card.
- You win by the **Way of the Stone** (capture the enemy Master) or the **Way of the Stream** (your Master reaches the enemy temple).

## Develop

```bash
git clone https://github.com/pbzona/onitama-garden.git
cd onitama-garden
npm install
npm run dev        # http://localhost:5173
npm test           # rules-engine + AI unit tests (node --test)
npm run build      # typecheck + production build → dist/
```

`dist/` is a static site, so it can be hosted anywhere (Vercel, Netlify, GitHub Pages, S3). `vite.config.ts` uses `base: './'`, so it also works from a sub-path.

`node scripts/inline.mjs` (after a build) writes `dist-single/index.html`, a single self-contained file, which is handy for sharing previews.

## Layout

```
src/
  engine/     cards.ts, game.ts (pure rules), ai.ts (search), ai.worker.ts
  render/     scene.ts (renderer, dusk sky, lights, bloom/grade), sand.ts (raked gravel shader),
              materials.ts (procedural stone), board.ts, pieces.ts, cards3d.ts, garden.ts
              (rocks, moss, lantern, maple, niwaki pines, wall), effects.ts (dust, leaves, fireflies), tween.ts
  game/       controller.ts: input, selection, animation choreography, AI turns, undo, victory
  ui/         hud.ts, style.css
  audio.ts    procedural WebAudio
tests/        engine.test.ts, aibench.ts (AI level vs level)
scripts/      inline.mjs, shot.mjs / e2e.mjs (headless screenshots and click-through tests; append ?fast to the URL)
```

## Graphics settings

**High** uses 2× DPR, a 4096 shadow map, and 4× MSAA. **Light** (the default on touch devices) uses 1.25× DPR, a 2048 shadow map, 2× MSAA, and fewer particles.

*Onitama* was designed by Shimpei Sato and is published by Arcane Wonders. This is an unofficial fan implementation with original art.

Code released under the [MIT License](LICENSE).

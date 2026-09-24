# Onitama · The Stone Garden

A browser-playable 3D take on **Onitama**, the two-player martial-arts strategy game, played on a slate board in a Japanese dry garden (*karesansui*) at dusk.

Everything is procedural: no model, texture, or audio files. The stones are sculpted with lathe geometry and shaded with object-space noise. The raked gravel is computed analytically in a shader. The cards are painted onto canvases with brush-script kanji. The sound (stone clacks, paper swishes, wind, crickets, wind chimes) is synthesised with WebAudio.

## Play

- **vs the Garden Master (AI)**: Novice / Adept / Sensei. It runs a negamax search with alpha-beta pruning, a transposition table, and iterative deepening in a Web Worker. Sensei searches about 8–10 plies deep.
- **Two players**: hotseat mode. The camera swings around to whoever is to move.

Click a card, then a stone, then a glowing square (the card and stone can be picked in either order). Hover any card to see it enlarged, oriented from your seat; the collapsible panel top-right always shows your opponent's cards.

**Camera:** drag to orbit (up to about 100° either side of your seat; after about 6 s it drifts back), scroll to zoom, double-click empty space to recenter. **V** toggles a top-down view and **C** recenters (there are buttons for both too). Other keys: **Z** undo, **H** rules, **M** sound, **Esc** menu.

### Rules implemented

- 5×5 board. Each side has 1 Master (on its temple square) and 4 Students.
- Five of the 16 base-game cards are dealt: two to each player plus one side card. The side card's seal colour decides who opens (indigo 石 = Granite, vermilion 岩 = Basalt).
- Move one stone using one of your cards; the patterns are mirrored for the far player. Capture by landing on an enemy stone.
- The used card goes to the side; you take the old side card.
- If no legal move exists, you still have to exchange a card.
- You win by the **Way of the Stone** (capture the enemy Master) or the **Way of the Stream** (your Master reaches the enemy temple).

## Capture effects

Every capture plays an effect themed on the card that made it. Underneath it, a shared "reward" layer adds an impact flash, a burst of lingering motes in the card's colours, a glow on the slate, rising afterglow, a bloom swell with a slight camera push-in, a tiny screen shake and a soft chime. The captured stone dissolves into the same colours as it sinks. Captures are marked in the move list.

| Card | Effect | Card | Effect |
|---|---|---|---|
| Tiger 虎 | three raking claw slashes | Monkey 猿 | spinning staff, smoke puff, orbiting stars |
| Dragon 龍 | swirling firestorm, embers and smoke | Mantis 螳 | twin jade scythes slash an X |
| Frog 蛙 | ripples and a splash of droplets | Horse 馬 | glowing hoofprints gallop in, hoof-strike wave |
| Rabbit 兎 | a pale moon flares, speed lines rush past | Ox 牛 | spectral horns heave up, the slate cracks |
| Crab 蟹 | translucent pincers close in and snap | Crane 鶴 | serene halo, spiralling feathers, red crown |
| Elephant 象 | ground-shaking stomp and shockwave | Boar 猪 | tusks thrust, a wedge of dust and rock |
| Goose 雁 | sweeping wings of light, drifting feathers | Eel 鰻 | crackling blue lightning |
| Rooster 鶏 | a dawn sunburst of golden rays | Cobra 蛇 | a serpent coils up and strikes, venom mist |

All effects live in `src/render/vfx.ts`: a small instanced-particle system, additive "ink-spirit" meshes, shockwave rings, light flashes and camera shake. The matching sounds are synthesised in `src/audio.ts` (`Sound.fx`). `node scripts/fxsheet.mjs all` renders a screenshot of each effect.

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
              (rocks, moss, lantern, maple, niwaki pines, four-sided walled enclosure, tree line), effects.ts (dust, leaves, fireflies), tween.ts
  render/vfx.ts  card-themed capture effects
  game/       controller.ts: input, selection, animation choreography, AI turns, undo, victory
  ui/         hud.ts, style.css
  audio.ts    procedural WebAudio
tests/        engine.test.ts, aibench.ts (AI level vs level)
scripts/      inline.mjs, shot.mjs / e2e.mjs (headless screenshots and click-through tests; append ?fast to the URL)
```

## Icons & social previews

- `public/favicon.svg` is the icon: a gold torii (the temple arch) over a vermilion sun on a slate tile. `public/site.webmanifest` makes the game installable.
- The PNG icons and the 1200×630 Open Graph / Twitter image (`og.jpg`) are stored as base64 text in `public-b64/` so the repo stays text-only. `vite.config.ts` decodes them into `dist/` at build time and serves them in dev.
- Link-preview crawlers need an absolute `og:image` URL. Build with `SITE_URL=https://your.domain npm run build`, or deploy on Vercel, where the production domain is picked up automatically.
- To regenerate: `node scripts/ogshot.mjs` renders hero shots of the garden into `brand/`, then `node scripts/brand.mjs brand/<shot>.png` rebuilds every icon and the OG image.

## Graphics settings

**High** renders at up to 1.5× device pixel ratio with a 2048 shadow map and 4× MSAA. **Light** (the default on touch devices) renders at 1× with a 1024 shadow map, 2× MSAA and fewer particles.

### Performance

- **Frame pacing:** the game renders at up to 60 fps while something is moving or you're interacting, 30 fps when idle (just leaves and fireflies drifting), and 15 fps when the window isn't focused. It never runs uncapped on high-refresh monitors, and browsers pause it completely in background tabs.
- **Adaptive resolution:** if it can't hold 60 fps during play, the render scale steps down (to as low as 50%) and creeps back up when there's headroom.
- **Baked once at startup:** the raked-sand pattern (a texture instead of per-pixel maths over every rock) and the dusk sky (a cube map).
- **Shadows on demand:** the shadow map only re-renders while stones or cards are moving.
- **Cheaper scenery shading:** walls, rocks, moss and trees use 2-octave noise and standard materials; only the stones and board use the heavier physical shading.
- `node scripts/bench.mjs` (with `Q=high|low`) prints a per-frame cost breakdown using the CPU renderer as a proxy for GPU work.

*Onitama* was designed by Shimpei Sato and is published by Arcane Wonders. This is an unofficial fan implementation with original art.

Code released under the [MIT License](LICENSE).

import { store } from './store.ts';
import './ui/style.css';
import * as THREE from 'three';
import { Stage, type Quality } from './render/scene.ts';
import { buildGarden } from './render/garden.ts';
import { createSand } from './render/sand.ts';
import { BoardView, SLAB } from './render/board.ts';
import { PiecesView } from './render/pieces.ts';
import { CardsView } from './render/cards3d.ts';
import { Dust, Fireflies, FallingLeaves } from './render/effects.ts';
import { busy as tweensBusy, tickTweens } from './render/tween.ts';
import { Vfx } from './render/vfx.ts';
import { Controller, type Mode } from './game/controller.ts';
import { Hud, initSeg, overlay, segValue } from './ui/hud.ts';
import { Sound } from './audio.ts';
import type { Difficulty } from './engine/ai.ts';
import { legalMoves } from './engine/game.ts';
import { squarePos } from './render/board.ts';

// ?fast = large fixed time steps (for automated testing on software renderers)
const params = new URLSearchParams(location.search);
let FIXED_DT = params.has('dt') ? +params.get('dt')! : params.has('fast') ? 0.3 : 0;
// The full-resolution HDR/bloom pipeline is intentionally high quality, but it
// needn't run at interaction speed while the board is idle. Keep 60 fps for
// input and authored animation, then settle to 30 fps for ambient motion. A
// ?fps=N override remains available for profiling and forces a fixed cadence.
const FPS_OVERRIDE = Number(params.get('fps')) || 0;
const ACTIVE_FPS = Math.min(120, Math.max(15, FPS_OVERRIDE || 60));
const IDLE_FPS = Math.min(ACTIVE_FPS, FPS_OVERRIDE || 30);

async function boot() {
  // Card faces are painted onto canvases, so the brush/serif fonts must be ready first.
  await Promise.race([
    Promise.all([
      document.fonts.load('260px "Yuji Syuku"', '虎龍蛙兎蟹象雁鶏猿螳馬牛鶴猪鰻蛇石岩'),
      document.fonts.load('600 50px "Shippori Mincho B1"', 'TIGER'),
    ]),
    new Promise((r) => setTimeout(r, 4000)),
  ]);

  const coarse = matchMedia('(pointer: coarse)').matches;
  const quality = (store.get('onitama.quality') as Quality) || (coarse ? 'low' : 'high');
  
  const app = document.getElementById('app')!;
  const stage = new Stage(app, quality);
  const garden = buildGarden();
  const board = new BoardView();
  const pieces = new PiecesView();
  const cards = new CardsView();
  const sand = createSand(SLAB / 2, [...garden.features, ...cards.plinthFeatures]);
  const dust = new Dust();
  const leaves = new FallingLeaves(garden.canopyCenters.filter((_, i) => i % 3 === 0), quality === 'high' ? 90 : 45);
  const flies = new Fireflies(quality === 'high' ? 40 : 20);
  stage.scene.add(sand.mesh, garden.group, board.group, pieces.group, cards.group, dust.group, leaves.mesh, flies.points);

  const hud = new Hud();
  const sound = new Sound();
  hud.setMuted(sound.muted);
  hud.initOpponentToggle(store.get('onitama.oppCollapsed') === '1', (c) => store.set('onitama.oppCollapsed', c ? '1' : '0'));
  const vfx = new Vfx(stage.camera, sound);
  vfx.scale = quality === 'high' ? 1 : 0.6;
  stage.scene.add(vfx.group);
  const ctl = new Controller(stage, board, pieces, cards, dust, leaves, garden, sound, hud, vfx);

  // ---- menu wiring
  const savedMode = store.get('onitama.mode') ?? 'ai';
  const savedLevel = store.get('onitama.level') ?? 'normal';
  initSeg('seg-mode', savedMode, (v) => document.getElementById('field-level')!.classList.toggle('hidden', v !== 'ai'));
  document.getElementById('field-level')!.classList.toggle('hidden', savedMode !== 'ai');
  initSeg('seg-level', savedLevel);
  initSeg('seg-quality', quality);

  const openMenu = () => {
    document.getElementById('btn-resume')!.classList.toggle('hidden', !(ctl.playing && ctl.state.winner === -1));
    overlay('menu', true);
  };
  document.getElementById('btn-start')!.addEventListener('click', () => {
    sound.unlock();
    const q = segValue('seg-quality') as Quality;
    const mode = segValue('seg-mode') as Mode;
    const level = segValue('seg-level') as Difficulty;
    store.set('onitama.mode', mode);
    store.set('onitama.level', level);
    if (q !== stage.quality) {
      store.set('onitama.quality', q);
      stage.setQuality(q, app);
    }
    overlay('menu', false);
    overlay('result', false);
    ctl.start(mode, level);
  });
  document.getElementById('btn-resume')!.addEventListener('click', () => overlay('menu', false));
  document.getElementById('btn-howto')!.addEventListener('click', () => overlay('rules', true));
  document.getElementById('btn-rules')!.addEventListener('click', () => overlay('rules', true));
  document.getElementById('btn-menu')!.addEventListener('click', openMenu);
  document.getElementById('btn-undo')!.addEventListener('click', () => ctl.undo());
  document.getElementById('btn-sound')!.addEventListener('click', () => {
    sound.unlock();
    sound.setMuted(!sound.muted);
    hud.setMuted(sound.muted);
  });
  document.getElementById('btn-rematch')!.addEventListener('click', () => {
    overlay('result', false);
    ctl.start(ctl.mode, ctl.level);
  });
  document.getElementById('btn-result-menu')!.addEventListener('click', () => {
    overlay('result', false);
    openMenu();
  });
  document.querySelectorAll('[data-close]').forEach((b) =>
    b.addEventListener('click', () => overlay((b as HTMLElement).dataset.close!, false)),
  );
  document.getElementById('rules')!.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) overlay('rules', false);
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!document.getElementById('rules')!.classList.contains('hidden')) overlay('rules', false);
      else if (!document.getElementById('menu')!.classList.contains('hidden')) {
        if (ctl.playing) overlay('menu', false);
      } else openMenu();
    } else if (e.key === 'z' || e.key === 'Z') ctl.undo();
    else if (e.key === 'h' || e.key === 'H') overlay('rules', document.getElementById('rules')!.classList.contains('hidden'));
    else if (e.key === 'm' || e.key === 'M') {
      sound.unlock();
      sound.setMuted(!sound.muted);
      hud.setMuted(sound.muted);
    }
  });

  // ---- attract mode behind the menu
  stage.controls.autoRotate = true;
  stage.controls.autoRotateSpeed = 0.25;

  // ---- loop
  const timer = new THREE.Timer();
  timer.connect(document);
  let t = 0;
  let lastFrameAt = -Infinity;
  let nextAmbientShadowAt = 0;
  let activeUntil = 0;
  const keepActive = (ms = 900) => (activeUntil = performance.now() + ms);
  // Hover/lift feedback and orbit controls should react at 60 fps. Once input
  // stops, the garden returns to the lower-cost ambient cadence automatically.
  for (const event of ['pointerdown', 'pointermove', 'wheel', 'keydown'] as const)
    window.addEventListener(event, () => keepActive(), { passive: true });
  stage.controls.addEventListener('start', () => keepActive(1500));
  // compile shaders before revealing
  stage.renderer.compile(stage.scene, stage.camera);
  const loop = (now: number) => {
    requestAnimationFrame(loop);
    // requestAnimationFrame can follow 120/144 Hz displays. Skip redundant
    // callbacks before doing any simulation, uploads, or post-processing work.
    // A hidden tab has no visible output, so avoid waking the GPU altogether.
    const animationActive = tweensBusy();
    const frameMs = 1000 / (animationActive || now < activeUntil ? ACTIVE_FPS : IDLE_FPS);
    if (document.hidden || now - lastFrameAt < frameMs - 0.5) return;
    lastFrameAt = now;
    timer.update();
    const dt = FIXED_DT || Math.min(timer.getDelta(), 0.05);
    t += dt;
    // Read this before ticking so the final animated transform is guaranteed to
    // make it into the cached shadow map.
    const shadowsMoving = animationActive;
    tickTweens(dt);
    stage.controls.update();
    board.update(dt, t);
    pieces.update(dt, t);
    cards.update(dt, t);
    dust.update(dt);
    leaves.update(dt, t);
    flies.update(t);
    flies.setPixelScale(stage.renderer.getPixelRatio() * (app.clientHeight / 900));
    ctl.update(dt, t);
    vfx.update(dt, t);
    vfx.preRender();
    // The scene's only perpetual moving shadow casters are tiny falling leaves.
    // Refresh them at 12 Hz; piece/card/camera-effect tweens still refresh every
    // rendered frame. Shadow resolution and visual filtering remain unchanged.
    const refreshAmbientShadows = t >= nextAmbientShadowAt;
    if (refreshAmbientShadows) nextAmbientShadowAt = t + 1 / 12;
    stage.render(t, shadowsMoving || refreshAmbientShadows);
    vfx.postRender();
  };
  // expose for debugging / automated checks
  (window as any).__onitama = { ctl, stage, cards, legalMoves, squarePos, vfx, setDt: (d: number) => (FIXED_DT = d) };
  requestAnimationFrame(loop);

  requestAnimationFrame(() => {
    document.getElementById('loading')!.classList.add('fade');
    openMenu();
  });
}

boot();

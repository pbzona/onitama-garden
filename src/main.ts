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
import { busy, tickTweens } from './render/tween.ts';
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
  const sand = createSand(stage.renderer, SLAB / 2, [...garden.features, ...cards.plinthFeatures], quality === 'high' ? 2048 : 1024);
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
    if (store.get('onitama.viewHintSeen') !== '1') {
      store.set('onitama.viewHintSeen', '1');
      const touch = matchMedia('(pointer: coarse)').matches;
      setTimeout(
        () => toast(touch ? 'Drag to look around · pinch to zoom · ▦ top view · ⌖ recenter' : 'Drag to look around · <kbd>V</kbd> top view · <kbd>C</kbd> recenter'),
        3800,
      );
    }
  });
  document.getElementById('btn-resume')!.addEventListener('click', () => overlay('menu', false));
  document.getElementById('btn-howto')!.addEventListener('click', () => overlay('rules', true));
  document.getElementById('btn-rules')!.addEventListener('click', () => overlay('rules', true));
  document.getElementById('btn-menu')!.addEventListener('click', openMenu);
  document.getElementById('btn-undo')!.addEventListener('click', () => ctl.undo());
  const viewBtn = document.getElementById('btn-view')!;
  const toggleView = () => viewBtn.classList.toggle('on', ctl.toggleTopView());
  viewBtn.addEventListener('click', toggleView);
  document.getElementById('btn-recenter')!.addEventListener('click', () => ctl.recenter());
  const toast = (html: string, ms = 5200) => {
    const el = document.getElementById('toast')!;
    el.innerHTML = html;
    el.classList.add('on');
    setTimeout(() => el.classList.remove('on'), ms);
  };
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
    else if ((e.key === 'v' || e.key === 'V') && ctl.playing) toggleView();
    else if ((e.key === 'c' || e.key === 'C') && ctl.playing) ctl.recenter();
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
  // compile shaders before revealing
  vfx.prewarm(stage.renderer, stage.scene, stage.camera);
  // ---- frame pacing: render only as often as needed.
  // 60 fps while something moves or the player is interacting, 30 fps when idle (ambient leaves and
  // fireflies), 15 fps when the window isn't focused; the browser pauses rAF entirely in hidden tabs.
  let lastActiveAt = performance.now();
  const markActive = () => (lastActiveAt = performance.now());
  for (const ev of ['pointermove', 'pointerdown', 'wheel', 'touchmove'] as const) app.addEventListener(ev, markActive, { passive: true });
  window.addEventListener('keydown', markActive);
  stage.controls.addEventListener('change', markActive);
  let lastRender = 0;
  // Adaptive resolution: if we can't hold 60 fps while active, render fewer pixels.
  let emaInterval = 16.7, slowFrames = 0, fastFrames = 0;
  const loop = (now: number) => {
    requestAnimationFrame(loop);
    if ((window as any).__benchPause) return;
    const moving = busy() || vfx.isActive() || ctl.isAnimating();
    const active = moving || now - lastActiveAt < 1500;
    const target = !document.hasFocus() ? 15 : active ? 60 : 30;
    if (!FIXED_DT && now - lastRender < 1000 / target - 2) return;
    const interval = now - lastRender;
    lastRender = now;
    timer.update();
    const dt = FIXED_DT || Math.min(timer.getDelta(), 0.1);
    t += dt;
    tickTweens(dt);
    stage.controls.update(dt);
    board.update(dt, t);
    pieces.update(dt, t);
    cards.update(dt, t);
    dust.update(dt);
    leaves.update(dt, t);
    flies.update(t);
    flies.setPixelScale(stage.renderer.getPixelRatio() * (app.clientHeight / 900));
    ctl.update(dt, t);
    vfx.update(dt, t);
    // shadows are static unless stones/cards are moving (or a card is lifting under the cursor)
    if (moving || now - lastActiveAt < 500) stage.invalidateShadows();
    vfx.preRender();
    stage.render(t);
    vfx.postRender();
    if (!FIXED_DT && target === 60 && interval < 250) {
      emaInterval += (interval - emaInterval) * 0.1;
      if (emaInterval > 21) {
        fastFrames = 0;
        if (++slowFrames > 45) {
          stage.setRenderScale(stage.renderScale - 0.1);
          slowFrames = 0;
          emaInterval = 16.7;
        }
      } else if (emaInterval < 17.6 && stage.renderScale < 1) {
        slowFrames = 0;
        if (++fastFrames > 300) {
          stage.setRenderScale(stage.renderScale + 0.05);
          fastFrames = 0;
        }
      }
    }
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

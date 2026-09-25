import * as THREE from 'three';
import AIWorker from '../engine/ai.worker.ts?worker&inline';
import { chooseMove, type Difficulty } from '../engine/ai.ts';
import { CARDS } from '../engine/cards.ts';
import {
  applyMove,
  clone,
  isMaster,
  legalMoves,
  moveName,
  newGame,
  owner,
  TEMPLE,
  type GameState,
  type Move,
  type Player,
} from '../engine/game.ts';
import type { Sound } from '../audio.ts';
import { BoardView, squarePos, TOP } from '../render/board.ts';
import { cardTexture, slotTransform, type CardObj, type CardsView } from '../render/cards3d.ts';
import type { Dust, FallingLeaves } from '../render/effects.ts';
import type { GardenRefs } from '../render/garden.ts';
import type { PieceObj, PiecesView } from '../render/pieces.ts';
import type { Stage } from '../render/scene.ts';
import { ease, setTweenSpeed, tween, wait } from '../render/tween.ts';
import type { Vfx } from '../render/vfx.ts';
import { Hud, NAMES, overlay } from '../ui/hud.ts';

export type Mode = 'ai' | 'hotseat';

type Hit = { kind: 'card'; id: number } | { kind: 'square'; sq: number } | null;

interface HistoryEntry {
  state: GameState;
  move: Move;
}

const CAM_RADIUS = 14.7; // pulled back a little from the original 13.1
const CAM_PHI = 0.82; // and a touch higher, so tall stones hide less of the board
const TOP_RADIUS = 15.5;
const TOP_PHI = 0.05;
const AZ_LIMIT = 1.75; // how far (rad) you can orbit away from your seat mid-game
const NUDGE_AFTER = 6; // seconds of no camera input before drifting back to your side

export class Controller {
  state: GameState = newGame();
  mode: Mode = 'ai';
  level: Difficulty = 'normal';
  history: HistoryEntry[] = [];
  playing = false;

  private busy = false;
  private selCard: number | null = null;
  private selSq = -1;
  private hoverSq = -1;
  private hoverCard: number | null = null;
  private pendingSq = -1; // destination awaiting card choice (both cards reach)
  private raycaster = new THREE.Raycaster();
  private ndc = new THREE.Vector2();
  private down = { x: 0, y: 0, t: 0, active: false };
  private worker: Worker | null = null;
  private aiReq = 0;
  private gen = 0; // bumps on new game / undo to cancel in-flight animations' follow-ups

  constructor(
    private stage: Stage,
    private board: BoardView,
    private pieces: PiecesView,
    private cards: CardsView,
    private dust: Dust,
    private leaves: FallingLeaves,
    private garden: GardenRefs,
    private sound: Sound,
    private hud: Hud,
    private vfx: Vfx,
  ) {
    const el = stage.renderer.domElement;
    el.addEventListener('pointermove', (e) => this.onMove(e));
    el.addEventListener('pointerdown', (e) => {
      this.down = { x: e.clientX, y: e.clientY, t: e.timeStamp, active: true };
      this.sound.unlock();
    });
    el.addEventListener('pointerup', (e) => {
      if (!this.down.active) return;
      this.down.active = false;
      const moved = Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y);
      if (moved < 10 && e.timeStamp - this.down.t < 900) this.onClick(e);
    });
    el.addEventListener('pointerleave', () => this.setHover(null));
    el.addEventListener('dblclick', (e) => {
      if (!this.pick(e as PointerEvent)) this.recenter();
    });
    stage.controls.addEventListener('start', () => this.noteCameraInput());
    stage.controls.addEventListener('change', () => {
      if (!this.camAnimating) this.noteCameraInput();
    });
    try {
      this.worker = new AIWorker();
      this.worker.onmessage = (e) => this.onAI(e.data);
      this.worker.onerror = () => (this.worker = null);
    } catch {
      this.worker = null; // sandboxed hosts may block workers: fall back to the main thread
    }
    // Idle scene behind the menu
    this.pieces.sync(this.state);
    this.cards.layout(this.state.hands, this.state.side, this.state.turn);
  }

  // ------------------------------------------------------------ lifecycle

  isHuman(pl: Player) {
    return this.mode === 'hotseat' || pl === 0;
  }

  async start(mode: Mode, level: Difficulty) {
    this.gen++;
    this.mode = mode;
    this.level = level;
    this.state = newGame();
    this.history = [];
    this.playing = true;
    this.busy = true;
    this.clearSelection();
    this.hud.clearLog();
    this.hud.show(true);
    this.board.setLastMove(-1, -1);
    this.stage.controls.autoRotate = false;
    const g = this.gen;
    this.hud.setTurn(this.state.turn, 'Setting the stones…');
    this.hud.hint('');
    await this.turnCamera(this.isHuman(this.state.turn) || mode === 'ai' ? (mode === 'ai' ? 0 : this.state.turn) : 0, 1.4);
    this.refreshOpponentPanel();
    await this.dealIn();
    if (g !== this.gen) return;
    const first = this.state.turn;
    this.hud.hint(`${CARDS[this.state.side].name}'s seal is ${first === 0 ? 'indigo' : 'vermilion'} — ${NAMES[first]} opens`, true);
    await wait(1.3);
    if (g !== this.gen) return;
    this.busy = false;
    this.beginTurn();
  }

  private async dealIn() {
    const s = this.state;
    this.pieces.sync(s);
    this.cards.layout(s.hands, s.side, s.turn);
    const jobs: Promise<void>[] = [];
    // stones drop onto the board one by one
    const order = [...this.pieces.pieces].sort((a, b) => (a.player - b.player) * 10 + (a.square % 5) - (b.square % 5));
    order.forEach((p, i) => {
      const y1 = p.mesh.position.y;
      p.mesh.position.y = y1 + 3;
      p.mesh.visible = false;
      jobs.push(
        wait(0.08 * i).then(() => {
          p.mesh.visible = true;
          return tween(0.45, (k) => (p.mesh.position.y = y1 + 3 * (1 - k)), { ease: ease.inCubic }).then(() => {
            this.sound.clack(0.6);
            this.dust.burst(p.mesh.position, 6, 0x8f8b84, 0.5);
            return tween(0.16, (k) => p.mesh.scale.set(1 + 0.06 * Math.sin(k * Math.PI), 1 - 0.08 * Math.sin(k * Math.PI), 1 + 0.06 * Math.sin(k * Math.PI)));
          });
        }),
      );
    });
    // cards glide in from off-table
    [...this.cards.cards.values()].forEach((c, i) => {
      const to = c.group.position.clone();
      const from = to.clone().add(new THREE.Vector3(0, 2.5, to.z > 0 ? 3 : -3));
      c.group.position.copy(from);
      jobs.push(
        wait(0.35 + i * 0.12).then(() => {
          this.sound.swish();
          return tween(0.7, (k) => {
            c.group.position.lerpVectors(from, to, k);
            c.group.position.y = to.y + (1 - k) * 2.5;
          }, { ease: ease.outCubic });
        }),
      );
    });
    await Promise.all(jobs);
  }

  // ------------------------------------------------------------ turn flow

  private beginTurn() {
    const s = this.state;
    this.refreshUsable();
    this.refreshOpponentPanel();
    this.hud.undoBtn.disabled = this.history.length === 0;
    if (s.winner !== -1) return;
    const pl = s.turn;
    if (!this.isHuman(pl)) {
      this.hud.setTurn(pl, 'The Garden Master considers', true);
      this.hud.hint('');
      this.requestAI();
      return;
    }
    this.hud.setTurn(pl, this.mode === 'ai' ? 'Your move' : 'Your move');
    const moves = legalMoves(s);
    if (moves[0].from === -1) {
      this.hud.hint('No legal move — choose a card to give up', true);
    } else this.updateHint();
  }

  private updateHint() {
    if (!this.playing || this.busy || !this.isHuman(this.state.turn)) return;
    if (this.pendingSq >= 0) this.hud.hint('Both cards reach that square — choose a card', true);
    else if (this.selSq >= 0) this.hud.hint('Choose a glowing square');
    else if (this.selCard !== null) this.hud.hint(`${CARDS[this.selCard].name} — now choose a stone`);
    else this.hud.hint('Choose a card, then a stone');
  }

  private refreshUsable() {
    const s = this.state;
    const human = this.playing && !this.busy && s.winner === -1 && this.isHuman(s.turn);
    for (const c of this.cards.cards.values()) {
      c.usable = human && s.hands[s.turn].includes(c.id);
      c.selected = c.id === this.selCard;
    }
  }

  private clearSelection() {
    this.selCard = null;
    this.selSq = -1;
    this.pendingSq = -1;
    this.pieces.select(null);
    this.pieces.showGhost(null, -1);
    this.board.setMarkers(new Map());
    this.pieces.setFaded(new Set());
    this.refreshUsable();
  }

  /** Legal moves from the currently selected stone, optionally filtered by card. */
  private movesFrom(sq: number, card: number | null) {
    return legalMoves(this.state).filter((m) => m.from === sq && (card === null || m.card === card));
  }

  private refreshMarkers() {
    const map = new Map<number, number>();
    const s = this.state;
    const src = this.selSq >= 0 ? this.selSq : this.hoverOwnSq();
    if (src >= 0) {
      const piece = s.board[src];
      for (const m of this.movesFrom(src, this.selCard)) {
        const cap = s.board[m.to] !== 0;
        const temple = isMaster(piece) && m.to === TEMPLE[s.turn === 0 ? 1 : 0];
        let k = cap ? 2 : 1;
        if (temple) k = 5;
        if (m.to === this.hoverSq && this.selSq >= 0) k = cap ? 4 : 3;
        map.set(m.to, Math.max(map.get(m.to) ?? 0, k));
      }
    }
    this.board.setMarkers(map);
    this.pieces.setFaded(this.selSq >= 0 ? this.occluders(map.keys()) : new Set());
    // ghost preview on hovered destination
    const sel = this.selSq >= 0 ? this.pieces.at(this.selSq) ?? null : null;
    this.pieces.showGhost(sel, sel && map.has(this.hoverSq) ? this.hoverSq : -1);
  }

  private hoverOwnSq() {
    const s = this.state;
    if (!this.playing || this.busy || !this.isHuman(s.turn)) return -1;
    return this.hoverSq >= 0 && owner(s.board[this.hoverSq]) === s.turn ? this.hoverSq : -1;
  }

  // ------------------------------------------------------------ input

  private pick(e: PointerEvent): Hit {
    const rect = this.stage.renderer.domElement.getBoundingClientRect();
    this.ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.stage.camera);
    // A highlighted destination wins even if a tall stone stands in front of it on screen.
    if (this.selSq >= 0) {
      const plane = this.raycaster.intersectObjects(this.board.pickPlanes, false)[0];
      if (plane) {
        const sq = plane.object.userData.square as number;
        if (this.movesFrom(this.selSq, this.selCard).some((m) => m.to === sq)) {
          const cardHit = this.raycaster.intersectObjects(this.cards.faces(), false)[0];
          if (!cardHit || cardHit.distance > plane.distance) return { kind: 'square', sq };
        }
      }
    }
    const objs: THREE.Object3D[] = [...this.cards.faces(), ...this.pieces.pickables(), ...this.board.pickPlanes];
    const hit = this.raycaster.intersectObjects(objs, false)[0];
    if (!hit) return null;
    const o = hit.object;
    if (o.userData.cardId !== undefined) return { kind: 'card', id: o.userData.cardId };
    if (o.userData.pieceRef) {
      const p = this.pieces.pieces.find((q) => q.mesh === o.userData.pieceRef);
      return p ? { kind: 'square', sq: p.square } : null;
    }
    if (o.userData.square !== undefined) return { kind: 'square', sq: o.userData.square };
    return null;
  }

  /** Stones that sit between the camera and any of the given squares. */
  private occluders(squares: Iterable<number>) {
    const out = new Set<PieceObj>();
    const cam = this.stage.camera.position;
    const rc = new THREE.Raycaster();
    const bodies = this.pieces.pickables();
    for (const sq of squares) {
      const target = squarePos(sq).add(new THREE.Vector3(0, 0.05, 0));
      const dir = target.clone().sub(cam);
      const dist = dir.length();
      rc.set(cam, dir.normalize());
      rc.far = dist - 0.3;
      for (const h of rc.intersectObjects(bodies, false)) {
        const p = this.pieces.pieces.find((q) => q.mesh === h.object.userData.pieceRef);
        if (p && p.square !== sq) out.add(p);
      }
    }
    return out;
  }

  private setHover(h: Hit) {
    const sq = h?.kind === 'square' ? h.sq : -1;
    const card = h?.kind === 'card' ? h.id : null;
    if (sq === this.hoverSq && card === this.hoverCard) return;
    this.hoverSq = sq;
    this.hoverCard = card;
    for (const c of this.cards.cards.values()) c.hovered = c.id === card;
    this.inspect(card);
    this.refreshMarkers();
    const s = this.state;
    const actionable =
      this.playing && !this.busy && this.isHuman(s.turn) &&
      ((card !== null && s.hands[s.turn].includes(card)) || (sq >= 0 && (owner(s.board[sq]) === s.turn || (this.selSq >= 0 && this.movesFrom(this.selSq, this.selCard).some((m) => m.to === sq)))));
    this.stage.renderer.domElement.style.cursor = actionable ? 'pointer' : '';
  }

  private inspectUrls = new Map<number, string>();
  private cardUrl(card: number) {
    let url = this.inspectUrls.get(card);
    if (!url) {
      url = (cardTexture(card).image as HTMLCanvasElement).toDataURL('image/jpeg', 0.85);
      this.inspectUrls.set(card, url);
    }
    return url;
  }

  /** Refresh the always-visible panel of the opponent's cards. */
  private refreshOpponentPanel() {
    const s = this.state;
    const viewer: Player = this.mode === 'ai' ? 0 : s.turn;
    const opp = (1 - viewer) as Player;
    const hand = s.hands[opp];
    this.hud.setOpponent(
      opp,
      [hand[0], hand[1]],
      [CARDS[hand[0]].name, CARDS[hand[1]].name],
      [this.cardUrl(hand[0]), this.cardUrl(hand[1])],
      { url: this.cardUrl(s.side), name: CARDS[s.side].name, toViewer: s.turn === viewer },
    );
  }
  /** Enlarged view of a hovered card, oriented as it applies from the viewer's seat. */
  private inspect(card: number | null) {
    const box = document.getElementById('inspect')!;
    if (card === null || !this.playing) {
      box.classList.remove('on');
      return;
    }
    const url = this.cardUrl(card);
    const s = this.state;
    const viewer: Player = this.mode === 'ai' ? 0 : s.turn;
    const holder: Player | -1 = s.hands[0].includes(card) ? 0 : s.hands[1].includes(card) ? 1 : -1;
    // The side card faces the player about to receive it (the one to move).
    const facing: Player = holder === -1 ? s.turn : holder;
    (box.querySelector('img') as HTMLImageElement).src = url;
    box.classList.toggle('flip', facing !== viewer);
    const name = CARDS[card].name;
    const who = holder === -1 ? `side card — ${NAMES[s.turn]} takes it next` : holder === viewer ? 'your card' : `${NAMES[holder]}'s card, shown from your seat`;
    (box.querySelector('.cap') as HTMLElement).innerHTML = `<b>${name}</b> · ${who}`;
    box.classList.add('on');
  }

  private onMove(e: PointerEvent) {
    if (e.pointerType === 'touch') return;
    this.setHover(this.pick(e));
  }

  private onClick(e: PointerEvent) {
    if (!this.playing || this.busy) return;
    const s = this.state;
    if (s.winner !== -1 || !this.isHuman(s.turn)) return;
    const h = this.pick(e);
    if (e.pointerType === 'touch') this.setHover(h);
    if (!h) {
      this.clearSelection();
      this.updateHint();
      return;
    }
    const legal = legalMoves(s);
    const passing = legal[0].from === -1;

    if (h.kind === 'card') {
      if (!s.hands[s.turn].includes(h.id)) return;
      this.sound.tick();
      if (passing) {
        this.play(legal.find((m) => m.card === h.id)!);
        return;
      }
      if (this.pendingSq >= 0 && this.selSq >= 0) {
        const m = legal.find((mm) => mm.from === this.selSq && mm.to === this.pendingSq && mm.card === h.id);
        if (m) {
          this.play(m);
          return;
        }
      }
      this.selCard = this.selCard === h.id ? null : h.id;
      this.pendingSq = -1;
      // drop a stone selection that can't use this card
      if (this.selSq >= 0 && this.selCard !== null && this.movesFrom(this.selSq, this.selCard).length === 0) {
        this.selSq = -1;
        this.pieces.select(null);
      }
      this.refreshUsable();
      this.refreshMarkers();
      this.updateHint();
      return;
    }

    const sq = h.sq;
    if (passing) return;
    // own stone → select
    if (owner(s.board[sq]) === s.turn) {
      this.sound.tick();
      if (this.selSq === sq) {
        this.selSq = -1;
        this.pieces.select(null);
      } else {
        this.selSq = sq;
        this.pieces.select(this.pieces.at(sq) ?? null);
      }
      this.pendingSq = -1;
      this.refreshMarkers();
      this.updateHint();
      return;
    }
    // destination
    if (this.selSq >= 0) {
      const opts = this.movesFrom(this.selSq, this.selCard).filter((m) => m.to === sq);
      if (opts.length === 1) this.play(opts[0]);
      else if (opts.length > 1) {
        this.pendingSq = sq;
        this.updateHint();
      }
    }
  }

  // ------------------------------------------------------------ moves

  private play(m: Move) {
    if (this.busy) return;
    const prev = clone(this.state);
    this.history.push({ state: prev, move: m });
    applyMove(this.state, m);
    this.clearSelection();
    this.execute(prev, m);
  }

  private async execute(prev: GameState, m: Move) {
    const g = this.gen;
    this.busy = true;
    this.refreshUsable();
    this.hud.hint('');
    this.hud.log(prev.turn, moveName(m), m.to >= 0 && prev.board[m.to] ? prev.board[m.to] : 0);
    this.hud.undoBtn.disabled = true;
    await this.animate(prev, m);
    if (g !== this.gen) return;
    this.board.setLastMove(m.from, m.to);
    if (this.state.winner !== -1) {
      await this.victory();
      return;
    }
    if (m.from < 0) {
      this.hud.hint(`${NAMES[prev.turn]} had no move and gave up ${CARDS[m.card].name}`, true);
      await wait(1.2);
      if (g !== this.gen) return;
    }
    if (this.mode === 'hotseat') await this.turnCamera(this.state.turn, 1.1);
    if (g !== this.gen) return;
    this.busy = false;
    this.beginTurn();
  }

  private async animate(prev: GameState, m: Move) {
    const cardsP = this.animateCards(prev, m);
    if (m.from >= 0) {
      const piece = this.pieces.at(m.from)!;
      const victim = this.pieces.at(m.to);
      const a = squarePos(m.from), b = squarePos(m.to);
      this.sound.lift();
      await tween(0.14, (k) => (piece.mesh.position.y = TOP + k * 0.22), { ease: ease.outCubic });
      const dist = a.distanceTo(b);
      const dur = 0.4 + dist * 0.08;
      const h = 0.3 + dist * 0.2;
      let knocked = false;
      const tilt = (b.x - a.x) * 0.12;
      await tween(
        dur,
        (k) => {
          piece.mesh.position.lerpVectors(a, b, k);
          piece.mesh.position.y = TOP + 0.22 * (1 - k) + Math.sin(k * Math.PI) * h;
          piece.mesh.rotation.z = -Math.sin(k * Math.PI) * tilt;
          if (victim && !knocked && k > 0.8) {
            knocked = true;
            this.captureFx(m.card, a, b);
            this.knockOff(victim, a, b);
          }
        },
        { ease: ease.inOutSine },
      );
      piece.square = m.to;
      piece.mesh.rotation.z = 0;
      this.sound.clack(isMaster(prev.board[m.from]) ? 1.15 : 1);
      this.dust.burst(new THREE.Vector3(b.x, TOP, b.z), 10, 0x96928a, 0.7);
      await tween(0.2, (k) => {
        const s = Math.sin(k * Math.PI);
        piece.mesh.scale.set(1 + 0.07 * s, 1 - 0.1 * s, 1 + 0.07 * s);
      });
    }
    await cardsP;
  }

  /** Card-themed capture effect plus a short hit-stop for impact. */
  private captureFx(card: number, a: THREE.Vector3, b: THREE.Vector3) {
    const dir = new THREE.Vector3(b.x - a.x, 0, b.z - a.z);
    if (dir.lengthSq() < 1e-4) dir.set(0, 0, -1);
    dir.normalize();
    this.vfx.capture(CARDS[card].name, { at: b.clone().setY(TOP), from: a.clone(), dir });
    this.lastCaptureCard = CARDS[card].name;
    setTweenSpeed(0.2);
    setTimeout(() => setTweenSpeed(1), 110);
    // brief bloom swell and a gentle camera push-in make the hit land
    const bloom = this.stage.bloom;
    const cam = this.stage.camera;
    const f0 = cam.fov;
    tween(0.7, (k) => (bloom.strength = 0.42 + 0.45 * Math.sin(k * Math.PI) * (1 - k * 0.4)), { ease: ease.linear }).then(() => (bloom.strength = 0.42));
    tween(0.45, (k) => {
      cam.fov = f0 - 1.4 * Math.sin(k * Math.PI);
      cam.updateProjectionMatrix();
    }, { ease: ease.outCubic }).then(() => {
      cam.fov = f0;
      cam.updateProjectionMatrix();
    });
  }

  /** The captured stone is flung off the slab and swallowed by the gravel. */
  private knockOff(p: PieceObj, a: THREE.Vector3, b: THREE.Vector3) {
    this.pieces.pieces = this.pieces.pieces.filter((q) => q !== p);
    const dir = new THREE.Vector3(b.x - a.x, 0, b.z - a.z);
    if (dir.lengthSq() < 1e-4) dir.set(0, 0, p.player === 0 ? 1 : -1);
    dir.normalize();
    // travel until clear of the slab
    const land = b.clone();
    let t = 0;
    while (Math.abs(land.x) < 3.25 && Math.abs(land.z) < 3.25 && t < 10) {
      t += 0.1;
      land.copy(b).addScaledVector(dir, t);
    }
    land.addScaledVector(dir, 0.45);
    land.y = 0.0;
    const start = p.mesh.position.clone();
    const spin = new THREE.Vector3(dir.z, 0, -dir.x).multiplyScalar(4.2);
    const r0 = p.mesh.rotation.clone();
    tween(0.75, (k) => {
      p.mesh.position.lerpVectors(start, land, k);
      p.mesh.position.y = start.y + (land.y - start.y) * k + Math.sin(k * Math.PI) * 1.1;
      p.mesh.rotation.set(r0.x + spin.x * k, r0.y, r0.z + spin.z * k);
    }, { ease: ease.linear }).then(async () => {
      this.sound.thud();
      this.dust.burst(land.clone().setY(0.05), 22, 0xcfc2a3, 1.4);
      this.vfx.dissolve(land.clone().setY(0.1), this.lastCaptureCard);
      await tween(1.6, (k) => {
        p.mesh.position.y = land.y - k * 0.95;
        p.mesh.rotation.x += 0.004;
      }, { ease: ease.inCubic });
      this.pieces.group.remove(p.mesh);
    });
  }

  private lastCaptureCard = 'Tiger';

  private async animateCards(prev: GameState, m: Move) {
    const pl = prev.turn;
    const used = this.cards.cards.get(m.card)!;
    const side = this.cards.cards.get(prev.side)!;
    const slot = prev.hands[pl][0] === m.card ? 0 : 1;
    const toSide = slotTransform('side', (1 - pl) as Player);
    const toHand = slotTransform('hand', pl, slot);
    this.sound.swish();
    const p1 = this.moveCard(used, toSide.pos, used.group.rotation.y + Math.PI, 1.0, 0.7, 0.05);
    const p2 = this.moveCard(side, toHand.pos, toHand.rotY, 0.85, 0.35, 0.35);
    await Promise.all([p1, p2]);
    used.group.rotation.y = toSide.rotY;
  }

  private async moveCard(c: CardObj, to: THREE.Vector3, rotTo: number, dur: number, h: number, delay: number) {
    await wait(delay);
    const from = c.group.position.clone();
    const r0 = c.group.rotation.y;
    let r1 = rotTo;
    while (r1 - r0 > Math.PI + 0.01) r1 -= Math.PI * 2;
    while (r0 - r1 > Math.PI + 0.01) r1 += Math.PI * 2;
    await tween(
      dur,
      (k) => {
        c.group.position.lerpVectors(from, to, k);
        c.group.position.y = from.y + (to.y - from.y) * k + Math.sin(k * Math.PI) * h;
        c.group.rotation.y = r0 + (r1 - r0) * k;
        c.group.rotation.z = Math.sin(k * Math.PI) * 0.08;
      },
      { ease: ease.inOutCubic },
    );
    c.group.rotation.z = 0;
  }

  // ------------------------------------------------------------ AI

  private requestAI() {
    const id = ++this.aiReq;
    const s = this.state;
    const started = performance.now();
    this.pendingAI = { id, started, ply: s.ply };
    if (this.worker) {
      this.worker.postMessage({ id, level: this.level, state: { ...s, board: Array.from(s.board) } });
      // If the worker never answers (blocked/crashed), think on the main thread instead.
      setTimeout(() => {
        if (this.pendingAI?.id === id && performance.now() - started > 4000) this.thinkLocally(id);
      }, 4500);
    } else setTimeout(() => this.thinkLocally(id), 50);
  }

  private thinkLocally(id: number) {
    if (this.pendingAI?.id !== id) return;
    const r = chooseMove(clone(this.state), this.level);
    this.onAI({ id, ...r });
  }
  private pendingAI: { id: number; started: number; ply: number } | null = null;

  private async onAI(r: { id: number; move: Move; depth: number; score: number }) {
    const p = this.pendingAI;
    if (!p || r.id !== p.id || this.state.ply !== p.ply || !this.playing) return;
    this.pendingAI = null;
    const g = this.gen;
    const elapsed = (performance.now() - p.started) / 1000;
    if (elapsed < 0.9) await wait(0.9 - elapsed);
    if (g !== this.gen) return;
    this.play(r.move);
  }

  // ------------------------------------------------------------ undo / camera / victory

  undo() {
    if (!this.playing || this.history.length === 0) return;
    if (this.busy && this.state.winner === -1 && !this.pendingAI) return;
    this.gen++;
    this.pendingAI = null;
    overlay('result', false);
    this.stage.controls.autoRotate = false;
    // In AI mode rewind to the human's previous decision.
    let e = this.history.pop()!;
    if (this.mode === 'ai') {
      while (this.history.length && !this.isHuman(e.state.turn)) e = this.history.pop()!;
      if (!this.isHuman(e.state.turn)) {
        this.history.push(e); // nothing of the human's to undo yet
        return;
      }
    }
    this.state = clone(e.state);
    this.busy = false;
    this.pieces.sync(this.state);
    this.cards.layout(this.state.hands, this.state.side, this.state.turn);
    this.clearSelection();
    this.hud.rebuildLog(this.history.map((h) => ({ pl: h.state.turn, text: moveName(h.move), captured: h.move.to >= 0 ? h.state.board[h.move.to] : 0 })));
    const last = this.history[this.history.length - 1];
    this.board.setLastMove(last ? last.move.from : -1, last ? last.move.to : -1);
    if (this.mode === 'hotseat') this.turnCamera(this.state.turn, 0.8);
    this.beginTurn();
  }

  // ------------------------------------------------------------ camera views

  topView = false;
  private camAnimating = false;
  private lastCamInput = 0;
  private clock = 0;

  /** Whose seat the camera belongs to right now. */
  private homePlayer(): Player {
    return this.mode === 'ai' ? 0 : this.state.turn;
  }

  private setAzimuthLimits(theta: number | null) {
    const c = this.stage.controls;
    c.minAzimuthAngle = theta === null ? -Infinity : theta - AZ_LIMIT;
    c.maxAzimuthAngle = theta === null ? Infinity : theta + AZ_LIMIT;
  }

  /** Ease the camera to a player's seat (default or top-down view). keepZoom only restores the heading. */
  animateView(pl: Player, dur: number, keepZoom = false) {
    const cam = this.stage.camera;
    const target = this.stage.controls.target;
    const off = cam.position.clone().sub(target);
    const sph = new THREE.Spherical().setFromVector3(off);
    let th1 = pl === 0 ? 0 : Math.PI;
    while (th1 - sph.theta > Math.PI) th1 -= Math.PI * 2;
    while (sph.theta - th1 > Math.PI) th1 += Math.PI * 2;
    const th0 = sph.theta, ph0 = sph.phi, r0 = sph.radius;
    const portrait = this.stage.camera.aspect < 1 ? 1.25 : 1;
    const ph1 = keepZoom ? ph0 : this.topView ? TOP_PHI : CAM_PHI;
    const r1 = keepZoom ? r0 : (this.topView ? TOP_RADIUS : CAM_RADIUS) * portrait;
    this.stage.controls.enabled = false;
    this.camAnimating = true;
    this.setAzimuthLimits(null);
    return tween(dur, (k) => {
      sph.theta = th0 + (th1 - th0) * k;
      sph.phi = ph0 + (ph1 - ph0) * k;
      sph.radius = r0 + (r1 - r0) * k;
      cam.position.setFromSpherical(sph).add(target);
      cam.lookAt(target);
    }, { ease: ease.inOutCubic }).then(() => {
      this.camAnimating = false;
      if (this.playing && this.state.winner === -1) this.setAzimuthLimits(pl === 0 ? 0 : Math.PI);
      this.stage.controls.enabled = true;
      this.stage.controls.update();
      this.lastCamInput = this.clock;
    });
  }

  turnCamera(pl: Player, dur: number) {
    return this.animateView(pl, dur);
  }

  recenter() {
    if (this.camAnimating || this.stage.controls.autoRotate) return;
    this.animateView(this.homePlayer(), 0.7);
  }

  toggleTopView() {
    if (this.camAnimating || this.stage.controls.autoRotate) return this.topView;
    this.topView = !this.topView;
    this.animateView(this.homePlayer(), 0.8);
    return this.topView;
  }

  /** Scripted camera transitions need full frame rate (the slow victory spin is fine at the idle rate). */
  isAnimating() {
    return this.camAnimating;
  }

  /** Called on user camera input (OrbitControls 'start'/'change'). */
  noteCameraInput() {
    this.lastCamInput = this.clock;
  }

  private nudgeCamera() {
    if (!this.playing || this.camAnimating || this.state.winner !== -1 || this.stage.controls.autoRotate) return;
    if (this.clock - this.lastCamInput < NUDGE_AFTER) return;
    const off = this.stage.camera.position.clone().sub(this.stage.controls.target);
    const theta = new THREE.Spherical().setFromVector3(off).theta;
    const home = this.homePlayer() === 0 ? 0 : Math.PI;
    let d = theta - home;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    if (Math.abs(d) > 0.3) this.animateView(this.homePlayer(), 1.4, true);
    else this.lastCamInput = this.clock;
  }

  private async victory() {
    const s = this.state;
    const w = s.winner as Player;
    this.busy = true;
    this.refreshUsable();
    const humanWon = this.mode === 'hotseat' || w === 0;
    if (s.reason === 'stream') this.board.setMarkers(new Map([[TEMPLE[w === 0 ? 1 : 0], 5]]));
    this.leaves.burst(80);
    this.sound.chime(humanWon);
    const light = this.garden.lanternLight;
    const i0 = light.intensity;
    tween(2.5, (k) => (light.intensity = i0 * (1 + Math.sin(k * Math.PI) * 1.5)));
    this.hud.setTurn(w, s.reason === 'stone' ? 'Way of the Stone' : 'Way of the Stream');
    this.hud.hint('');
    this.hud.undoBtn.disabled = false;
    this.setAzimuthLimits(null);
    this.stage.controls.autoRotate = true;
    this.stage.controls.autoRotateSpeed = 0.35;
    await wait(1.8);
    const kanji = this.mode === 'ai' ? (w === 0 ? '勝' : '敗') : '勝';
    const title = this.mode === 'ai' ? (w === 0 ? 'Victory' : 'Defeat') : `${NAMES[w]} wins`;
    const sub = s.reason === 'stone' ? 'by the Way of the Stone — the master has fallen' : 'by the Way of the Stream — the temple is taken';
    (document.querySelector('.result-kanji') as HTMLElement).textContent = kanji;
    (document.querySelector('.result-title') as HTMLElement).textContent = title;
    (document.querySelector('.result-sub') as HTMLElement).textContent = sub;
    overlay('result', true);
  }

  update(dt: number, t: number) {
    this.clock += dt;
    this.nudgeCamera();
    this.garden.leafUniforms.uTime.value = t;
    // candle flicker
    const L = this.garden.lanternLight;
    if (!this.stage.controls.autoRotate || this.state.winner === -1)
      L.intensity = 14 * (0.9 + 0.06 * Math.sin(t * 7.1) + 0.04 * Math.sin(t * 13.7 + 1.3));
    this.garden.lanternGlow.emissiveIntensity = L.intensity / 4.4;
  }
}

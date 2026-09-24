import * as THREE from 'three';
import { CARDS } from '../engine/cards.ts';
import type { Player } from '../engine/game.ts';
import { canvas, tex } from './textures.ts';
import { mulberry32 } from './noise.ts';
import { boulderGeometry } from './garden.ts';
import { stoneMaterial } from './materials.ts';

export const CARD_W = 1.5;
export const CARD_D = 1.05;
const PLINTH_Y = 0.09;

const INK = '#1c1a17';
const SHU = '#b8402a';
const AI = '#34497a';

const cache = new Map<number, THREE.Texture>();

function washi(g: CanvasRenderingContext2D, w: number, h: number, seed: number) {
  const r = mulberry32(seed);
  g.fillStyle = '#efe5cf';
  g.fillRect(0, 0, w, h);
  // soft blotches
  for (let i = 0; i < 40; i++) {
    const x = r() * w, y = r() * h, rad = 40 + r() * 160;
    const gr = g.createRadialGradient(x, y, 0, x, y, rad);
    const a = 0.03 + r() * 0.04;
    gr.addColorStop(0, `rgba(180,150,105,${a})`);
    gr.addColorStop(1, 'rgba(180,150,105,0)');
    g.fillStyle = gr;
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  // kozo fibres
  g.lineCap = 'round';
  for (let i = 0; i < 260; i++) {
    const x = r() * w, y = r() * h, len = 20 + r() * 90, a = r() * Math.PI * 2;
    g.strokeStyle = r() < 0.5 ? `rgba(255,252,240,${0.25 + r() * 0.35})` : `rgba(150,120,80,${0.06 + r() * 0.08})`;
    g.lineWidth = 0.6 + r() * 1.4;
    g.beginPath();
    g.moveTo(x, y);
    g.bezierCurveTo(x + Math.cos(a) * len * 0.3 + (r() - 0.5) * 20, y + Math.sin(a) * len * 0.3 + (r() - 0.5) * 20, x + Math.cos(a) * len * 0.7, y + Math.sin(a) * len * 0.7, x + Math.cos(a) * len, y + Math.sin(a) * len);
    g.stroke();
  }
  // grain
  const img = g.getImageData(0, 0, w, h);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (r() - 0.5) * 10;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
}

function brushRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: () => number) {
  // slightly irregular filled square to feel hand-inked
  const j = () => (r() - 0.5) * w * 0.05;
  g.beginPath();
  g.moveTo(x + j(), y + j());
  g.lineTo(x + w + j(), y + j());
  g.lineTo(x + w + j(), y + h + j());
  g.lineTo(x + j(), y + h + j());
  g.closePath();
  g.fill();
}

export function cardTexture(id: number): THREE.Texture {
  const hit = cache.get(id);
  if (hit) return hit;
  const W = 1024, H = Math.round((1024 * CARD_D) / CARD_W);
  const [c, g] = canvas(W, H);
  const card = CARDS[id];
  const r = mulberry32(id * 977 + 13);
  washi(g, W, H, id + 1);

  // border: double ink rule
  g.strokeStyle = INK;
  g.globalAlpha = 0.85;
  g.lineWidth = 5;
  g.strokeRect(26, 26, W - 52, H - 52);
  g.lineWidth = 1.6;
  g.strokeRect(40, 40, W - 80, H - 80);
  g.globalAlpha = 1;

  // --- left: ensō wash + brush kanji
  const cx = W * 0.27, cy = H * 0.44;
  g.save();
  g.translate(cx, cy);
  g.lineCap = 'round';
  for (let k = 0; k < 120; k++) {
    const t = k / 120;
    const a0 = -1.9 + t * 5.5;
    g.strokeStyle = `rgba(40,36,32,${0.05 + 0.1 * Math.sin(t * Math.PI)})`;
    g.lineWidth = 30 * Math.sin(t * Math.PI) + 6;
    g.beginPath();
    g.arc(0, 0, 170 + Math.sin(k * 0.4) * 3, a0, a0 + 0.06);
    g.stroke();
  }
  g.restore();
  g.fillStyle = INK;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `260px "Yuji Syuku", "Shippori Mincho B1", serif`;
  g.shadowColor = 'rgba(28,26,23,0.35)';
  g.shadowBlur = 6;
  g.fillText(card.kanji, cx, cy + 6);
  g.shadowBlur = 0;

  // name
  g.font = `600 50px "Shippori Mincho B1", serif`;
  g.fillStyle = INK;
  const name = card.name.toUpperCase().split('').join(String.fromCharCode(8202));
  g.fillText(name, cx, H * 0.84);

  // seal (hanko) — stamp colour marks who moves first
  const sealC = card.stamp === 'blue' ? AI : SHU;
  g.save();
  g.translate(W * 0.47, H * 0.84);
  g.rotate(-0.08);
  g.fillStyle = sealC;
  g.globalAlpha = 0.92;
  brushRect(g, -30, -30, 60, 60, r);
  g.globalAlpha = 1;
  g.fillStyle = '#f3e9d4';
  g.font = `44px "Yuji Syuku", serif`;
  g.fillText(card.stamp === 'blue' ? '石' : '岩', 0, 2);
  g.restore();

  // --- right: 5×5 move grid. Up on the card = forward for the owner.
  const gs = 430;
  const gx = W * 0.56, gy = (H - gs) / 2 - 8;
  const cell = gs / 5;
  const moves = new Set(card.moves.map(([dx, dy]) => `${2 + dx},${2 - dy}`));
  for (let yy = 0; yy < 5; yy++)
    for (let xx = 0; xx < 5; xx++) {
      const x = gx + xx * cell, y = gy + yy * cell;
      const pad = 7;
      if (xx === 2 && yy === 2) {
        g.fillStyle = INK;
        brushRect(g, x + pad, y + pad, cell - pad * 2, cell - pad * 2, r);
      } else if (moves.has(`${xx},${yy}`)) {
        g.fillStyle = SHU;
        g.globalAlpha = 0.9;
        brushRect(g, x + pad, y + pad, cell - pad * 2, cell - pad * 2, r);
        g.globalAlpha = 1;
      } else {
        g.fillStyle = 'rgba(60,50,40,0.07)';
        g.fillRect(x + pad, y + pad, cell - pad * 2, cell - pad * 2);
      }
    }
  g.strokeStyle = 'rgba(28,26,23,0.55)';
  g.lineWidth = 2;
  for (let i = 0; i <= 5; i++) {
    g.beginPath();
    g.moveTo(gx + i * cell, gy);
    g.lineTo(gx + i * cell, gy + gs);
    g.stroke();
    g.beginPath();
    g.moveTo(gx, gy + i * cell);
    g.lineTo(gx + gs, gy + i * cell);
    g.stroke();
  }
  // small forward arrow tick above the grid
  g.fillStyle = 'rgba(28,26,23,0.6)';
  g.beginPath();
  g.moveTo(gx + gs / 2, gy - 22);
  g.lineTo(gx + gs / 2 - 10, gy - 8);
  g.lineTo(gx + gs / 2 + 10, gy - 8);
  g.fill();

  const t = tex(c, true);
  cache.set(id, t);
  return t;
}

function glowTexture() {
  const W = 512, H = Math.round((512 * (CARD_D + 0.3)) / (CARD_W + 0.3));
  const [c, g] = canvas(W, H);
  g.filter = 'blur(18px)';
  g.strokeStyle = 'rgba(255,255,255,1)';
  g.lineWidth = 22;
  const m = 48;
  g.beginPath();
  g.roundRect(m, m, W - 2 * m, H - 2 * m, 16);
  g.stroke();
  return tex(c, true);
}

export interface CardObj {
  id: number;
  group: THREE.Group;
  face: THREE.Mesh;
  glow: THREE.Mesh;
  lift: number;
  liftTarget: number;
  selected: boolean;
  hovered: boolean;
  usable: boolean;
}

/** Slot layout. The side card sits to the right of the player about to receive it. */
export function slotTransform(kind: 'hand' | 'side', player: Player, slot = 0) {
  const rotY = player === 0 ? 0 : Math.PI;
  if (kind === 'hand') {
    const x = (slot === 0 ? -0.86 : 0.86) * (player === 0 ? 1 : -1);
    const z = player === 0 ? 3.95 : -3.95;
    return { pos: new THREE.Vector3(x, PLINTH_Y + 0.02, z), rotY };
  }
  return { pos: new THREE.Vector3(player === 0 ? 3.95 : -3.95, PLINTH_Y + 0.02, player === 0 ? 1.55 : -1.55), rotY };
}

export class CardsView {
  group = new THREE.Group();
  cards = new Map<number, CardObj>();
  private edgeMat = new THREE.MeshStandardMaterial({ color: 0xd9ccb0, roughness: 0.9 });
  private glowTex = glowTexture();
  plinthFeatures: { x: number; z: number; r: number }[] = [];

  constructor() {
    // flat stones the cards rest on
    const mat = stoneMaterial({ octaves: 2, base: 0x8b867c, dark: 0x6a665e, speck1: 0xa19b8f, speck2: 0x47443f, scale: 1.4, speckScale: 30, speckAmount: 0.45, roughness: 0.85, bump: 0.05, strata: 2 });
    const spots: [number, number, number, number][] = [
      [0, 3.95, 2.0, 0.8],
      [0, -3.95, 2.0, 0.8],
      [3.95, 1.55, 0.95, 0.76],
      [-3.95, -1.55, 0.95, 0.76],
    ];
    let seed = 1;
    for (const [x, z, hx, hz] of spots) {
      const m = new THREE.Mesh(boulderGeometry(seed++ * 5.7, hx, 0.13, hz, 4, 0.1), mat);
      m.position.set(x, -0.03, z);
      m.receiveShadow = true;
      m.castShadow = true;
      this.group.add(m);
      if (hx > 1.5) {
        this.plinthFeatures.push({ x: x - 0.9, z, r: 0.95 }, { x: x + 0.9, z, r: 0.95 });
      } else this.plinthFeatures.push({ x, z, r: 1.0 });
    }
  }

  private make(id: number): CardObj {
    const group = new THREE.Group();
    const faceMat = new THREE.MeshStandardMaterial({ map: cardTexture(id), roughness: 0.85, emissive: 0xffffff, emissiveMap: cardTexture(id), emissiveIntensity: 0.06 });
    const geo = new THREE.BoxGeometry(CARD_W, 0.014, CARD_D);
    const face = new THREE.Mesh(geo, [this.edgeMat, this.edgeMat, faceMat, this.edgeMat, this.edgeMat, this.edgeMat]);
    face.castShadow = true;
    face.receiveShadow = true;
    face.userData.cardId = id;
    group.add(face);
    const gg = new THREE.PlaneGeometry(CARD_W + 0.3, CARD_D + 0.3);
    gg.rotateX(-Math.PI / 2);
    const glow = new THREE.Mesh(
      gg,
      new THREE.MeshBasicMaterial({ map: this.glowTex, color: 0xffcf88, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
    );
    glow.position.y = -0.004;
    group.add(glow);
    this.group.add(group);
    return { id, group, face, glow, lift: 0, liftTarget: 0, selected: false, hovered: false, usable: false };
  }

  /** Place all five cards for a state without animation. */
  layout(hands: [[number, number], [number, number]], side: number, turn: Player) {
    for (const c of this.cards.values()) this.group.remove(c.group);
    this.cards.clear();
    for (const pl of [0, 1] as Player[])
      for (let s = 0; s < 2; s++) {
        const c = this.make(hands[pl][s]);
        const t = slotTransform('hand', pl, s);
        c.group.position.copy(t.pos);
        c.group.rotation.y = t.rotY;
        this.cards.set(c.id, c);
      }
    const c = this.make(side);
    const t = slotTransform('side', turn);
    c.group.position.copy(t.pos);
    c.group.rotation.y = t.rotY;
    this.cards.set(side, c);
  }

  faces() {
    return [...this.cards.values()].map((c) => c.face);
  }

  update(dt: number, t: number) {
    for (const c of this.cards.values()) {
      c.liftTarget = c.selected ? 0.16 : c.hovered && c.usable ? 0.08 : 0;
      c.lift += (c.liftTarget - c.lift) * Math.min(1, dt * 12);
      c.face.position.y = c.lift;
      c.face.rotation.x = c.lift * 0.9;
      const gm = c.glow.material as THREE.MeshBasicMaterial;
      const target = c.selected ? 0.95 : c.usable ? 0.22 + 0.1 * Math.sin(t * 2.2) : 0;
      gm.opacity += (target - gm.opacity) * Math.min(1, dt * 8);
    }
  }
}

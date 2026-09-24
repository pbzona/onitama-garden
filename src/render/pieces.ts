import * as THREE from 'three';
import { basaltMat, graniteMat, PALETTE } from './materials.ts';
import { isMaster, owner, type GameState, type Player } from '../engine/game.ts';
import { squarePos } from './board.ts';

function arc(pts: THREE.Vector2[], cx: number, cy: number, r: number, a0: number, a1: number, n: number) {
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    pts.push(new THREE.Vector2(Math.max(0, cx + Math.cos(a) * r), cy + Math.sin(a) * r));
  }
}

function studentGeometry() {
  const p: THREE.Vector2[] = [new THREE.Vector2(0, 0)];
  p.push(new THREE.Vector2(0.29, 0));
  arc(p, 0.29, 0.035, 0.035, -Math.PI / 2, Math.PI / 2, 6); // rounded base rim
  p.push(new THREE.Vector2(0.27, 0.085), new THREE.Vector2(0.2, 0.13), new THREE.Vector2(0.155, 0.2), new THREE.Vector2(0.14, 0.27));
  p.push(new THREE.Vector2(0.15, 0.3), new THREE.Vector2(0.17, 0.315), new THREE.Vector2(0.15, 0.33)); // collar bead
  arc(p, 0, 0.44, 0.13, -Math.PI / 2 + 0.55, Math.PI / 2, 16); // head
  const g = new THREE.LatheGeometry(p, 56);
  g.deleteAttribute('uv');
  return g;
}

function masterGeometry() {
  const p: THREE.Vector2[] = [new THREE.Vector2(0, 0)];
  p.push(new THREE.Vector2(0.34, 0));
  arc(p, 0.34, 0.04, 0.04, -Math.PI / 2, Math.PI / 2, 6);
  p.push(new THREE.Vector2(0.31, 0.1), new THREE.Vector2(0.27, 0.14), new THREE.Vector2(0.23, 0.26), new THREE.Vector2(0.2, 0.4), new THREE.Vector2(0.17, 0.5));
  p.push(new THREE.Vector2(0.22, 0.53), new THREE.Vector2(0.23, 0.56), new THREE.Vector2(0.17, 0.58)); // shoulder ring
  arc(p, 0, 0.68, 0.13, -Math.PI / 2 + 0.6, Math.PI / 2 - 0.35, 12); // head
  // kasa (conical hat)
  p.push(new THREE.Vector2(0.1, 0.8), new THREE.Vector2(0.3, 0.77), new THREE.Vector2(0.31, 0.79), new THREE.Vector2(0.06, 0.93), new THREE.Vector2(0.03, 0.97), new THREE.Vector2(0, 0.975));
  const g = new THREE.LatheGeometry(p, 64);
  g.deleteAttribute('uv');
  return g;
}

export interface PieceObj {
  fade?: number; // 1 = solid, lower = see-through
  mesh: THREE.Group;
  code: number;
  player: Player;
  master: boolean;
  square: number;
  body: THREE.Mesh;
}

export class PiecesView {
  group = new THREE.Group();
  pieces: PieceObj[] = [];
  private geoS = studentGeometry();
  private geoM = masterGeometry();
  private cordMats = [
    new THREE.MeshStandardMaterial({ color: PALETTE.indigo, roughness: 0.55 }),
    new THREE.MeshStandardMaterial({ color: PALETTE.vermilion, roughness: 0.55 }),
  ];
  private goldMat = new THREE.MeshStandardMaterial({ color: PALETTE.gold, metalness: 1, roughness: 0.3 });
  private cordGeoM = new THREE.TorusGeometry(0.2, 0.022, 10, 48);
  private cordGeoS = new THREE.TorusGeometry(0.15, 0.015, 8, 40);
  private selRing: THREE.Mesh;
  ghost: THREE.Group;
  private ghostMats: THREE.MeshStandardMaterial[];

  constructor() {
    const rg = new THREE.RingGeometry(0.34, 0.42, 64);
    rg.rotateX(-Math.PI / 2);
    this.selRing = new THREE.Mesh(
      rg,
      new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
    );
    this.group.add(this.selRing);
    this.ghostMats = [0, 1].map(
      () => new THREE.MeshStandardMaterial({ color: 0xfff0d8, transparent: true, opacity: 0.28, depthWrite: false, emissive: 0x6b4a20, roughness: 0.5 }),
    );
    this.ghost = new THREE.Group();
    this.ghost.visible = false;
    this.group.add(this.ghost);
  }

  private make(code: number, square: number): PieceObj {
    const pl = owner(code) as Player;
    const master = isMaster(code);
    const g = new THREE.Group();
    const body = new THREE.Mesh(master ? this.geoM : this.geoS, pl === 0 ? graniteMat() : basaltMat());
    body.castShadow = body.receiveShadow = true;
    g.add(body);
    // coloured silk cord around the waist identifies the side at a glance
    const cord = new THREE.Mesh(master ? this.cordGeoM : this.cordGeoS, this.cordMats[pl]);
    cord.rotation.x = Math.PI / 2;
    cord.position.y = master ? 0.45 : 0.27;
    cord.castShadow = true;
    g.add(cord);
    if (master) {
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.305, 0.012, 8, 64), this.goldMat);
      band.rotation.x = Math.PI / 2;
      band.position.y = 0.785;
      g.add(band);
      const knot = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 8), this.cordMats[pl]);
      knot.position.set(0, 0.45, 0.2);
      g.add(knot);
    }
    squarePos(square, g.position);
    // pieces face their opponent
    g.rotation.y = pl === 0 ? 0 : Math.PI;
    g.userData.piece = true;
    body.userData.pieceRef = g;
    this.group.add(g);
    return { mesh: g, code, player: pl, master, square, body };
  }

  sync(s: GameState) {
    for (const p of this.pieces) this.group.remove(p.mesh);
    this.pieces = [];
    for (let i = 0; i < 25; i++) if (s.board[i]) this.pieces.push(this.make(s.board[i], i));
  }

  at(square: number) {
    return this.pieces.find((p) => p.square === square);
  }

  remove(p: PieceObj) {
    this.group.remove(p.mesh);
    this.pieces = this.pieces.filter((q) => q !== p);
  }

  pickables() {
    return this.pieces.map((p) => p.body);
  }

  private faded = new Set<PieceObj>();
  /** Stones standing between the camera and a highlighted square turn see-through. */
  setFaded(ps: Set<PieceObj>) {
    this.faded = ps;
  }

  select(p: PieceObj | null) {
    this.selected = p;
  }
  selected: PieceObj | null = null;

  showGhost(p: PieceObj | null, square: number) {
    if (!p || square < 0) {
      this.ghost.visible = false;
      return;
    }
    this.ghost.clear();
    const m = new THREE.Mesh(p.master ? this.geoM : this.geoS, this.ghostMats[p.player]);
    this.ghost.add(m);
    squarePos(square, this.ghost.position);
    this.ghost.visible = true;
  }

  update(dt: number, t: number) {
    for (const p of this.pieces) {
      const target = this.faded.has(p) ? 0.28 : 1;
      const cur = p.fade ?? 1;
      if (Math.abs(target - cur) < 0.002 && cur === target) continue;
      const next = Math.abs(target - cur) < 0.01 ? target : cur + (target - cur) * Math.min(1, dt * 12);
      p.fade = next;
      const m = p.body.material as THREE.MeshPhysicalMaterial;
      m.transparent = next < 1;
      m.opacity = next;
      m.depthWrite = next >= 1;
      // cords/bands are shared materials; hide them while see-through
      p.mesh.children.forEach((c) => c !== p.body && (c.visible = next > 0.6));
    }
    const ring = this.selRing.material as THREE.MeshBasicMaterial;
    if (this.selected) {
      ring.opacity += (0.9 - ring.opacity) * Math.min(1, dt * 10);
      this.selRing.position.set(this.selected.mesh.position.x, squarePos(this.selected.square).y + 0.006, this.selected.mesh.position.z);
      const s = this.selected.master ? 1.1 : 1;
      this.selRing.scale.set(s, 1, s);
      this.selRing.rotation.y = t * 0.6;
    } else ring.opacity += (0 - ring.opacity) * Math.min(1, dt * 10);
    if (this.ghost.visible) this.ghost.position.y = squarePos(0).y + 0.02 + Math.sin(t * 4) * 0.015;
  }
}

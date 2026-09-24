import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { PALETTE, stoneMaterial } from './materials.ts';
import { boardEngraveTexture, ensoTexture, softSquareTexture } from './textures.ts';
import { xOf, yOf } from '../engine/game.ts';

export const CELL = 1.0;
export const SLAB = 5.7;
export const SLAB_H = 0.36;
export const TOP = SLAB_H + 0.02; // top surface height (slab sits on a thin plinth)

export function squarePos(i: number, out = new THREE.Vector3()) {
  return out.set((xOf(i) - 2) * CELL, TOP, (2 - yOf(i)) * CELL);
}

export class BoardView {
  group = new THREE.Group();
  pickPlanes: THREE.Mesh[] = [];
  private markers: THREE.Mesh[] = [];
  private markerMat: THREE.MeshBasicMaterial[] = [];
  private markerState: { target: number; cur: number; color: THREE.Color; pulse: number }[] = [];
  private lastMove: THREE.Mesh[] = [];

  constructor() {
    const engrave = boardEngraveTexture(SLAB, CELL);
    const slateMat = stoneMaterial({
      ...PALETTE.slate,
      scale: 1.3,
      speckScale: 40,
      speckAmount: 0.45,
      roughness: 0.5,
      bump: 0.028,
      clearcoat: 0.18,
      strata: 4,
      engraveMap: engrave,
      engraveSize: SLAB,
      topY: SLAB_H / 2,
    });
    const slab = new THREE.Mesh(new RoundedBoxGeometry(SLAB, SLAB_H, SLAB, 5, 0.07), slateMat);
    slab.position.y = SLAB_H / 2 + 0.02;
    slab.castShadow = slab.receiveShadow = true;
    this.group.add(slab);

    // Invisible pick planes + move markers per square.
    const enso = ensoTexture();
    const pickGeo = new THREE.PlaneGeometry(CELL, CELL);
    pickGeo.rotateX(-Math.PI / 2);
    const mGeo = new THREE.PlaneGeometry(CELL * 0.9, CELL * 0.9);
    mGeo.rotateX(-Math.PI / 2);
    const lmGeo = new THREE.PlaneGeometry(CELL * 0.96, CELL * 0.96);
    lmGeo.rotateX(-Math.PI / 2);
    const pickMat = new THREE.MeshBasicMaterial({ visible: false });
    const soft = softSquareTexture();
    for (let i = 0; i < 25; i++) {
      const p = squarePos(i);
      const pick = new THREE.Mesh(pickGeo, pickMat);
      pick.position.copy(p);
      pick.userData.square = i;
      this.group.add(pick);
      this.pickPlanes.push(pick);

      const mat = new THREE.MeshBasicMaterial({
        map: enso,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        color: 0xffd08a,
        toneMapped: false,
      });
      const mk = new THREE.Mesh(mGeo, mat);
      mk.position.copy(p).y += 0.004;
      mk.rotation.y = Math.random() * Math.PI * 2;
      mk.renderOrder = 2;
      this.group.add(mk);
      this.markers.push(mk);
      this.markerMat.push(mat);
      this.markerState.push({ target: 0, cur: 0, color: new THREE.Color(0xffd08a), pulse: Math.random() * 6 });

      const lm = new THREE.Mesh(
        lmGeo,
        new THREE.MeshBasicMaterial({ map: soft, color: 0xffc98a, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }),
      );
      lm.position.copy(p).y += 0.002;
      this.group.add(lm);
      this.lastMove.push(lm);
    }
  }

  /** kind: 0 none, 1 move, 2 capture, 3 hover-move, 4 hover-capture, 5 temple-win */
  setMarkers(map: Map<number, number>) {
    for (let i = 0; i < 25; i++) {
      const k = map.get(i) ?? 0;
      const st = this.markerState[i];
      st.target = k === 0 ? 0 : k >= 3 ? 1.0 : 0.62;
      if (k === 2 || k === 4) st.color.set(0xff7a55);
      else if (k === 5) st.color.set(0xffe2a0);
      else st.color.set(0xffd08a);
    }
  }

  setLastMove(from: number, to: number) {
    this.lastMove.forEach((m, i) => ((m.material as THREE.MeshBasicMaterial).opacity = i === from ? 0.05 : i === to ? 0.1 : 0));
  }

  update(dt: number, t: number) {
    for (let i = 0; i < 25; i++) {
      const st = this.markerState[i];
      st.cur += (st.target - st.cur) * Math.min(1, dt * 10);
      const m = this.markerMat[i];
      m.opacity = st.cur * (0.85 + 0.15 * Math.sin(t * 3 + st.pulse));
      m.color.copy(st.color);
      this.markers[i].rotation.y += dt * 0.25 * (st.cur > 0.01 ? 1 : 0);
      const s = 0.92 + st.cur * 0.08;
      this.markers[i].scale.set(s, 1, s);
    }
  }
}

import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { boulderMat, mossMat, stoneMaterial } from './materials.ts';
import { fbm3, mulberry32 } from './noise.ts';
import { mapleLeafTexture } from './textures.ts';
import type { RakeFeature } from './sand.ts';

const rng = mulberry32(20260923);
const rr = (a: number, b: number) => a + (b - a) * rng();

// ---------------------------------------------------------------- rocks & moss

export function boulderGeometry(seed: number, sx: number, sy: number, sz: number, detail = 5, rough = 0.35) {
  let g: THREE.BufferGeometry = new THREE.IcosahedronGeometry(1, detail);
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  g = mergeVertices(g);
  const p = g.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = fbm3(v.x * 1.3 + seed, v.y * 1.3, v.z * 1.3 - seed, 5);
    // faceted, chiselled look: quantise a low-frequency term
    const facet = Math.round(fbm3(v.x * 0.7 - seed, v.y * 0.7 + seed, v.z * 0.7, 2) * 5) / 5;
    v.multiplyScalar(1 + n * rough + facet * 0.12);
    v.set(v.x * sx, v.y * sy, v.z * sz);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

function mossMound(r: number, seed: number) {
  const g = boulderGeometry(seed, r * 1.35, 0.14, r * 1.25, 4, 0.5);
  return g;
}

export interface GardenRefs {
  group: THREE.Group;
  features: RakeFeature[];
  lanternLight: THREE.PointLight;
  lanternGlow: THREE.MeshStandardMaterial;
  leafMat: THREE.MeshStandardMaterial;
  leafUniforms: { uTime: { value: number } };
  canopyCenters: THREE.Vector3[];
}

export function buildGarden(): GardenRefs {
  const group = new THREE.Group();
  const features: RakeFeature[] = [];
  const bMat = boulderMat();
  const mMat = mossMat();

  const rockSets: { x: number; z: number; rocks: [number, number, number, number, number][] }[] = [
    // [dx, dz, sx, sy, sz]
    { x: -7.6, z: -3.2, rocks: [[0, 0, 1.25, 1.05, 1.0], [1.3, 0.6, 0.6, 0.5, 0.55], [-0.9, 0.9, 0.45, 0.32, 0.5]] },
    { x: 7.4, z: -4.6, rocks: [[0, 0, 1.0, 1.4, 0.85], [-1.1, 0.5, 0.55, 0.45, 0.6]] },
    { x: 7.2, z: 3.4, rocks: [[0, 0, 0.7, 0.45, 0.65]] },
    { x: -3.2, z: -7.2, rocks: [[0, 0, 0.9, 0.6, 0.7], [1.0, -0.3, 0.45, 0.35, 0.45]] },
    // near side & flanks, seen when orbiting
    { x: 9.6, z: 8.8, rocks: [[0, 0, 1.1, 0.8, 0.9], [1.2, -0.5, 0.5, 0.4, 0.5], [-0.8, 0.7, 0.35, 0.25, 0.4]] },
    { x: -11.2, z: -2.0, rocks: [[0, 0, 0.8, 1.1, 0.7]] },
    { x: 3.2, z: 10.6, rocks: [[0, 0, 0.6, 0.4, 0.55], [0.9, 0.3, 0.35, 0.25, 0.35]] },
  ];
  let seed = 3;
  for (const set of rockSets) {
    const maxR = Math.max(...set.rocks.map((r) => Math.max(r[2], r[4])));
    for (const [dx, dz, sx, sy, sz] of set.rocks) {
      const g = boulderGeometry(seed++ * 7.1, sx, sy, sz);
      const m = new THREE.Mesh(g, bMat);
      m.position.set(set.x + dx, sy * 0.25, set.z + dz);
      m.rotation.y = rr(0, Math.PI * 2);
      m.castShadow = m.receiveShadow = true;
      group.add(m);
    }
    const moss = new THREE.Mesh(mossMound(maxR * 1.25, seed++), mMat);
    moss.position.set(set.x + 0.2, -0.02, set.z + 0.25);
    moss.receiveShadow = true;
    group.add(moss);
    features.push({ x: set.x + 0.2, z: set.z + 0.25, r: maxR * 1.55 });
  }

  // stepping stones (tobi-ishi) in the near-left corner
  const stepMat = stoneMaterial({ base: 0x8a8378, dark: 0x6e685e, speck1: 0xa39c8f, speck2: 0x4a4640, scale: 1.4, speckScale: 22, speckAmount: 0.4, roughness: 0.85, bump: 0.03 });
  const path: [number, number][] = [
    [-5.2, 6.4], [-6.1, 5.3], [-6.6, 4.0], [-7.5, 3.0], [-8.6, 2.3],
  ];
  for (const [x, z] of path) {
    const s = rr(0.42, 0.55);
    const g = boulderGeometry(seed++ * 3.3, s, 0.08, s * rr(0.8, 1.0), 3, 0.2);
    const m = new THREE.Mesh(g, stepMat);
    m.position.set(x, 0.03, z);
    m.rotation.y = rr(0, 6.28);
    m.receiveShadow = true;
    m.castShadow = true;
    group.add(m);
    features.push({ x, z, r: s + 0.06 });
  }

  // ---------------------------------------------------------------- stone lantern (kasuga-dōrō)
  const lantern = new THREE.Group();
  const lMat = stoneMaterial({ base: 0x8d887c, dark: 0x5f6a55, speck1: 0x6f7d58, speck2: 0x3e3b36, scale: 2.2, speckScale: 20, speckAmount: 0.5, roughness: 0.92, bump: 0.05 });
  const lathe = (pts: [number, number][], seg = 6) =>
    new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);
  const parts: THREE.BufferGeometry[] = [
    lathe([[0, 0], [0.46, 0], [0.46, 0.1], [0.36, 0.17], [0.3, 0.22], [0, 0.22]]),
    lathe([[0, 0.2], [0.13, 0.2], [0.12, 0.55], [0.15, 0.58], [0.15, 0.62], [0.12, 0.65], [0.11, 0.98], [0, 0.98]], 16),
    lathe([[0, 0.96], [0.2, 0.96], [0.36, 1.06], [0.36, 1.13], [0, 1.13]]),
    lathe([[0, 1.46], [0.56, 1.46], [0.6, 1.5], [0.52, 1.55], [0.16, 1.72], [0.11, 1.76], [0, 1.76]]),
    lathe([[0, 1.75], [0.09, 1.76], [0.13, 1.82], [0.1, 1.9], [0.04, 1.96], [0, 1.99]], 12),
  ];
  // posts of the light chamber
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const post = new THREE.BoxGeometry(0.07, 0.34, 0.07);
    post.rotateY(-a);
    post.translate(Math.cos(a) * 0.27, 1.3, Math.sin(a) * 0.27);
    parts.push(post.toNonIndexed().index ? post : post);
  }
  const lanternStone = new THREE.Mesh(
    mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)).map((p) => {
      p.deleteAttribute('uv');
      return p;
    })),
    lMat,
  );
  lanternStone.castShadow = lanternStone.receiveShadow = true;
  lantern.add(lanternStone);
  const lanternGlow = new THREE.MeshStandardMaterial({ color: 0x1a0f05, emissive: 0xffa04a, emissiveIntensity: 3.2, roughness: 1 });
  const paper = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.32, 6, 1), lanternGlow);
  paper.position.y = 1.3;
  lantern.add(paper);
  const lanternLight = new THREE.PointLight(0xffa860, 14, 9, 2);
  lanternLight.position.set(0, 1.3, 0);
  lantern.add(lanternLight);
  lantern.scale.setScalar(1.25);
  lantern.position.set(-6.4, 0, 1.0);
  lantern.rotation.y = 0.3;
  group.add(lantern);
  const lMoss = new THREE.Mesh(mossMound(0.8, 91), mMat);
  lMoss.position.set(-6.4, -0.02, 1.0);
  group.add(lMoss);
  features.push({ x: -6.4, z: 1.0, r: 1.05 });

  // ---------------------------------------------------------------- Japanese maple
  const maple = buildMaple();
  maple.group.position.set(-8.6, 0, -6.2);
  group.add(maple.group);
  const mapleMoss = new THREE.Mesh(mossMound(1.3, 17), mMat);
  mapleMoss.position.set(-8.6, -0.02, -6.2);
  group.add(mapleMoss);
  features.push({ x: -8.6, z: -6.2, r: 1.6 });

  // ---------------------------------------------------------------- cloud-pruned pines (niwaki)
  const pine1 = buildNiwaki(5, 1.0);
  pine1.position.set(9.4, 0, -8.2);
  group.add(pine1);
  const pm1 = new THREE.Mesh(mossMound(1.2, 23), mMat);
  pm1.position.set(9.4, -0.02, -8.2);
  group.add(pm1);
  features.push({ x: 9.4, z: -8.2, r: 1.5 });
  const pine2 = buildNiwaki(9, 0.75);
  pine2.position.set(3.6, 0, -10.2);
  group.add(pine2);
  const pine3 = buildNiwaki(13, 0.9);
  pine3.position.set(-10.4, 0, 9.4);
  pine3.rotation.y = 2.2;
  group.add(pine3);
  const pm3 = new THREE.Mesh(mossMound(1.2, 31), mMat);
  pm3.position.set(-10.4, -0.02, 9.4);
  group.add(pm3);
  features.push({ x: -10.4, z: 9.4, r: 1.5 });
  const pine4 = buildNiwaki(21, 0.7);
  pine4.position.set(11.2, 0, -3.4);
  pine4.rotation.y = -1.1;
  group.add(pine4);

  // ---------------------------------------------------------------- garden wall (tsuiji-bei)
  group.add(buildWalls());

  // distant tree line beyond the wall: clustered canopies merged into one mesh
  const farGeos: THREE.BufferGeometry[] = [];
  const treeCount = 64;
  for (let i = 0; i < treeCount; i++) {
    const ang = (i / treeCount) * Math.PI * 2 + rr(-0.03, 0.03);
    // square-ish ring just outside the walls
    const rad = rr(17.5, 23) / Math.max(Math.abs(Math.cos(ang)), Math.abs(Math.sin(ang)), 0.75) * 0.82;
    const cx = Math.cos(ang) * rad;
    const cz = Math.sin(ang) * rad;
    const hgt = rr(3.5, 6.5);
    const blobs = 5 + Math.floor(rng() * 4);
    for (let b = 0; b < blobs; b++) {
      const s = rr(0.9, 1.7);
      const g = boulderGeometry(i * 13.1 + b * 3.7, s * 1.2, s, s * 1.2, 2, 0.5);
      const a = rng() * Math.PI * 2;
      const r2 = rr(0.2, 1.4);
      g.translate(cx + Math.cos(a) * r2, hgt * rr(0.55, 1.0), cz + Math.sin(a) * r2);
      farGeos.push(g);
    }
  }
  const farMat = new THREE.MeshStandardMaterial({ color: 0x2c3a2c, roughness: 1 });
  group.add(new THREE.Mesh(mergeGeometries(farGeos), farMat));

  return {
    group,
    features,
    lanternLight,
    lanternGlow,
    leafMat: maple.leafMat,
    leafUniforms: maple.uniforms,
    canopyCenters: maple.canopy.map((v) => v.clone().add(maple.group.position)),
  };
}

// ---------------------------------------------------------------- maple

function buildMaple() {
  const group = new THREE.Group();
  const barkGeos: THREE.BufferGeometry[] = [];
  const leafSpots: { p: THREE.Vector3; r: number; n: number }[] = [];
  const up = new THREE.Vector3(0, 1, 0);
  const q = new THREE.Quaternion();

  const addSeg = (a: THREE.Vector3, b: THREE.Vector3, r0: number, r1: number) => {
    const d = new THREE.Vector3().subVectors(b, a);
    const len = d.length();
    const g = new THREE.CylinderGeometry(r1, r0, len * 1.04, 8, 1);
    g.translate(0, len / 2, 0);
    q.setFromUnitVectors(up, d.normalize());
    g.applyQuaternion(q);
    g.translate(a.x, a.y, a.z);
    g.deleteAttribute('uv');
    barkGeos.push(g);
  };

  const grow = (start: THREE.Vector3, dir: THREE.Vector3, len: number, r: number, depth: number) => {
    // slightly curved branch made of 3 sub-segments
    let p = start.clone();
    let d = dir.clone();
    const steps = 3;
    for (let s = 0; s < steps; s++) {
      d.add(new THREE.Vector3(rr(-0.2, 0.2), rr(-0.05, 0.12), rr(-0.2, 0.2))).normalize();
      const np = p.clone().addScaledVector(d, len / steps);
      const r0 = r * (1 - (s / steps) * 0.3);
      const r1 = r * (1 - ((s + 1) / steps) * 0.3);
      addSeg(p, np, r0, r1);
      p = np;
    }
    const rEnd = r * 0.7;
    if (depth === 0 || rEnd < 0.018) {
      leafSpots.push({ p, r: 0.6 + len * 0.25, n: 150 });
      return;
    }
    if (depth <= 2) leafSpots.push({ p, r: 0.5, n: 50 });
    const kids = depth > 3 ? 2 : 3;
    for (let k = 0; k < kids; k++) {
      const yaw = (k / kids) * Math.PI * 2 + rr(-0.5, 0.5);
      const side = new THREE.Vector3(Math.cos(yaw), 0, Math.sin(yaw));
      const nd = d.clone().multiplyScalar(0.55).addScaledVector(side, rr(0.6, 1.0)).add(new THREE.Vector3(0, rr(0.05, 0.35), 0)).normalize();
      grow(p, nd, len * rr(0.62, 0.78), rEnd, depth - 1);
    }
  };
  grow(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.25, 1, 0.15).normalize(), 1.7, 0.17, 5);

  const barkMat = stoneMaterial({ base: 0x4a3b30, dark: 0x2e241e, speck1: 0x6b5a4a, speck2: 0x1d1612, scale: 4, speckScale: 30, speckAmount: 0.4, roughness: 0.95, bump: 0.05, strata: 0.2 });
  const bark = new THREE.Mesh(mergeGeometries(barkGeos), barkMat);
  bark.castShadow = bark.receiveShadow = true;
  group.add(bark);

  const total = leafSpots.reduce((s, l) => s + l.n, 0);
  const leafGeo = new THREE.PlaneGeometry(0.26, 0.26);
  const leafTex = mapleLeafTexture();
  const uniforms = { uTime: { value: 0 } };
  const leafMat = new THREE.MeshStandardMaterial({
    alphaMap: leafTex,
    alphaTest: 0.5,
    side: THREE.DoubleSide,
    roughness: 0.75,
    color: 0xffffff,
  });
  leafMat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uniforms.uTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
#ifdef USE_INSTANCING
vec3 ip = vec3(instanceMatrix[3]);
float ph = ip.x * 1.7 + ip.z * 1.3 + ip.y * 2.1;
transformed.z += sin(uTime * 2.3 + ph) * 0.04 * (position.y + 0.1);
transformed.x += sin(uTime * 1.3 + ph * 0.7) * 0.02;
#endif`,
      );
  };
  // Leaves are lit from both sides; emissive gives a touch of translucent back-glow.
  leafMat.emissive = new THREE.Color(0x3a0800);
  const leaves = new THREE.InstancedMesh(leafGeo, leafMat, total);
  const palette = [0xb3261e, 0xc8321c, 0xd9481f, 0xe0662a, 0x9e1b1b, 0xe8883a, 0x8a1a22].map((c) => new THREE.Color(c));
  const m4 = new THREE.Matrix4();
  const e = new THREE.Euler();
  const pos = new THREE.Vector3();
  const sc = new THREE.Vector3();
  let i = 0;
  const canopy: THREE.Vector3[] = [];
  for (const s of leafSpots) {
    canopy.push(s.p);
    for (let k = 0; k < s.n; k++) {
      const u = rng() * 2 - 1, th = rng() * Math.PI * 2, rad = Math.cbrt(rng()) * s.r;
      const sq = Math.sqrt(1 - u * u);
      pos.set(s.p.x + sq * Math.cos(th) * rad, s.p.y + u * rad * 0.55 + 0.05, s.p.z + sq * Math.sin(th) * rad);
      e.set(-Math.PI / 2 + rr(-0.9, 0.9), rr(0, Math.PI * 2), rr(-0.6, 0.6));
      const size = rr(0.7, 1.25);
      sc.set(size, size, size);
      m4.compose(pos, new THREE.Quaternion().setFromEuler(e), sc);
      leaves.setMatrixAt(i, m4);
      const c = palette[Math.floor(rng() * palette.length)].clone();
      c.offsetHSL(rr(-0.01, 0.01), 0, rr(-0.06, 0.04));
      leaves.setColorAt(i, c);
      i++;
    }
  }
  leaves.castShadow = true;
  leaves.receiveShadow = true;
  group.add(leaves);
  group.scale.setScalar(1.35);
  return { group, leafMat, uniforms, canopy: canopy.map((c) => c.clone().multiplyScalar(1.35)) };
}

// ---------------------------------------------------------------- niwaki pine

function buildNiwaki(seed: number, scale: number) {
  const g = new THREE.Group();
  const r = mulberry32(seed);
  const trunkPts = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.3, 1.0, 0.1), new THREE.Vector3(-0.2, 2.0, 0.2), new THREE.Vector3(0.25, 3.1, -0.1), new THREE.Vector3(0.05, 3.9, 0)];
  const curve = new THREE.CatmullRomCurve3(trunkPts);
  const trunk = new THREE.TubeGeometry(curve, 24, 0.16, 8, false);
  trunk.deleteAttribute('uv');
  const barkMat = stoneMaterial({ base: 0x4d4038, dark: 0x2b231f, speck1: 0x6b5a4d, speck2: 0x1a1512, scale: 5, speckScale: 25, speckAmount: 0.5, roughness: 0.95, bump: 0.06, strata: 0.25 });
  const tm = new THREE.Mesh(trunk, barkMat);
  tm.castShadow = true;
  g.add(tm);
  const needle = stoneMaterial({ base: 0x2f4a2a, dark: 0x1c2f1b, speck1: 0x4c6b3a, speck2: 0x13200f, scale: 3, speckScale: 50, speckAmount: 0.8, roughness: 1, bump: 0.12, sheen: 0x6f8f4a });
  const pads: [number, number, number, number][] = [
    [0.05, 4.1, 0, 0.8],
    [0.9, 3.0, 0.3, 0.75],
    [-0.9, 2.4, 0.1, 0.85],
    [0.7, 1.6, -0.4, 0.7],
    [-0.4, 3.4, -0.6, 0.6],
  ];
  for (const [x, y, z, s] of pads) {
    const p = curve.getPoint(Math.min(1, y / 4));
    const bg = new THREE.TubeGeometry(new THREE.LineCurve3(p, new THREE.Vector3(x, y - 0.1, z)), 2, 0.05, 6, false);
    bg.deleteAttribute('uv');
    g.add(new THREE.Mesh(bg, barkMat));
    for (let k = 0; k < 4; k++) {
      const pg = boulderGeometry(seed * 10 + k + y, s * (0.8 + r() * 0.4), s * 0.42, s * (0.7 + r() * 0.4), 3, 0.55);
      const m = new THREE.Mesh(pg, needle);
      m.position.set(x + (r() - 0.5) * s * 0.8, y + (r() - 0.5) * 0.15, z + (r() - 0.5) * s * 0.8);
      m.castShadow = true;
      m.receiveShadow = true;
      g.add(m);
    }
  }
  g.scale.setScalar(scale * 1.25);
  return g;
}

// ---------------------------------------------------------------- wall

/** Garden enclosure: four tsuiji-bei walls (tile-capped plaster on a stone footing). */
const WALL_HALF = 14;
function buildWalls() {
  const g = new THREE.Group();
  const L = WALL_HALF * 2 + 0.6;
  const plaster = stoneMaterial({ base: 0xe0c89c, dark: 0xbfa276, speck1: 0xd9c9a6, speck2: 0x8f7a58, scale: 0.35, speckScale: 6, speckAmount: 0.15, roughness: 0.95, bump: 0.02, strata: 3 });
  const lineMat = new THREE.MeshStandardMaterial({ color: 0xe9dfc9, roughness: 0.9 });
  const baseMat = stoneMaterial({ base: 0x6f6a60, dark: 0x4f4b44, speck1: 0x8a8578, speck2: 0x33302b, scale: 1.2, speckScale: 16, speckAmount: 0.5, roughness: 0.9, bump: 0.05 });
  const tileMat = new THREE.MeshStandardMaterial({ color: 0x3c4046, roughness: 0.55, metalness: 0.15 });
  const moss = mossMat();
  const segment = (seed: number) => {
    // built along X, inner (garden) face towards +Z
    const w = new THREE.Group();
    const wall = new THREE.Mesh(new THREE.BoxGeometry(L, 2.4, 0.55), plaster);
    wall.position.set(0, 1.2, 0);
    wall.receiveShadow = true;
    wall.castShadow = true;
    w.add(wall);
    for (let i = 0; i < 3; i++) {
      for (const side of [1, -1]) {
        const l = new THREE.Mesh(new THREE.BoxGeometry(L, 0.035, 0.02), lineMat);
        l.position.set(0, 1.55 + i * 0.16, side * 0.285);
        w.add(l);
      }
    }
    const base = new THREE.Mesh(new THREE.BoxGeometry(L, 0.42, 0.75), baseMat);
    base.position.set(0, 0.21, 0);
    base.receiveShadow = true;
    w.add(base);
    const shape = new THREE.Shape();
    shape.moveTo(-0.75, 0);
    shape.lineTo(0.75, 0);
    shape.lineTo(0.0, 0.38);
    shape.closePath();
    const roof = new THREE.ExtrudeGeometry(shape, { depth: L, bevelEnabled: false });
    roof.rotateY(Math.PI / 2);
    roof.translate(-L / 2, 2.4, 0);
    const rm = new THREE.Mesh(roof, tileMat);
    rm.castShadow = rm.receiveShadow = true;
    w.add(rm);
    const tileGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.86, 8, 1, false, 0, Math.PI);
    const n = Math.floor(L / 0.19);
    const tiles = new THREE.InstancedMesh(tileGeo, tileMat, n * 2);
    const m4 = new THREE.Matrix4();
    const qq = new THREE.Quaternion();
    const slope = Math.atan2(0.38, 0.75);
    for (let side = 0; side < 2; side++) {
      const sgn = side ? 1 : -1;
      qq.setFromEuler(new THREE.Euler(sgn * (Math.PI / 2 - slope), 0, 0));
      for (let i = 0; i < n; i++) {
        m4.compose(new THREE.Vector3(-L / 2 + (i + 0.5) * 0.19, 2.6, sgn * 0.37), qq, new THREE.Vector3(1, 1, 1));
        tiles.setMatrixAt(side * n + i, m4);
      }
    }
    tiles.castShadow = true;
    w.add(tiles);
    const ridge = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, L, 10), tileMat);
    ridge.rotation.z = Math.PI / 2;
    ridge.position.set(0, 2.8, 0);
    w.add(ridge);
    const mstrip = new THREE.Mesh(boulderGeometry(77 + seed, L / 2 - 1, 0.12, 1.1, 4, 0.2), moss);
    mstrip.position.set(0, -0.03, 1.0);
    mstrip.receiveShadow = true;
    w.add(mstrip);
    return w;
  };
  const place: [number, number, number][] = [
    [0, -WALL_HALF, 0], // back
    [0, WALL_HALF, Math.PI], // front
    [-WALL_HALF, 0, Math.PI / 2], // left
    [WALL_HALF, 0, -Math.PI / 2], // right
  ];
  place.forEach(([x, z, ry], i) => {
    const w = segment(i * 13);
    w.position.set(x, 0, z);
    w.rotation.y = ry;
    g.add(w);
  });
  // squat stone corner posts tidy up where the walls meet
  const postMat = baseMat;
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.95, 3.0, 0.95), postMat);
      p.position.set(sx * WALL_HALF, 1.5, sz * WALL_HALF);
      p.castShadow = p.receiveShadow = true;
      g.add(p);
      const cap = new THREE.Mesh(new THREE.ConeGeometry(0.85, 0.5, 4), tileMat);
      cap.rotation.y = Math.PI / 4;
      cap.position.set(sx * WALL_HALF, 3.25, sz * WALL_HALF);
      g.add(cap);
    }
  return g;
}

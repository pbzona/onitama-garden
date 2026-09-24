import * as THREE from 'three';
import { canvas, tex } from './textures.ts';
import { tween, ease } from './tween.ts';
import { TOP } from './board.ts';
import type { Sound } from '../audio.ts';

// Capture effects: one per move card, loosely themed on the animal.
// Everything is additive "ink spirit" light + a small particle toolkit.

// ------------------------------------------------------------------ textures

/** 4×2 atlas: 0 glow, 1 flame, 2 smoke, 3 feather, 4 streak, 5 droplet, 6 star, 7 bubble ring. */
function atlasTexture() {
  const C = 128;
  const [c, g] = canvas(C * 4, C * 2);
  const cell = (i: number, fn: () => void) => {
    g.save();
    g.translate((i % 4) * C + C / 2, Math.floor(i / 4) * C + C / 2);
    fn();
    g.restore();
  };
  const radial = (r: number, stops: [number, string][]) => {
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, r);
    for (const [o, col] of stops) gr.addColorStop(o, col);
    return gr;
  };
  cell(0, () => {
    g.fillStyle = radial(62, [[0, 'rgba(255,255,255,1)'], [0.25, 'rgba(255,255,255,0.7)'], [1, 'rgba(255,255,255,0)']]);
    g.fillRect(-64, -64, 128, 128);
  });
  cell(1, () => {
    g.scale(0.75, 1.15);
    g.translate(0, 10);
    g.fillStyle = radial(55, [[0, 'rgba(255,255,255,1)'], [0.45, 'rgba(255,255,255,0.65)'], [1, 'rgba(255,255,255,0)']]);
    g.beginPath();
    g.moveTo(0, -56);
    g.bezierCurveTo(30, -20, 44, 10, 36, 30);
    g.bezierCurveTo(26, 52, -26, 52, -36, 30);
    g.bezierCurveTo(-44, 10, -30, -20, 0, -56);
    g.fill();
  });
  cell(2, () => {
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * Math.PI * 2, r = 18;
      g.save();
      g.translate(Math.cos(a) * r, Math.sin(a) * r);
      g.fillStyle = radial(34, [[0, 'rgba(255,255,255,0.35)'], [1, 'rgba(255,255,255,0)']]);
      g.fillRect(-40, -40, 80, 80);
      g.restore();
    }
    g.fillStyle = radial(40, [[0, 'rgba(255,255,255,0.5)'], [1, 'rgba(255,255,255,0)']]);
    g.fillRect(-50, -50, 100, 100);
  });
  cell(3, () => {
    g.rotate(-0.5);
    g.fillStyle = 'rgba(255,255,255,0.92)';
    g.beginPath();
    g.moveTo(0, -54);
    g.bezierCurveTo(22, -30, 20, 30, 2, 54);
    g.bezierCurveTo(-18, 30, -20, -30, 0, -54);
    g.fill();
    g.strokeStyle = 'rgba(200,200,200,0.9)';
    g.lineWidth = 2.5;
    g.beginPath();
    g.moveTo(0, -50);
    g.lineTo(1, 58);
    g.stroke();
    g.strokeStyle = 'rgba(0,0,0,0.12)';
    g.lineWidth = 1;
    for (let k = -40; k < 45; k += 7) {
      g.beginPath();
      g.moveTo(0, k);
      g.lineTo(16, k - 10);
      g.moveTo(0, k);
      g.lineTo(-16, k - 10);
      g.stroke();
    }
  });
  cell(4, () => {
    const gr = g.createLinearGradient(-60, 0, 60, 0);
    gr.addColorStop(0, 'rgba(255,255,255,0)');
    gr.addColorStop(0.7, 'rgba(255,255,255,1)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.beginPath();
    g.ellipse(0, 0, 60, 9, 0, 0, Math.PI * 2);
    g.fill();
  });
  cell(5, () => {
    g.fillStyle = radial(40, [[0, 'rgba(255,255,255,1)'], [0.7, 'rgba(255,255,255,0.8)'], [1, 'rgba(255,255,255,0)']]);
    g.beginPath();
    g.moveTo(0, -46);
    g.bezierCurveTo(26, -8, 30, 16, 24, 28);
    g.bezierCurveTo(14, 46, -14, 46, -24, 28);
    g.bezierCurveTo(-30, 16, -26, -8, 0, -46);
    g.fill();
  });
  cell(6, () => {
    g.fillStyle = radial(20, [[0, 'rgba(255,255,255,1)'], [1, 'rgba(255,255,255,0)']]);
    g.fillRect(-30, -30, 60, 60);
    for (const r of [0, Math.PI / 2]) {
      g.save();
      g.rotate(r);
      const gr = g.createLinearGradient(-60, 0, 60, 0);
      gr.addColorStop(0, 'rgba(255,255,255,0)');
      gr.addColorStop(0.5, 'rgba(255,255,255,1)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr;
      g.beginPath();
      g.ellipse(0, 0, 60, 5, 0, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }
  });
  cell(7, () => {
    g.strokeStyle = 'rgba(255,255,255,0.9)';
    g.lineWidth = 6;
    g.beginPath();
    g.arc(0, 0, 44, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.8)';
    g.beginPath();
    g.arc(-16, -18, 8, 0, Math.PI * 2);
    g.fill();
  });
  return tex(c, true);
}

function ringTexture() {
  const N = 256;
  const [c, g] = canvas(N);
  const gr = g.createRadialGradient(N / 2, N / 2, N * 0.3, N / 2, N / 2, N / 2);
  gr.addColorStop(0, 'rgba(255,255,255,0)');
  gr.addColorStop(0.75, 'rgba(255,255,255,1)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, N, N);
  return tex(c, true);
}

function slashTexture() {
  const [c, g] = canvas(512, 64);
  const gr = g.createLinearGradient(0, 0, 512, 0);
  gr.addColorStop(0, 'rgba(255,255,255,0)');
  gr.addColorStop(0.15, 'rgba(255,255,255,1)');
  gr.addColorStop(0.8, 'rgba(255,255,255,1)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.beginPath();
  g.moveTo(0, 32);
  g.quadraticCurveTo(256, 4, 512, 32);
  g.quadraticCurveTo(256, 60, 0, 32);
  g.fill();
  return tex(c, true);
}

function raysTexture() {
  const N = 512;
  const [c, g] = canvas(N);
  g.translate(N / 2, N / 2);
  const rays = 24;
  for (let i = 0; i < rays; i++) {
    const a = (i / rays) * Math.PI * 2;
    const w = i % 2 ? 0.05 : 0.09;
    const len = i % 2 ? N * 0.36 : N * 0.49;
    const gr = g.createLinearGradient(0, 0, Math.cos(a) * len, Math.sin(a) * len);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(Math.cos(a - w) * len, Math.sin(a - w) * len);
    g.lineTo(Math.cos(a + w) * len, Math.sin(a + w) * len);
    g.fill();
  }
  const core = g.createRadialGradient(0, 0, 0, 0, 0, N * 0.18);
  core.addColorStop(0, 'rgba(255,255,255,1)');
  core.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = core;
  g.fillRect(-N / 2, -N / 2, N, N);
  return tex(c, true);
}

function crackTexture() {
  const N = 512;
  const [c, g] = canvas(N);
  g.translate(N / 2, N / 2);
  g.strokeStyle = 'rgba(10,8,6,0.95)';
  g.lineCap = 'round';
  const branch = (x: number, y: number, a: number, len: number, w: number, depth: number) => {
    let px = x, py = y;
    const steps = 7;
    for (let s = 0; s < steps; s++) {
      a += (Math.random() - 0.5) * 0.7;
      const nx = px + Math.cos(a) * (len / steps), ny = py + Math.sin(a) * (len / steps);
      g.lineWidth = w * (1 - s / steps) + 0.6;
      g.beginPath();
      g.moveTo(px, py);
      g.lineTo(nx, ny);
      g.stroke();
      px = nx;
      py = ny;
      if (depth > 0 && Math.random() < 0.25) branch(px, py, a + (Math.random() - 0.5) * 1.6, len * 0.45, w * 0.6, depth - 1);
    }
  };
  for (let i = 0; i < 7; i++) branch(0, 0, (i / 7) * Math.PI * 2 + Math.random() * 0.4, N * (0.3 + Math.random() * 0.15), 6, 2);
  return tex(c, true);
}

function softDiscTexture() {
  const N = 256;
  const [c, g] = canvas(N);
  const gr = g.createRadialGradient(N / 2, N / 2, 0, N / 2, N / 2, N / 2);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.42, 'rgba(255,255,255,0.95)');
  gr.addColorStop(0.5, 'rgba(255,255,255,0.35)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, N, N);
  return tex(c, true);
}

/** Crescent: a curved claw / blade / horn / wing shape, base at the origin, curving up and right. */
function crescentGeometry() {
  const s = new THREE.Shape();
  const n = 24;
  for (let i = 0; i <= n; i++) {
    const a = Math.PI * 1.05 - (i / n) * Math.PI * 0.95;
    const x = Math.cos(a) * 1 + 1, y = Math.sin(a) * 1;
    i === 0 ? s.moveTo(x, y) : s.lineTo(x, y);
  }
  for (let i = n; i >= 0; i--) {
    const a = Math.PI * 1.05 - (i / n) * Math.PI * 0.95;
    const r = 0.6 + 0.36 * (i / n); // thick at the base, sharp at the tip
    const x = Math.cos(a) * r + 1.12, y = Math.sin(a) * r * 0.86;
    s.lineTo(x, y);
  }
  s.closePath();
  const g = new THREE.ShapeGeometry(s, 4);
  g.translate(-0.04, 0, 0);
  return g;
}

// ------------------------------------------------------------------ particles

interface P {
  p: THREE.Vector3;
  v: THREE.Vector3;
  life: number;
  t: number;
  s0: number;
  s1: number;
  c0: THREE.Color;
  c1: THREE.Color;
  a0: number;
  a1: number;
  tile: number;
  rot: number;
  spin: number;
  drag: number;
  grav: number;
  stretch: number;
  swirl?: { c: THREE.Vector3; w: number; pull: number };
  wobble: number;
}

export interface PInit {
  p: THREE.Vector3;
  v?: THREE.Vector3;
  life: number;
  size: [number, number];
  color: [THREE.ColorRepresentation, THREE.ColorRepresentation];
  alpha?: [number, number];
  tile: number;
  spin?: number;
  drag?: number;
  grav?: number;
  stretch?: number;
  swirl?: { c: THREE.Vector3; w: number; pull: number };
  wobble?: number;
  intensity?: number;
}

class PSystem {
  mesh: THREE.Mesh;
  private ps: P[] = [];
  private geo: THREE.InstancedBufferGeometry;
  private aPos: Float32Array;
  private aCol: Float32Array;
  private aSize: Float32Array;
  private aRot: Float32Array;
  private aTile: Float32Array;
  private aVel: Float32Array;

  constructor(private max: number, map: THREE.Texture, additive: boolean) {
    const base = new THREE.PlaneGeometry(1, 1);
    const g = new THREE.InstancedBufferGeometry();
    g.index = base.index;
    g.setAttribute('position', base.attributes.position);
    g.setAttribute('uv', base.attributes.uv);
    this.aPos = new Float32Array(max * 3);
    this.aCol = new Float32Array(max * 4);
    this.aSize = new Float32Array(max);
    this.aRot = new Float32Array(max);
    this.aTile = new Float32Array(max);
    this.aVel = new Float32Array(max * 4);
    const ia = (arr: Float32Array, n: number) => new THREE.InstancedBufferAttribute(arr, n).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('iPos', ia(this.aPos, 3));
    g.setAttribute('iCol', ia(this.aCol, 4));
    g.setAttribute('iSize', ia(this.aSize, 1));
    g.setAttribute('iRot', ia(this.aRot, 1));
    g.setAttribute('iTile', ia(this.aTile, 1));
    g.setAttribute('iVel', ia(this.aVel, 4));
    g.instanceCount = 0;
    this.geo = g;
    const mat = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: map } },
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      vertexShader: /* glsl */ `
        attribute vec3 iPos; attribute vec4 iCol; attribute float iSize; attribute float iRot; attribute float iTile; attribute vec4 iVel;
        varying vec2 vUv; varying vec4 vCol;
        void main(){
          vec4 mv = modelViewMatrix * vec4(iPos, 1.0);
          vec2 c = position.xy;
          float s = sin(iRot), co = cos(iRot);
          vec2 rc = vec2(c.x * co - c.y * s, c.x * s + c.y * co);
          if (iVel.w > 0.0) {
            vec3 vv = (modelViewMatrix * vec4(iVel.xyz, 0.0)).xyz;
            vec2 d = length(vv.xy) > 1e-4 ? normalize(vv.xy) : vec2(1.0, 0.0);
            vec2 n = vec2(-d.y, d.x);
            rc = d * c.x * (1.0 + iVel.w * length(iVel.xyz)) + n * c.y;
          }
          mv.xy += rc * iSize;
          gl_Position = projectionMatrix * mv;
          float tx = mod(iTile, 4.0), ty = floor(iTile / 4.0);
          vUv = vec2((uv.x + tx) * 0.25, (uv.y + 1.0 - ty) * 0.5);
          vCol = iCol;
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uMap; varying vec2 vUv; varying vec4 vCol;
        void main(){ vec4 t = texture2D(uMap, vUv); gl_FragColor = vec4(vCol.rgb * t.rgb, vCol.a * t.a); }`,
    });
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = additive ? 20 : 19;
  }

  emit(o: PInit) {
    if (this.ps.length >= this.max) return;
    const k = o.intensity ?? 1;
    this.ps.push({
      p: o.p.clone(),
      v: o.v ? o.v.clone() : new THREE.Vector3(),
      life: o.life,
      t: 0,
      s0: o.size[0],
      s1: o.size[1],
      c0: new THREE.Color(o.color[0]).multiplyScalar(k),
      c1: new THREE.Color(o.color[1]).multiplyScalar(k),
      a0: o.alpha?.[0] ?? 1,
      a1: o.alpha?.[1] ?? 0,
      tile: o.tile,
      rot: Math.random() * Math.PI * 2,
      spin: o.spin ?? 0,
      drag: o.drag ?? 0,
      grav: o.grav ?? 0,
      stretch: o.stretch ?? 0,
      swirl: o.swirl,
      wobble: o.wobble ?? 0,
    });
  }

  update(dt: number, time: number) {
    const tmp = new THREE.Color();
    let n = 0;
    for (let i = this.ps.length - 1; i >= 0; i--) {
      const p = this.ps[i];
      p.t += dt;
      if (p.t >= p.life) {
        this.ps.splice(i, 1);
        continue;
      }
      if (p.swirl) {
        const { c, w, pull } = p.swirl;
        const dx = p.p.x - c.x, dz = p.p.z - c.z;
        const ang = w * dt;
        const cs = Math.cos(ang), sn = Math.sin(ang);
        const f = 1 + pull * dt;
        p.p.x = c.x + (dx * cs - dz * sn) * f;
        p.p.z = c.z + (dx * sn + dz * cs) * f;
      }
      p.v.y += p.grav * dt;
      if (p.drag) p.v.multiplyScalar(Math.exp(-p.drag * dt));
      p.p.addScaledVector(p.v, dt);
      if (p.wobble) p.p.x += Math.sin(time * 9 + i) * p.wobble * dt;
      p.rot += p.spin * dt;
    }
    for (const p of this.ps) {
      const k = p.t / p.life;
      this.aPos.set([p.p.x, p.p.y, p.p.z], n * 3);
      tmp.copy(p.c0).lerp(p.c1, k);
      const a = (p.a0 + (p.a1 - p.a0) * k) * Math.min(1, p.t * 30);
      this.aCol.set([tmp.r, tmp.g, tmp.b, a], n * 4);
      this.aSize[n] = p.s0 + (p.s1 - p.s0) * k;
      this.aRot[n] = p.rot;
      this.aTile[n] = p.tile;
      this.aVel.set([p.v.x, p.v.y, p.v.z, p.stretch], n * 4);
      n++;
    }
    this.geo.instanceCount = n;
    for (const name of ['iPos', 'iCol', 'iSize', 'iRot', 'iTile', 'iVel']) (this.geo.attributes[name] as THREE.InstancedBufferAttribute).needsUpdate = true;
  }
}

// ------------------------------------------------------------------ helpers

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const randDir = () => {
  const u = Math.random() * 2 - 1, t = Math.random() * Math.PI * 2, s = Math.sqrt(1 - u * u);
  return V(s * Math.cos(t), u, s * Math.sin(t));
};

export interface CaptureCtx {
  at: THREE.Vector3; // capture square centre (board surface)
  from: THREE.Vector3; // attacker's origin square
  dir: THREE.Vector3; // horizontal unit direction of the attack
}

export class Vfx {
  group = new THREE.Group();
  private add: PSystem;
  private alpha: PSystem;
  private billboards = new Set<THREE.Object3D>();
  private updaters = new Set<(dt: number, t: number) => void>();
  private shakeAmp = 0;
  private shakeOff = new THREE.Vector3();
  private ringTex = ringTexture();
  private slashTex = slashTexture();
  private raysTex = raysTexture();
  private crackTex = crackTexture();
  private softDisc = softDiscTexture();
  private crescent = crescentGeometry();
  scale = 1; // particle count multiplier (lower on "Light" quality)

  constructor(private camera: THREE.Camera, private sound: Sound) {
    const atlas = atlasTexture();
    this.add = new PSystem(2500, atlas, true);
    this.alpha = new PSystem(1500, atlas, false);
    this.group.add(this.alpha.mesh, this.add.mesh);
  }

  // ---- primitives
  private n(k: number) {
    return Math.max(1, Math.round(k * this.scale));
  }
  private glowMat(color: THREE.ColorRepresentation, intensity: number, opacity = 1, map: THREE.Texture | null = null) {
    return new THREE.MeshBasicMaterial({
      color: new THREE.Color(color).multiplyScalar(intensity),
      map,
      transparent: true,
      opacity,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
  }
  private spawn(o: THREE.Object3D, billboard = false) {
    this.group.add(o);
    if (billboard) this.billboards.add(o);
    return o;
  }
  private kill(o: THREE.Object3D) {
    this.group.remove(o);
    this.billboards.delete(o);
    o.traverse((c) => {
      const m = c as THREE.Mesh;
      if (m.material) (m.material as THREE.Material).dispose();
    });
  }
  private run(fn: (dt: number, t: number) => void, dur: number) {
    this.updaters.add(fn);
    return tween(dur, () => {}, { ease: ease.linear }).then(() => this.updaters.delete(fn));
  }
  private stream(dur: number, perSec: number, fn: () => void) {
    let acc = 0;
    return this.run((dt) => {
      acc += dt * perSec * this.scale;
      while (acc >= 1) {
        acc--;
        fn();
      }
    }, dur);
  }
  private flash(pos: THREE.Vector3, color: THREE.ColorRepresentation, intensity: number, dur: number, flicker = 0) {
    const l = new THREE.PointLight(color, 0, 7, 2);
    l.position.copy(pos);
    this.group.add(l);
    tween(dur, (k) => (l.intensity = intensity * (1 - k) * (1 - flicker + flicker * Math.random())), { ease: ease.outCubic }).then(() => {
      this.group.remove(l);
      l.dispose();
    });
  }
  shake(amount: number, dur: number) {
    tween(dur, (k) => (this.shakeAmp = Math.max(this.shakeAmp * 0.9, amount * (1 - k) * (1 - k))), { ease: ease.linear }).then(() => (this.shakeAmp = 0));
  }
  private flatRing(pos: THREE.Vector3, color: THREE.ColorRepresentation, intensity: number, r0: number, r1: number, dur: number, delay = 0) {
    const geo = new THREE.PlaneGeometry(2, 2);
    geo.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(geo, this.glowMat(color, intensity, 0, this.ringTex));
    m.position.copy(pos).setY(TOP + 0.01);
    m.renderOrder = 18;
    this.spawn(m);
    return tween(dur, (k) => {
      const r = r0 + (r1 - r0) * k;
      m.scale.set(r, 1, r);
      (m.material as THREE.MeshBasicMaterial).opacity = Math.sin(Math.min(1, k * 1.4) * Math.PI) * (1 - k * 0.3);
    }, { ease: ease.outCubic, delay }).then(() => this.kill(m));
  }
  private crescentMesh(color: THREE.ColorRepresentation, intensity: number, opacity: number) {
    return new THREE.Mesh(this.crescent, this.glowMat(color, intensity, opacity));
  }
  private fade(o: THREE.Mesh | THREE.Object3D, from: number, to: number, dur: number, delay = 0) {
    const mats: THREE.MeshBasicMaterial[] = [];
    o.traverse((c) => (c as THREE.Mesh).material && mats.push((c as THREE.Mesh).material as THREE.MeshBasicMaterial));
    return tween(dur, (k) => mats.forEach((m) => (m.opacity = from + (to - from) * k)), { delay, ease: ease.linear });
  }
  private sparks(at: THREE.Vector3, n: number, c0: THREE.ColorRepresentation, c1: THREE.ColorRepresentation, speed = 3, life = 0.5) {
    for (let i = 0; i < this.n(n); i++) {
      const d = randDir();
      d.y = Math.abs(d.y) * 0.8 + 0.2;
      this.add.emit({ p: at, v: d.multiplyScalar(rnd(0.5, 1) * speed), life: rnd(0.6, 1) * life, size: [0.1, 0.02], color: [c0, c1], tile: 4, stretch: 0.09, grav: -5, drag: 1.5, intensity: 2.2 });
    }
  }

  // ---- frame hooks
  update(dt: number, t: number) {
    this.add.update(dt, t);
    this.alpha.update(dt, t);
    for (const b of this.billboards) b.quaternion.copy(this.camera.quaternion);
    for (const u of this.updaters) u(dt, t);
  }
  preRender() {
    if (this.shakeAmp <= 0) return;
    this.shakeOff.set((Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2).multiplyScalar(this.shakeAmp);
    this.camera.position.add(this.shakeOff);
  }
  postRender() {
    if (this.shakeOff.lengthSq() > 0) {
      this.camera.position.sub(this.shakeOff);
      this.shakeOff.set(0, 0, 0);
    }
  }

  // ------------------------------------------------------------------ capture dispatcher

  capture(cardName: string, ctx: CaptureCtx) {
    const fn = (this as any)['fx' + cardName] as ((c: CaptureCtx) => void) | undefined;
    (fn ?? this.fxTiger).call(this, ctx);
  }

  /** Tiger 虎 — three raking claw slashes and a spray of sparks. */
  fxTiger({ at }: CaptureCtx) {
    this.sound.fx('slash');
    const g = new THREE.Group();
    g.position.copy(at).add(V(0, 0.55, 0));
    this.spawn(g, true);
    const inner = new THREE.Group();
    inner.rotation.z = -0.85;
    g.add(inner);
    for (let i = 0; i < 3; i++) {
      const geo = new THREE.PlaneGeometry(1.5, 0.16);
      geo.translate(0.75, 0, 0);
      const m = new THREE.Mesh(geo, this.glowMat(0xffb35a, 3, 1, this.slashTex));
      m.position.set(-0.75, (i - 1) * 0.22, 0);
      m.scale.x = 0.001;
      inner.add(m);
      tween(0.12, (k) => (m.scale.x = Math.max(0.001, k)), { delay: i * 0.06, ease: ease.outCubic });
      this.fade(m, 1, 0, 0.45, 0.2 + i * 0.06);
    }
    tween(0.9, () => {}).then(() => this.kill(g));
    this.sparks(at.clone().add(V(0, 0.4, 0)), 40, 0xffd28a, 0xff4a1a, 3.5);
    this.flash(at.clone().add(V(0, 0.8, 0)), 0xff9a4a, 25, 0.35);
    this.shake(0.06, 0.25);
  }

  /** Dragon 龍 — a swirling firestorm column with embers, smoke and flickering firelight. */
  fxDragon({ at }: CaptureCtx) {
    this.sound.fx('fire');
    const c = at.clone();
    this.flatRing(at, 0xff6a1a, 3, 0.2, 1.3, 0.6);
    this.stream(1.0, 260, () => {
      const a = Math.random() * Math.PI * 2, r = rnd(0.1, 0.55);
      const hot = Math.random() < 0.25;
      this.add.emit({
        p: V(c.x + Math.cos(a) * r, TOP + rnd(0, 0.25), c.z + Math.sin(a) * r),
        v: V(0, rnd(1.4, 2.6), 0),
        life: rnd(0.4, 0.75),
        size: [rnd(0.3, 0.48), 0.06],
        color: hot ? [0xffc46a, 0xc2280a] : [0xff7a1e, 0x8a1204],
        alpha: [0.8, 0],
        tile: 1,
        swirl: { c, w: 7.5, pull: -0.7 },
        intensity: hot ? 1.3 : 1.0,
      });
    });
    this.stream(1.3, 40, () =>
      this.alpha.emit({ p: V(c.x + rnd(-0.3, 0.3), TOP + rnd(0.9, 1.4), c.z + rnd(-0.3, 0.3)), v: V(rnd(-0.1, 0.1), rnd(0.4, 0.8), rnd(-0.1, 0.1)), life: rnd(1.1, 1.6), size: [0.35, 1.0], color: [0x3a302a, 0x1a1715], alpha: [0.45, 0], tile: 2, spin: rnd(-1, 1) }),
    );
    this.stream(1.4, 50, () =>
      this.add.emit({ p: V(c.x + rnd(-0.5, 0.5), TOP + rnd(0.1, 0.8), c.z + rnd(-0.5, 0.5)), v: V(rnd(-0.4, 0.4), rnd(0.8, 2), rnd(-0.4, 0.4)), life: rnd(1, 1.8), size: [0.05, 0.02], color: [0xffc060, 0xff3a00], tile: 0, wobble: 0.6, intensity: 3 }),
    );
    this.flash(at.clone().add(V(0, 0.8, 0)), 0xff7a2a, 45, 1.3, 0.35);
    this.shake(0.05, 0.6);
  }

  /** Frog 蛙 — rings of ripples and a splash of droplets. */
  fxFrog({ at }: CaptureCtx) {
    this.sound.fx('water');
    for (let i = 0; i < 3; i++) this.flatRing(at, 0x7cc4f0, 0.75, 0.1, 1.1 + i * 0.3, 1.0, i * 0.16);
    for (let i = 0; i < this.n(36); i++) {
      const a = Math.random() * Math.PI * 2, s = rnd(0.8, 1.8);
      this.alpha.emit({ p: at.clone().add(V(0, 0.15, 0)), v: V(Math.cos(a) * s, rnd(2.2, 3.6), Math.sin(a) * s), life: rnd(0.6, 0.9), size: [0.09, 0.05], color: [0xe6f6ff, 0x9fd4ff], alpha: [0.95, 0.2], tile: 5, grav: -9, stretch: 0.05 });
    }
    for (let i = 0; i < this.n(18); i++)
      this.add.emit({ p: at.clone().add(V(rnd(-0.1, 0.1), 0.1, rnd(-0.1, 0.1))), v: V(rnd(-0.2, 0.2), rnd(1.5, 3), rnd(-0.2, 0.2)), life: rnd(0.3, 0.5), size: [0.18, 0.05], color: [0xd8f2ff, 0x5aa8e0], tile: 0, grav: -6, intensity: 1.2 });
    this.flash(at.clone().add(V(0, 0.6, 0)), 0x8ad0ff, 12, 0.5);
  }

  /** Rabbit 兎 — a pale moon flares above while speed lines rush past. */
  fxRabbit({ at, dir }: CaptureCtx) {
    this.sound.fx('whoosh');
    const moon = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.glowMat(0xfff4d6, 1.2, 0, this.softDisc));
    moon.position.copy(at).add(V(0, 1.5, 0));
    this.spawn(moon, true);
    tween(1.0, (k) => {
      const s = 0.1 + 0.24 * ease.outCubic(Math.min(1, k * 2));
      moon.scale.setScalar(s);
      moon.position.y = at.y + 1.3 + k * 0.4;
      (moon.material as THREE.MeshBasicMaterial).opacity = Math.sin(k * Math.PI) * 0.7;
    }).then(() => this.kill(moon));
    const perp = V(-dir.z, 0, dir.x);
    this.stream(0.45, 90, () => {
      const p = at.clone().addScaledVector(dir, -rnd(0.8, 2.2)).addScaledVector(perp, rnd(-0.7, 0.7)).add(V(0, rnd(0.15, 1.0), 0));
      this.add.emit({ p, v: dir.clone().multiplyScalar(rnd(6, 10)), life: rnd(0.2, 0.35), size: [0.12, 0.06], color: [0xffffff, 0xd8e4ff], tile: 4, stretch: 0.14, intensity: 1.4 });
    });
    for (let i = 0; i < this.n(14); i++)
      this.alpha.emit({ p: at.clone().add(V(0, 0.2, 0)), v: randDir().multiplyScalar(0.8).setY(rnd(0.2, 0.8)), life: rnd(0.6, 0.9), size: [0.2, 0.55], color: [0xf5f2ea, 0xe8e4da], alpha: [0.6, 0], tile: 2, drag: 2 });
  }

  /** Crab 蟹 — two translucent pincers close in from both sides and snap shut. */
  fxCrab({ at }: CaptureCtx) {
    const g = new THREE.Group();
    g.position.copy(at).add(V(0, 0.5, 0));
    this.spawn(g, true);
    const jaws: { upper: THREE.Mesh; lower: THREE.Mesh; side: THREE.Group; s: number }[] = [];
    for (const s of [-1, 1]) {
      const side = new THREE.Group();
      side.scale.set(s * 0.42, 0.42, 0.42); // mirror so each pincer faces inward
      const upper = this.crescentMesh(0x62f0d8, 1.5, 0);
      const lower = this.crescentMesh(0x62f0d8, 1.5, 0);
      lower.scale.y = -1;
      side.add(upper, lower);
      g.add(side);
      jaws.push({ upper, lower, side, s });
    }
    this.sound.fx('whoosh');
    tween(0.35, (k) => {
      for (const j of jaws) {
        j.side.position.x = -j.s * (1.5 - 0.95 * k);
        j.upper.rotation.z = 0.7;
        j.lower.rotation.z = -0.7;
        (j.upper.material as THREE.MeshBasicMaterial).opacity = 0.65 * k;
        (j.lower.material as THREE.MeshBasicMaterial).opacity = 0.65 * k;
      }
    }, { ease: ease.outCubic })
      .then(() =>
        tween(0.09, (k) => {
          for (const j of jaws) {
            j.upper.rotation.z = 0.7 * (1 - k) + 0.02;
            j.lower.rotation.z = -0.7 * (1 - k) - 0.02;
          }
        }, { ease: ease.inCubic }),
      )
      .then(() => {
        this.sound.fx('snap');
        this.sparks(at.clone().add(V(0, 0.5, 0)), 26, 0xb8fff0, 0x2ab8a8, 2.8, 0.45);
        this.flash(at.clone().add(V(0, 0.6, 0)), 0x6ff5de, 18, 0.35);
        this.shake(0.05, 0.2);
        return this.fade(g, 0.65, 0, 0.4, 0.15);
      })
      .then(() => this.kill(g));
    for (let i = 0; i < this.n(22); i++)
      this.add.emit({ p: at.clone().add(V(rnd(-0.5, 0.5), rnd(0.05, 0.3), rnd(-0.5, 0.5))), v: V(0, rnd(0.4, 0.9), 0), life: rnd(0.9, 1.5), size: [0.07, 0.11], color: [0xbff8ff, 0x7fd8e8], alpha: [0.8, 0], tile: 7, wobble: 0.5, intensity: 1.1 });
  }

  /** Elephant 象 — a ground-shaking stomp: shockwave, dust dome and flying stone chips. */
  fxElephant({ at }: CaptureCtx) {
    this.sound.fx('boom');
    this.shake(0.2, 0.55);
    this.flatRing(at, 0xffd49a, 2.4, 0.3, 2.2, 0.8);
    this.flatRing(at, 0xffe8c8, 1.6, 0.15, 1.3, 0.6, 0.1);
    for (let i = 0; i < this.n(40); i++) {
      const a = Math.random() * Math.PI * 2, s = rnd(0.6, 1.6);
      this.alpha.emit({ p: at.clone().add(V(Math.cos(a) * 0.3, 0.1, Math.sin(a) * 0.3)), v: V(Math.cos(a) * s, rnd(0.3, 1.0), Math.sin(a) * s), life: rnd(1, 1.5), size: [0.3, 0.95], color: [0xcdb996, 0xa89478], alpha: [0.55, 0], tile: 2, drag: 1.8, spin: rnd(-1, 1) });
    }
    for (let i = 0; i < this.n(24); i++) {
      const a = Math.random() * Math.PI * 2, s = rnd(1, 2.2);
      this.alpha.emit({ p: at.clone().add(V(0, 0.15, 0)), v: V(Math.cos(a) * s, rnd(2.5, 4), Math.sin(a) * s), life: rnd(0.6, 0.9), size: [0.07, 0.06], color: [0x3b3a38, 0x2a2927], alpha: [1, 1], tile: 5, grav: -12, spin: rnd(-8, 8) });
    }
    this.flash(at.clone().add(V(0, 0.5, 0)), 0xffd9a0, 14, 0.4);
  }

  /** Goose 雁 — sweeping wings of light and a burst of drifting feathers. */
  fxGoose({ at }: CaptureCtx) {
    this.sound.fx('whoosh');
    this.sound.fx('shimmer');
    const g = new THREE.Group();
    g.position.copy(at).add(V(0, 0.55, 0));
    this.spawn(g, true);
    for (const s of [-1, 1]) {
      const w = this.crescentMesh(0xfffaf0, 0.8, 0.38);
      const pivot = new THREE.Group();
      pivot.scale.set(s * 0.75, 0.75, 0.75);
      pivot.add(w);
      g.add(pivot);
      tween(0.6, (k) => (w.rotation.z = -1.1 + 1.5 * ease.outCubic(k)));
    }
    this.fade(g, 0.38, 0, 0.35, 0.35).then(() => this.kill(g));
    for (let i = 0; i < this.n(42); i++) {
      const d = randDir();
      d.y = Math.abs(d.y);
      this.alpha.emit({ p: at.clone().add(V(0, 0.5, 0)), v: d.multiplyScalar(rnd(1, 2.2)), life: rnd(1.6, 2.6), size: [0.2, 0.16], color: [0xffffff, 0xeeeae2], alpha: [1, 0], tile: 3, drag: 2.4, grav: -0.5, spin: rnd(-3, 3), wobble: 0.8 });
    }
  }

  /** Rooster 鶏 — a dawn sunburst of golden rays. */
  fxRooster({ at }: CaptureCtx) {
    this.sound.fx('shimmer');
    const rays = new THREE.Mesh(new THREE.PlaneGeometry(3, 3), this.glowMat(0xffc75a, 1.5, 0, this.raysTex));
    rays.position.copy(at).add(V(0, 0.7, 0));
    const holder = new THREE.Group();
    holder.position.copy(rays.position);
    rays.position.set(0, 0, 0);
    holder.add(rays);
    this.spawn(holder, true);
    tween(0.85, (k) => {
      rays.scale.setScalar(0.15 + 0.55 * ease.outCubic(k));
      rays.rotation.z = k * 0.5;
      (rays.material as THREE.MeshBasicMaterial).opacity = Math.sin(Math.min(1, k * 1.3) * Math.PI) * 0.85;
    }).then(() => this.kill(holder));
    for (let i = 0; i < this.n(18); i++)
      this.add.emit({ p: at.clone().add(V(0, 0.6, 0)), v: randDir().multiplyScalar(rnd(1, 2)), life: rnd(0.6, 1), size: [0.16, 0.04], color: [0xfff0b0, 0xffa020], tile: 6, drag: 2, spin: rnd(-2, 2), intensity: 2.2 });
    this.flash(at.clone().add(V(0, 1, 0)), 0xffc060, 30, 0.6);
  }

  /** Monkey 猿 — a trickster's spinning staff, a puff of smoke and orbiting stars. */
  fxMonkey({ at }: CaptureCtx) {
    this.sound.fx('whoosh');
    const c = at.clone().add(V(0, 0.75, 0));
    const staffGeo = new THREE.CylinderGeometry(0.03, 0.03, 1.7, 8);
    staffGeo.rotateZ(Math.PI / 2);
    const copies: THREE.Mesh[] = [];
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(staffGeo, this.glowMat(0xffc85a, 2.2, i === 0 ? 0.9 : 0.35 / i));
      m.position.copy(c);
      this.spawn(m);
      copies.push(m);
    }
    tween(0.85, (k, raw) => {
      const s = Math.sin(raw * Math.PI);
      copies.forEach((m, i) => {
        m.rotation.y = raw * 20 - i * 0.28;
        m.scale.setScalar(Math.max(0.01, s));
      });
    }, { ease: ease.linear }).then(() => copies.forEach((m) => this.kill(m)));
    for (let i = 0; i < this.n(26); i++)
      this.alpha.emit({ p: at.clone().add(V(0, 0.35, 0)), v: randDir().multiplyScalar(rnd(0.8, 1.6)), life: rnd(0.6, 1), size: [0.25, 0.7], color: [0xe8e2d6, 0xcfc8ba], alpha: [0.75, 0], tile: 2, drag: 3.5, spin: rnd(-2, 2) });
    for (let i = 0; i < this.n(12); i++) {
      const a = (i / 12) * Math.PI * 2;
      this.add.emit({ p: V(c.x + Math.cos(a) * 0.55, c.y + rnd(-0.1, 0.1), c.z + Math.sin(a) * 0.55), life: rnd(0.8, 1.1), size: [0.18, 0.05], color: [0xfff3b8, 0xffb020], tile: 6, swirl: { c, w: 6, pull: 0.4 }, spin: 3, intensity: 2.2 });
    }
    this.sound.fx('shimmer');
  }

  /** Mantis 螳 — two jade scythe-blades slash across in an X. */
  fxMantis({ at }: CaptureCtx) {
    this.sound.fx('slash');
    const g = new THREE.Group();
    g.position.copy(at).add(V(0, 0.55, 0));
    this.spawn(g, true);
    [-1, 1].forEach((s, idx) => {
      for (let trail = 0; trail < 3; trail++) {
        const b = this.crescentMesh(0x5ad87a, 0.55, trail === 0 ? 0.6 : 0.18 / trail);
        const p = new THREE.Group();
        p.scale.set(s * 0.8, 0.8, 0.8);
        p.add(b);
        b.position.set(-1, -0.2, 0);
        g.add(p);
        tween(0.28, (k) => (p.rotation.z = s * (1.4 - 2.6 * k) + trail * 0.12 * s), { delay: idx * 0.07 + trail * 0.02, ease: ease.outCubic });
      }
    });
    this.fade(g, 0.6, 0, 0.35, 0.3).then(() => this.kill(g));
    tween(0.1, () => {}).then(() => this.sparks(at.clone().add(V(0, 0.5, 0)), 30, 0xd4ffcf, 0x2fbf5a, 3));
  }

  /** Horse 馬 — glowing hoofprints gallop in, then a hoof-strike shockwave. */
  fxHorse({ at, dir }: CaptureCtx) {
    const perp = V(-dir.z, 0, dir.x);
    const shoeGeo = new THREE.RingGeometry(0.07, 0.11, 20, 1, Math.PI * 0.15, Math.PI * 1.7);
    shoeGeo.rotateX(-Math.PI / 2);
    for (let i = 3; i >= 0; i--) {
      const delay = (3 - i) * 0.07;
      const p = at.clone().addScaledVector(dir, -0.28 * (i + 1)).addScaledVector(perp, (i % 2 ? 1 : -1) * 0.12);
      p.y = TOP + 0.012;
      const m = new THREE.Mesh(shoeGeo, this.glowMat(0xffd7a0, 2, 0));
      m.position.copy(p);
      m.rotation.y = Math.atan2(dir.x, dir.z) + Math.PI;
      this.spawn(m);
      tween(0.06, () => {}, { delay }).then(() => {
        this.sound.fx('hoof');
        (m.material as THREE.MeshBasicMaterial).opacity = 0.9;
        for (let k = 0; k < this.n(5); k++)
          this.alpha.emit({ p: p.clone().add(V(0, 0.05, 0)), v: V(rnd(-0.3, 0.3), rnd(0.2, 0.5), rnd(-0.3, 0.3)), life: 0.7, size: [0.12, 0.35], color: [0xcdb996, 0xb8a484], alpha: [0.5, 0], tile: 2, drag: 2 });
        this.fade(m, 0.9, 0, 1.1, 0.2).then(() => this.kill(m));
      });
    }
    tween(0.3, () => {}).then(() => {
      this.sound.fx('boom');
      this.flatRing(at, 0xffd7a0, 1.6, 0.2, 1.4, 0.55);
      this.shake(0.08, 0.3);
      for (let i = 0; i < this.n(20); i++) {
        const a = Math.random() * Math.PI * 2;
        this.alpha.emit({ p: at.clone().add(V(0, 0.1, 0)), v: V(Math.cos(a) * 1.2, rnd(0.3, 0.8), Math.sin(a) * 1.2), life: rnd(0.8, 1.2), size: [0.25, 0.7], color: [0xcdb996, 0xa89478], alpha: [0.5, 0], tile: 2, drag: 2 });
      }
    });
  }

  /** Ox 牛 — spectral horns heave upward and the slate cracks beneath the blow. */
  fxOx({ at }: CaptureCtx) {
    this.sound.fx('boom');
    const g = new THREE.Group();
    g.position.copy(at).add(V(0, 0.2, 0));
    this.spawn(g, true);
    for (const s of [-1, 1]) {
      const h = this.crescentMesh(0xfff0d8, 1.4, 0.7);
      const p = new THREE.Group();
      p.scale.set(s * 0.55, 0.55, 0.55);
      p.position.x = s * 0.12;
      p.add(h);
      g.add(p);
      tween(0.35, (k) => {
        p.rotation.z = s * (-1.2 + 1.3 * ease.outBack(k));
        p.position.y = 0.45 * k;
      });
    }
    this.fade(g, 0.7, 0, 0.35, 0.35).then(() => this.kill(g));
    const geo = new THREE.PlaneGeometry(2, 2);
    geo.rotateX(-Math.PI / 2);
    const crack = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: this.crackTex, transparent: true, opacity: 0, depthWrite: false }));
    crack.position.copy(at).setY(TOP + 0.004);
    crack.rotation.y = Math.random() * Math.PI;
    crack.renderOrder = 3;
    this.spawn(crack);
    tween(0.18, (k) => {
      crack.scale.setScalar(0.2 + 0.4 * k);
      (crack.material as THREE.MeshBasicMaterial).opacity = 0.85 * k;
    }, { delay: 0.25 }).then(() => this.fade(crack, 0.85, 0, 2.4, 0.6)).then(() => this.kill(crack));
    tween(0.25, () => {}).then(() => {
      this.shake(0.12, 0.35);
      for (let i = 0; i < this.n(16); i++) {
        const a = Math.random() * Math.PI * 2;
        this.alpha.emit({ p: at.clone().add(V(0, 0.1, 0)), v: V(Math.cos(a) * 1.8, rnd(1.5, 3), Math.sin(a) * 1.8), life: 0.7, size: [0.06, 0.05], color: [0x3a3f45, 0x2a2e33], alpha: [1, 1], tile: 5, grav: -11, spin: rnd(-8, 8) });
      }
    });
  }

  /** Crane 鶴 — a serene halo, feathers spiralling skyward and a red sun (the crane's crown). */
  fxCrane({ at }: CaptureCtx) {
    this.sound.fx('shimmer');
    this.flatRing(at, 0xffffff, 1.4, 0.2, 1.7, 1.2);
    const c = at.clone();
    this.stream(0.7, 45, () =>
      this.alpha.emit({ p: V(c.x + rnd(-0.4, 0.4), TOP + 0.2, c.z + rnd(-0.4, 0.4)), v: V(0, rnd(0.9, 1.5), 0), life: rnd(1.4, 2), size: [0.17, 0.12], color: [0xffffff, 0xf2eee6], alpha: [1, 0], tile: 3, swirl: { c, w: 3.2, pull: 0.25 }, spin: rnd(-2, 2) }),
    );
    const sun = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.glowMat(0xe8402a, 1.3, 0, this.softDisc));
    sun.position.copy(at).add(V(0, 0.75, 0));
    this.spawn(sun, true);
    tween(1.3, (k) => {
      sun.scale.setScalar(0.04 + 0.13 * ease.outCubic(Math.min(1, k * 2)));
      sun.position.y = at.y + 0.75 + k * 0.5;
      (sun.material as THREE.MeshBasicMaterial).opacity = Math.sin(k * Math.PI) * 0.9;
    }).then(() => this.kill(sun));
    this.flash(at.clone().add(V(0, 0.8, 0)), 0xfff2e0, 12, 0.8);
  }

  /** Boar 猪 — spectral tusks thrust forward and a wedge of dust and rock bursts ahead. */
  fxBoar({ at, dir }: CaptureCtx) {
    this.sound.fx('boom');
    this.sound.fx('whoosh');
    this.shake(0.1, 0.3);
    const perp = V(-dir.z, 0, dir.x);
    const yaw = Math.atan2(dir.x, dir.z);
    for (const s of [-1, 1]) {
      const t = this.crescentMesh(0xfff2dc, 1.6, 0.85);
      t.rotation.x = -Math.PI / 2;
      const holder = new THREE.Group();
      holder.rotation.y = yaw - Math.PI / 2;
      holder.scale.set(0.62, 0.62, s * 0.62);
      holder.add(t);
      holder.position.copy(at).addScaledVector(perp, s * 0.14).setY(TOP + 0.3);
      this.spawn(holder);
      const start = holder.position.clone().addScaledVector(dir, -0.7);
      const end = holder.position.clone().addScaledVector(dir, 0.3);
      tween(0.25, (k) => holder.position.lerpVectors(start, end, k), { ease: ease.outCubic });
      this.fade(holder, 0.75, 0, 0.3, 0.25).then(() => this.kill(holder));
    }
    this.flatRing(at, 0xffd49a, 1.4, 0.2, 1.3, 0.5);
    for (let i = 0; i < this.n(55); i++) {
      const v = dir.clone().multiplyScalar(rnd(1.5, 3.2)).addScaledVector(perp, rnd(-1, 1)).add(V(0, rnd(0.2, 1), 0));
      this.alpha.emit({ p: at.clone().add(V(0, 0.1, 0)), v, life: rnd(0.8, 1.2), size: [0.25, 0.8], color: [0xcdb996, 0xa89478], alpha: [0.55, 0], tile: 2, drag: 2.2, spin: rnd(-1, 1) });
    }
    for (let i = 0; i < this.n(18); i++) {
      const v = dir.clone().multiplyScalar(rnd(2, 3.5)).addScaledVector(perp, rnd(-1.2, 1.2)).add(V(0, rnd(1.5, 3), 0));
      this.alpha.emit({ p: at.clone().add(V(0, 0.15, 0)), v, life: 0.8, size: [0.07, 0.06], color: [0x3b3a38, 0x2a2927], alpha: [1, 1], tile: 5, grav: -11, spin: rnd(-8, 8) });
    }
  }

  /** Eel 鰻 — crackling blue lightning arcs around the target. */
  fxEel({ at }: CaptureCtx) {
    this.sound.fx('zap');
    const mat = new THREE.LineBasicMaterial({ color: new THREE.Color(0x9fd8ff).multiplyScalar(4), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    const bolts: THREE.Line[] = [];
    for (let i = 0; i < 5; i++) {
      const l = new THREE.Line(new THREE.BufferGeometry(), mat.clone());
      this.spawn(l);
      bolts.push(l);
    }
    const target = at.clone().add(V(0, 0.35, 0));
    let acc = 1;
    const rebuild = () => {
      for (const l of bolts) {
        const a = Math.random() * Math.PI * 2, r = rnd(0.6, 1.1);
        const start = V(at.x + Math.cos(a) * r, TOP + rnd(0.3, 1.4), at.z + Math.sin(a) * r);
        const pts: THREE.Vector3[] = [];
        const segs = 9;
        for (let s = 0; s <= segs; s++) {
          const p = start.clone().lerp(target, s / segs);
          if (s > 0 && s < segs) p.add(randDir().multiplyScalar(0.12));
          pts.push(p);
          if (Math.random() < 0.4) this.add.emit({ p, life: 0.09, size: [0.14, 0.1], color: [0xbfe8ff, 0x5aa8ff], tile: 0, intensity: 2.5 });
        }
        l.geometry.dispose();
        l.geometry = new THREE.BufferGeometry().setFromPoints(pts);
      }
    };
    this.run((dt) => {
      acc += dt;
      if (acc > 0.05) {
        acc = 0;
        rebuild();
      }
    }, 0.65).then(() => bolts.forEach((b) => this.kill(b)));
    this.sparks(target, 30, 0xd8f0ff, 0x3a8aff, 3.2, 0.45);
    this.flash(target.clone().add(V(0, 0.4, 0)), 0x8ac8ff, 40, 0.7, 0.8);
    this.shake(0.05, 0.4);
  }

  /** Cobra 蛇 — a spectral serpent coils up around the target and strikes, leaving venom mist. */
  fxCobra({ at }: CaptureCtx) {
    this.sound.fx('hiss');
    const pts: THREE.Vector3[] = [];
    const turns = 2.2, N = 60;
    for (let i = 0; i <= N; i++) {
      const k = i / N;
      const a = k * turns * Math.PI * 2;
      const r = 0.55 - 0.35 * k;
      pts.push(V(at.x + Math.cos(a) * r, TOP + 0.05 + k * 1.1, at.z + Math.sin(a) * r));
    }
    // head rears back then strikes down at the target
    pts.push(V(at.x + 0.1, TOP + 1.35, at.z + 0.1), V(at.x, TOP + 0.45, at.z));
    const curve = new THREE.CatmullRomCurve3(pts);
    const geo = new THREE.TubeGeometry(curve, 160, 0.055, 8, false);
    const mesh = new THREE.Mesh(geo, this.glowMat(0x6ee85a, 0.9, 0.55));
    this.spawn(mesh);
    const count = geo.index!.count;
    geo.setDrawRange(0, 0);
    tween(0.55, (k) => geo.setDrawRange(0, Math.floor((count * k) / 6) * 6), { ease: ease.inOutSine })
      .then(() => {
        this.sound.fx('snap');
        this.sparks(at.clone().add(V(0, 0.4, 0)), 20, 0xd8ffc0, 0x3aa82a, 2.4);
        this.flash(at.clone().add(V(0, 0.6, 0)), 0x7dff6a, 6, 0.35);
        return this.fade(mesh, 0.55, 0, 0.45);
      })
      .then(() => this.kill(mesh));
    tween(0.5, () => {}).then(() => {
      for (let i = 0; i < this.n(26); i++)
        this.alpha.emit({ p: at.clone().add(V(rnd(-0.4, 0.4), rnd(0.05, 0.3), rnd(-0.4, 0.4))), v: V(rnd(-0.3, 0.3), rnd(0.1, 0.4), rnd(-0.3, 0.3)), life: rnd(1.2, 1.8), size: [0.3, 0.9], color: [0x5f9a3a, 0x2f5a20], alpha: [0.45, 0], tile: 2, drag: 1.5, spin: rnd(-1, 1) });
      for (let i = 0; i < this.n(14); i++)
        this.add.emit({ p: at.clone().add(V(0, 0.45, 0)), v: randDir().multiplyScalar(rnd(1, 2)).setY(rnd(0.5, 1.8)), life: 0.6, size: [0.07, 0.04], color: [0xb8ff8a, 0x3aa82a], tile: 5, grav: -8, stretch: 0.04, intensity: 1.8 });
    });
  }
}

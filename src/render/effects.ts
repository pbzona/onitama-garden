import * as THREE from 'three';
import { mapleLeafTexture, softDotTexture } from './textures.ts';

const dot = softDotTexture();

// ---------------------------------------------------------------- dust puffs

interface Puff {
  sprite: THREE.Sprite;
  vel: THREE.Vector3;
  life: number;
  max: number;
  grow: number;
}

export class Dust {
  group = new THREE.Group();
  private pool: Puff[] = [];
  private active: Puff[] = [];

  burst(at: THREE.Vector3, count = 14, color = 0xd9ccb0, power = 1) {
    for (let i = 0; i < count; i++) {
      let p = this.pool.pop();
      if (!p) {
        const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: dot, transparent: true, depthWrite: false, color }));
        this.group.add(s);
        p = { sprite: s, vel: new THREE.Vector3(), life: 0, max: 1, grow: 1 };
      }
      const a = Math.random() * Math.PI * 2;
      const sp = (0.4 + Math.random() * 0.9) * power;
      p.vel.set(Math.cos(a) * sp, 0.15 + Math.random() * 0.45 * power, Math.sin(a) * sp);
      p.sprite.position.copy(at).add(new THREE.Vector3(Math.cos(a) * 0.2, 0.03, Math.sin(a) * 0.2));
      (p.sprite.material as THREE.SpriteMaterial).color.set(color);
      p.life = 0;
      p.max = 0.7 + Math.random() * 0.6;
      p.grow = 0.18 + Math.random() * 0.2;
      p.sprite.visible = true;
      this.active.push(p);
    }
  }

  update(dt: number) {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const p = this.active[i];
      p.life += dt;
      const k = p.life / p.max;
      if (k >= 1) {
        p.sprite.visible = false;
        this.active.splice(i, 1);
        this.pool.push(p);
        continue;
      }
      p.vel.multiplyScalar(Math.exp(-dt * 3.5));
      p.vel.y -= dt * 0.15;
      p.sprite.position.addScaledVector(p.vel, dt);
      const s = p.grow * (0.4 + k * 1.4);
      p.sprite.scale.set(s, s, s);
      (p.sprite.material as THREE.SpriteMaterial).opacity = 0.55 * (1 - k) * Math.min(1, k * 8);
    }
  }
}

// ---------------------------------------------------------------- falling maple leaves

interface Leaf {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  rot: THREE.Euler;
  spin: THREE.Vector3;
  phase: number;
  resting: number;
  scale: number;
}

export class FallingLeaves {
  mesh: THREE.InstancedMesh;
  private leaves: Leaf[] = [];
  private tmp = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private burstLeft = 0;
  constructor(private sources: THREE.Vector3[], count = 90) {
    const mat = new THREE.MeshStandardMaterial({ alphaMap: mapleLeafTexture(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.8, emissive: 0x2a0500 });
    this.mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.2, 0.2), mat, count);
    this.mesh.castShadow = false; // tiny, and it would force a shadow-map re-render every frame
    this.mesh.frustumCulled = false;
    const palette = [0xb3261e, 0xd9481f, 0xe0662a, 0x9e1b1b, 0xe8883a].map((c) => new THREE.Color(c));
    for (let i = 0; i < count; i++) {
      const l: Leaf = {
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        rot: new THREE.Euler(),
        spin: new THREE.Vector3(),
        phase: Math.random() * 10,
        resting: 0,
        scale: 0.9 + Math.random() * 0.5,
      };
      this.spawn(l, true);
      this.leaves.push(l);
      this.mesh.setColorAt(i, palette[i % palette.length]);
    }
  }

  private spawn(l: Leaf, initial = false, wide = false) {
    if (wide) {
      l.pos.set((Math.random() - 0.5) * 12, 5 + Math.random() * 4, (Math.random() - 0.5) * 9);
    } else {
      const s = this.sources[Math.floor(Math.random() * this.sources.length)];
      l.pos.set(s.x + (Math.random() - 0.5) * 1.5, s.y + (Math.random() - 0.3) * 0.8, s.z + (Math.random() - 0.5) * 1.5);
      if (initial) l.pos.y = Math.random() * (s.y + 1);
    }
    l.vel.set(0.25 + Math.random() * 0.35, -(0.22 + Math.random() * 0.2), 0.12 + Math.random() * 0.25);
    l.rot.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    l.spin.set((Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3);
    l.resting = 0;
  }

  /** Victory flourish: release many leaves across the whole garden. */
  burst(n = 70) {
    this.burstLeft = n;
  }

  update(dt: number, t: number) {
    for (let i = 0; i < this.leaves.length; i++) {
      const l = this.leaves[i];
      if (this.burstLeft > 0 && (l.resting > 0 || Math.random() < 0.02)) {
        this.spawn(l, false, true);
        this.burstLeft--;
      }
      if (l.resting > 0) {
        l.resting -= dt;
        if (l.resting <= 0) this.spawn(l);
      } else {
        const sway = Math.sin(t * 1.7 + l.phase) * 0.6;
        l.pos.x += (l.vel.x + sway * 0.4) * dt;
        l.pos.y += l.vel.y * dt * (1 + 0.5 * Math.sin(t * 3 + l.phase));
        l.pos.z += (l.vel.z + Math.cos(t * 1.3 + l.phase) * 0.2) * dt;
        l.rot.x += l.spin.x * dt;
        l.rot.y += l.spin.y * dt;
        l.rot.z += l.spin.z * dt;
        const ground = Math.abs(l.pos.x) < 2.9 && Math.abs(l.pos.z) < 2.9 ? 0.39 : 0.01;
        if (l.pos.y <= ground) {
          l.pos.y = ground;
          l.rot.set(-Math.PI / 2 + (Math.random() - 0.5) * 0.3, 0, Math.random() * 6);
          l.resting = 6 + Math.random() * 10;
        }
      }
      this.q.setFromEuler(l.rot);
      this.tmp.compose(l.pos, this.q, new THREE.Vector3(l.scale, l.scale, l.scale));
      this.mesh.setMatrixAt(i, this.tmp);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

// ---------------------------------------------------------------- fireflies

export class Fireflies {
  points: THREE.Points;
  private base: Float32Array;
  private phase: Float32Array;
  constructor(count = 40) {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    this.base = new Float32Array(count * 3);
    this.phase = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      // keep them around the garden edges, away from the board
      const a = Math.random() * Math.PI * 2;
      const r = 6 + Math.random() * 6;
      this.base[i * 3] = Math.cos(a) * r;
      this.base[i * 3 + 1] = 0.4 + Math.random() * 2.2;
      this.base[i * 3 + 2] = Math.sin(a) * r * 0.8 - 2;
      this.phase[i] = Math.random() * 100;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const alpha = new Float32Array(count);
    geo.setAttribute('alpha', new THREE.BufferAttribute(alpha, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uTex: { value: dot }, uScale: { value: 1 } },
      vertexShader: /* glsl */ `
        attribute float alpha; varying float vA; uniform float uScale;
        void main(){ vA = alpha; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * mv; gl_PointSize = uScale * 90.0 / -mv.z; }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uTex; varying float vA;
        void main(){ vec4 t = texture2D(uTex, gl_PointCoord); gl_FragColor = vec4(vec3(1.0,0.82,0.42) * 3.0, t.a * vA); }`,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
  }
  setPixelScale(s: number) {
    (this.points.material as THREE.ShaderMaterial).uniforms.uScale.value = s;
  }
  update(t: number) {
    const pos = this.points.geometry.attributes.position as THREE.BufferAttribute;
    const al = this.points.geometry.attributes.alpha as THREE.BufferAttribute;
    for (let i = 0; i < al.count; i++) {
      const p = this.phase[i];
      pos.setXYZ(
        i,
        this.base[i * 3] + Math.sin(t * 0.3 + p) * 0.8,
        this.base[i * 3 + 1] + Math.sin(t * 0.5 + p * 1.3) * 0.3,
        this.base[i * 3 + 2] + Math.cos(t * 0.27 + p) * 0.8,
      );
      const blink = Math.max(0, Math.sin(t * 0.9 + p * 2.1));
      al.setX(i, Math.pow(blink, 3));
    }
    pos.needsUpdate = true;
    al.needsUpdate = true;
  }
}

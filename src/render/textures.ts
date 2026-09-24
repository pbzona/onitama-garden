import * as THREE from 'three';

export function canvas(w: number, h = w) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!] as const;
}

export function tex(c: HTMLCanvasElement, srgb = true, repeat = false) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.needsUpdate = true;
  return t;
}

/** Torii gate silhouette centred at (0,0) spanning roughly [-1,1] × [-1,1], upright = −y. */
export function drawTorii(g: CanvasRenderingContext2D, s: number) {
  g.save();
  g.scale(s, s);
  g.beginPath();
  // kasagi (top lintel) with upswept ends
  g.moveTo(-1.0, -0.78);
  g.quadraticCurveTo(0, -0.62, 1.0, -0.78);
  g.lineTo(0.94, -0.6);
  g.quadraticCurveTo(0, -0.5, -0.94, -0.6);
  g.closePath();
  // shimaki under the lintel
  g.rect(-0.82, -0.56, 1.64, 0.1);
  // gakuzuka (centre strut)
  g.rect(-0.07, -0.46, 0.14, 0.2);
  // nuki (tie beam)
  g.rect(-0.86, -0.28, 1.72, 0.11);
  // posts, slightly leaning inward
  g.moveTo(-0.62, -0.46);
  g.lineTo(-0.5, -0.46);
  g.lineTo(-0.44, 0.9);
  g.lineTo(-0.6, 0.9);
  g.closePath();
  g.moveTo(0.5, -0.46);
  g.lineTo(0.62, -0.46);
  g.lineTo(0.6, 0.9);
  g.lineTo(0.44, 0.9);
  g.closePath();
  g.fill();
  // kamebara (post bases)
  g.fillRect(-0.68, 0.84, 0.32, 0.1);
  g.fillRect(0.36, 0.84, 0.32, 0.1);
  g.restore();
}

/** R = engraved groove, G = gold inlay. Covers the whole top of the slab (`size` world units). */
export function boardEngraveTexture(size: number, cell: number) {
  const N = 2048;
  const [c, g] = canvas(N);
  g.fillStyle = '#000';
  g.fillRect(0, 0, N, N);
  const px = N / size;
  const o = (size / 2 - 2.5 * cell) * px; // grid origin in px
  const cs = cell * px;
  g.filter = 'blur(4px)';
  g.strokeStyle = 'rgb(255,0,0)';
  g.lineCap = 'round';
  g.lineWidth = 12;
  for (let i = 0; i <= 5; i++) {
    g.beginPath();
    g.moveTo(o + i * cs, o);
    g.lineTo(o + i * cs, o + 5 * cs);
    g.stroke();
    g.beginPath();
    g.moveTo(o, o + i * cs);
    g.lineTo(o + 5 * cs, o + i * cs);
    g.stroke();
  }
  // outer border
  g.lineWidth = 9;
  const m = cs * 0.14;
  g.strokeRect(o - m, o - m, 5 * cs + 2 * m, 5 * cs + 2 * m);
  // small star points at inner intersections (like a go board)
  g.fillStyle = 'rgb(255,0,0)';
  for (const [ix, iy] of [
    [1, 1], [4, 1], [1, 4], [4, 4],
  ]) {
    g.beginPath();
    g.arc(o + ix * cs, o + iy * cs, 9, 0, Math.PI * 2);
    g.fill();
  }
  // temple torii in gold inlay (G). Row 4 is at the top of the canvas (far side).
  g.filter = 'blur(1.2px)';
  g.globalCompositeOperation = 'lighter';
  g.fillStyle = 'rgb(0,255,0)';
  const temples: [number, number, number][] = [
    [2, 0, 0], // player 0 temple, near side (bottom of canvas), upright for player 0
    [2, 4, Math.PI], // player 1 temple, rotated to face them
  ];
  for (const [x, y, rot] of temples) {
    g.save();
    g.translate(o + (x + 0.5) * cs, o + (4 - y + 0.5) * cs);
    g.rotate(rot);
    drawTorii(g, cs * 0.3);
    g.restore();
    // thin gold ring around the temple square
    g.save();
    g.strokeStyle = 'rgb(0,255,0)';
    g.lineWidth = 4;
    g.translate(o + (x + 0.5) * cs, o + (4 - y + 0.5) * cs);
    g.beginPath();
    g.arc(0, 0, cs * 0.43, 0, Math.PI * 2);
    g.stroke();
    g.restore();
  }
  g.globalCompositeOperation = 'source-over';
  g.filter = 'none';
  const t = tex(c, false);
  t.generateMipmaps = true;
  return t;
}

/** Japanese maple leaf alpha mask (white leaf on transparent). */
export function mapleLeafTexture() {
  const N = 128;
  const [c, g] = canvas(N);
  g.translate(N / 2, N * 0.56);
  g.fillStyle = '#fff';
  g.beginPath();
  const lobes = 7;
  const spread = Math.PI * 1.35;
  for (let i = 0; i <= lobes * 2; i++) {
    const t = i / (lobes * 2);
    const a = -Math.PI / 2 - spread / 2 + t * spread;
    const lobeIdx = Math.abs(i / 2 - lobes / 2) / (lobes / 2);
    const r = i % 2 === 0 ? N * 0.46 * (1 - lobeIdx * 0.45) : N * 0.14;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.closePath();
  g.fill();
  // stem
  g.fillRect(-2, 0, 4, N * 0.36);
  const t = tex(c, true);
  return t;
}

export function softDotTexture() {
  const N = 64;
  const [c, g] = canvas(N);
  const gr = g.createRadialGradient(N / 2, N / 2, 0, N / 2, N / 2, N / 2);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, N, N);
  return tex(c, true);
}

/** Ring used for legal-move markers: brush-like ensō circle. */
export function ensoTexture() {
  const N = 256;
  const [c, g] = canvas(N);
  g.translate(N / 2, N / 2);
  g.lineCap = 'round';
  for (let k = 0; k < 90; k++) {
    const a0 = -2.2 + (k / 90) * 5.6;
    const w = 14 * Math.sin((k / 90) * Math.PI) + 4;
    g.strokeStyle = `rgba(255,255,255,${0.12 + 0.5 * Math.sin((k / 90) * Math.PI)})`;
    g.lineWidth = w;
    g.beginPath();
    g.arc(0, 0, N * 0.36 + Math.sin(k * 0.7) * 1.5, a0, a0 + 0.09);
    g.stroke();
  }
  return tex(c, true);
}

/** Soft-edged square wash used for last-move highlights. */
export function softSquareTexture() {
  const N = 128;
  const [c, g] = canvas(N);
  g.filter = 'blur(10px)';
  g.fillStyle = '#fff';
  g.fillRect(22, 22, N - 44, N - 44);
  return tex(c, true);
}

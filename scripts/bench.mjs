// GPU-cost proxy: swiftshader renders on the CPU, so synchronous render+finish time ~ fragment/vertex work.
import { chromium } from 'playwright';
const Q = process.env.Q || 'high';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-dev-shm-usage'] });
const page = await browser.newPage({ viewport: { width: 960, height: 600 }, deviceScaleFactor: 2 });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
page.setDefaultTimeout(900000);
await page.addInitScript((q) => { localStorage.setItem('onitama.quality', q); localStorage.setItem('onitama.muted', '1'); }, Q);
await page.goto('http://localhost:4173/?dt=0.016');
await page.waitForFunction(() => window.__onitama, null, { polling: 2000, timeout: 900000 });
const r = await page.evaluate(async () => {
  const o = window.__onitama, st = o.stage;
  document.getElementById('menu').classList.add('hidden');
  st.controls.autoRotate = false;
  st.camera.position.set(0, 10.2, 11); st.controls.target.set(0, 0.2, 0.2); st.camera.lookAt(0, 0.2, 0.2);
  window.__benchPause = true; // stop the app loop from rendering concurrently (if supported)
  const gl = st.renderer.getContext();
  const px = new Uint8Array(4); const sync = () => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); const time = (n) => { st.render(0); sync(); const t0 = performance.now(); for (let i = 0; i < n; i++) { st.render(i * 0.016); sync(); } return +((performance.now() - t0) / n).toFixed(1); };
  const out = { dpr: st.renderer.getPixelRatio(), size: st.renderer.domElement.width + 'x' + st.renderer.domElement.height };
  out.full = time(4);
  const scene = st.scene;
  const find = (pred) => scene.children.filter(pred);
  const sand = find((c) => c.isMesh && c.geometry?.parameters?.width >= 29);
  sand.forEach((m) => (m.visible = false)); out.noSand = time(4); sand.forEach((m) => (m.visible = true));
  const big = find((c) => c.isGroup && c.children.length > 30);
  big.forEach((g) => (g.visible = false)); out.noGarden = time(4); big.forEach((g) => (g.visible = true));
  const sh = st.renderer.shadowMap.enabled; st.renderer.shadowMap.enabled = false; scene.traverse((m) => m.material && (m.material.needsUpdate = true)); time(1); out.noShadows = time(4); st.renderer.shadowMap.enabled = sh; scene.traverse((m) => m.material && (m.material.needsUpdate = true)); time(1);
  return out;
});
console.log(Q, JSON.stringify(r));
await browser.close();

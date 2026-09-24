// Renders hero shots of the garden for the OG image (1200x630).
import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-dev-shm-usage'] });
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
page.setDefaultTimeout(600000);
await page.addInitScript(() => { localStorage.setItem('onitama.quality', 'high'); localStorage.setItem('onitama.muted', '1'); });
await page.goto('http://localhost:4173/?dt=0.05');
await page.waitForFunction(() => window.__onitama, null, { polling: 2000, timeout: 600000 });
const frames = (n) => page.evaluate((n) => new Promise((r) => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
await page.evaluate(() => {
  document.getElementById('menu').classList.add('hidden');
  document.getElementById('loading').classList.add('hidden');
  const { stage } = window.__onitama;
  stage.controls.autoRotate = false;
  stage.controls.enabled = false;
});
const shots = JSON.parse(process.env.SHOTS || '[["hero-a",[7.5,6.2,9.5],[-0.6,0.4,-0.4]],["hero-b",[-8.5,5.5,8.5],[0.6,0.5,-0.6]]]');
for (const [name, p, t] of shots) {
  await page.evaluate(([p, t]) => { const { stage } = window.__onitama; stage.camera.position.set(...p); stage.controls.target.set(...t); stage.camera.lookAt(...t); stage.camera.fov = 34; stage.camera.updateProjectionMatrix(); }, [p, t]);
  await frames(3);
  await page.screenshot({ path: `brand/${name}.png` });
  console.log('shot', name);
}
if (process.env.NOFX) { await browser.close(); process.exit(0); }
// a capture effect in flight for drama
await page.evaluate(() => { const o = window.__onitama; const at = o.squarePos(12); const from = o.squarePos(7); o.vfx.capture(window.__fxcard || 'Dragon', { at, from, dir: at.clone().sub(from).setY(0).normalize() }); });
await frames(7);
await page.screenshot({ path: `brand/${process.env.FXNAME || 'hero-fx'}.png` });
console.log('shot hero-fx');
await browser.close();

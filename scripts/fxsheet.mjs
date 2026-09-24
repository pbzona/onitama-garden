// Renders every capture effect ~0.3s in and saves one screenshot per card.
import { chromium } from 'playwright';
const cards = ['Tiger','Dragon','Frog','Rabbit','Crab','Elephant','Goose','Rooster','Monkey','Mantis','Horse','Ox','Crane','Boar','Eel','Cobra'];
const which = process.argv[2] && process.argv[2] !== 'all' ? process.argv[2].split(',') : cards;
const at = +(process.argv[3] || 6);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-dev-shm-usage'] });
const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
page.on('pageerror', (e) => console.log('  [pageerror] ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('  [error]', m.text().slice(0, 300)); });
page.setDefaultTimeout(400000);
await page.addInitScript(() => { localStorage.setItem('onitama.quality', 'low'); localStorage.setItem('onitama.muted', '1'); });
await page.goto('http://localhost:4173/?dt=0.05');
await page.waitForFunction(() => window.__onitama, null, { polling: 2000 });
await page.evaluate(() => {
  document.getElementById('menu').classList.add('hidden');
  const { stage } = window.__onitama;
  stage.controls.autoRotate = false;
  stage.camera.position.set(0, 5.2, 6.4);
  stage.controls.target.set(0, 0.6, 0.2);
  stage.controls.update();
});
const frames = (n) => page.evaluate((n) => new Promise((r) => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
for (const c of which) {
  await page.evaluate((c) => {
    const o = window.__onitama; const at = o.squarePos(12); const from = o.squarePos(7);
    const dir = at.clone().sub(from).setY(0).normalize();
    o.vfx.capture(c, { at, from, dir });
  }, c);
  await frames(at);
  await page.screenshot({ path: `shots/fx-${c}.png` });
  await page.evaluate(() => window.__onitama.setDt(1.0));
  await frames(4); // fast-forward to let it finish
  await page.evaluate(() => window.__onitama.setDt(0.05));
  console.log('done', c);
}
await browser.close();

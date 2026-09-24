import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-dev-shm-usage'] });
const page = await browser.newPage({ viewport: { width: 800, height: 500 } });
const errs = []; page.on('pageerror', (e) => errs.push(e.message));
page.setDefaultTimeout(400000);
await page.addInitScript(() => { localStorage.setItem('onitama.quality', 'low'); localStorage.setItem('onitama.muted', '1'); localStorage.setItem('onitama.mode', 'ai'); localStorage.setItem('onitama.viewHintSeen', '1'); });
await page.goto('http://localhost:4173/?fast');
await page.waitForFunction(() => window.__onitama, null, { polling: 2000 });
await page.click('#btn-start');
await page.waitForFunction(() => { const c = window.__onitama.ctl; return c.playing && !c.busy; }, null, { polling: 500, timeout: 300000 });
const th = () => page.evaluate(() => { const o = window.__onitama; const p = o.stage.camera.position.clone().sub(o.stage.controls.target); return +Math.atan2(p.x, p.z).toFixed(2); });
const frames = (n) => page.evaluate((n) => new Promise((r) => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
// user orbits ~70° to the right (within limits)
await page.evaluate(() => { const o = window.__onitama; const t = o.stage.controls.target; o.stage.camera.position.set(t.x + 13, 8, t.z + 5); o.stage.controls.update(); o.ctl.noteCameraInput(); });
console.log('rotated', await th());
await frames(10); // 3s of game time: should NOT nudge yet
console.log('after 3s', await th());
await page.evaluate(() => window.__onitama.setDt(1));
await frames(6); // +6s → nudge starts (1.4s animation)
await frames(4);
console.log('after ~10s', await th());
// limits: try to swing to the opponent's side
await page.evaluate(() => { const o = window.__onitama; const t = o.stage.controls.target; o.stage.camera.position.set(t.x, 8, t.z - 14); o.stage.controls.update(); });
console.log('after trying to orbit behind (clamped to ±1.75):', await th());
console.log('errors', errs.length ? errs : 'none');
await browser.close();

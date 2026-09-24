// Camera: default view, top view, orbit views of the full enclosure, nudge-back.
import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-dev-shm-usage'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.setDefaultTimeout(400000);
await page.addInitScript(() => { localStorage.setItem('onitama.quality', 'low'); localStorage.setItem('onitama.muted', '1'); localStorage.setItem('onitama.mode', 'ai'); });
await page.goto('http://localhost:4173/?fast');
await page.waitForFunction(() => window.__onitama, null, { polling: 2000 });
await page.click('#btn-start');
await page.waitForFunction(() => { const c = window.__onitama.ctl; return c.playing && !c.busy; }, null, { polling: 500, timeout: 300000 });
const theta = () => page.evaluate(() => { const o = window.__onitama; const p = o.stage.camera.position.clone().sub(o.stage.controls.target); return Math.atan2(p.x, p.z).toFixed(2) + ' r=' + p.length().toFixed(1); });
console.log('default', await theta());
await page.screenshot({ path: 'shots/cam-default.png' });
await page.keyboard.press('v');
await page.waitForFunction(() => !window.__onitama.ctl['camAnimating'], null, { polling: 300 });
await page.waitForTimeout(1500);
console.log('top', await theta(), await page.evaluate(() => document.getElementById('btn-view').className));
await page.screenshot({ path: 'shots/cam-top.png' });
await page.keyboard.press('v');
await page.waitForFunction(() => !window.__onitama.ctl['camAnimating'], null, { polling: 300 });
// orbit views (bypassing limits) to inspect the enclosure
for (const [name, x, y, z] of [['side', -17, 7, 2], ['far', 3, 8, -18], ['corner', 15, 6, 15]]) {
  await page.evaluate(([x, y, z]) => { const o = window.__onitama; o.ctl['setAzimuthLimits'](null); o.stage.controls.enabled = false; o.stage.camera.position.set(x, y, z); o.stage.camera.lookAt(0, 0.5, 0); }, [x, y, z]);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `shots/cam-${name}.png` });
}
// nudge: rotate within limits and wait
await page.evaluate(() => { const o = window.__onitama; o.stage.controls.enabled = true; const t = o.stage.controls.target; o.stage.camera.position.set(t.x + 12, 9, t.z + 5); o.stage.controls.update(); o.ctl.noteCameraInput(); });
console.log('rotated', await theta());
await page.waitForTimeout(12000);
await page.waitForFunction(() => !window.__onitama.ctl['camAnimating'], null, { polling: 300 });
console.log('after idle', await theta());
console.log('errors', errs.length ? errs : 'none');
await browser.close();

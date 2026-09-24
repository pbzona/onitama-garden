import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-dev-shm-usage'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('pageerror', (e) => console.log('  [pageerror] ' + e.message));
page.setDefaultTimeout(400000);
await page.addInitScript(() => { localStorage.setItem('onitama.quality', 'low'); localStorage.setItem('onitama.muted', '1'); localStorage.setItem('onitama.mode', 'hotseat'); });
await page.goto('http://localhost:4173/?fast');
await page.waitForFunction(() => window.__onitama, null, { polling: 2000 });
await page.click('#btn-start');
await page.waitForFunction(() => { const c = window.__onitama.ctl; return c.playing && !c.busy; }, null, { polling: 500, timeout: 300000 });
// Force Granite to move with Crab (forward 1) and the camera on Granite's side.
await page.evaluate(async () => {
  const o = window.__onitama, c = o.ctl, s = c.state;
  const crab = 4, others = [0,1,2,3,5,6,7,8,9,10,11,12,13,14,15];
  s.turn = 0; s.hands[0] = [crab, 0]; s.hands[1] = [others[1], others[2]]; s.side = others[3];
  c['cards'].layout(s.hands, s.side, s.turn); c['refreshUsable']();
  await c.turnCamera(0, 0.1);
});
await page.waitForTimeout(3000);
const proj = (expr) => page.evaluate((expr) => { const o = window.__onitama; const v = eval(expr).clone(); v.project(o.stage.camera); return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight }; }, expr);
const cc = await proj(`o.cards.cards.get(4).group.position`);
await page.mouse.click(cc.x, cc.y);
const m = await proj(`o.squarePos(2).add({x:0,y:0.5,z:0})`); // master body
await page.mouse.click(m.x, m.y);
// aim at the lower-middle of c2, the part hidden behind the master's head/hat
const t = await proj(`o.squarePos(7).add({x:0,y:0,z:0.3})`);
console.log('selection', JSON.stringify(await page.evaluate(() => ({ card: window.__onitama.ctl['selCard'], sq: window.__onitama.ctl['selSq'] }))));
// what does a naive ray hit at that point? (the master?)
await page.mouse.move(t.x, t.y);
await page.waitForTimeout(1500);
console.log('faded squares:', JSON.stringify(await page.evaluate(() => window.__onitama.ctl['pieces'].pieces.filter(p => (p.fade ?? 1) < 0.9).map(p => p.square))));
await page.screenshot({ path: 'shots/occlusion2.png' });
await page.mouse.click(t.x, t.y);
await page.waitForTimeout(800);
console.log('last move', JSON.stringify(await page.evaluate(() => { const h = window.__onitama.ctl.history; return h[h.length - 1]?.move; })));
await browser.close();

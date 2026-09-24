// Occlusion + opponent panel check.
import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-dev-shm-usage'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('pageerror', (e) => console.log('  [pageerror] ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('  [error]', m.text().slice(0, 300)); });
page.setDefaultTimeout(400000);
await page.addInitScript(() => { localStorage.setItem('onitama.quality', 'low'); localStorage.setItem('onitama.muted', '1'); localStorage.setItem('onitama.mode', 'ai'); });
await page.goto('http://localhost:4173/?fast');
await page.waitForFunction(() => window.__onitama, null, { polling: 2000 });
await page.click('#btn-start');
await page.waitForFunction(() => { const c = window.__onitama.ctl; return c.playing && !c.busy && c.state.turn === 0; }, null, { polling: 500, timeout: 300000 });
console.log('panel:', await page.evaluate(() => document.getElementById('opp').innerText.replace(/\n+/g, ' | ')));
// pick the human move whose destination is most hidden behind another stone
const plan = await page.evaluate(() => {
  const o = window.__onitama, c = o.ctl;
  const ms = o.legalMoves(c.state).filter(m => m.from >= 0);
  // prefer moves whose destination is directly behind another piece from the camera (larger y = further)
  let best = ms[0], score = -1;
  for (const m of ms) { const behind = c.state.board[m.to - 5] ? 1 : 0; const s2 = behind * 10 + (m.to / 5 | 0); if (s2 > score) { score = s2; best = m; } }
  return best;
});
console.log('move', JSON.stringify(plan));
const proj = (expr) => page.evaluate((expr) => { const o = window.__onitama; const v = eval(expr).clone(); v.project(o.stage.camera); return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight }; }, expr);
const c = await proj(`o.cards.cards.get(${plan.card}).group.position`);
await page.mouse.click(c.x, c.y);
const f = await proj(`o.squarePos(${plan.from})`); f.y -= 12;
await page.mouse.click(f.x, f.y);
const t = await proj(`o.squarePos(${plan.to})`);
await page.mouse.move(t.x, t.y);
await page.waitForTimeout(1500);
console.log('faded:', await page.evaluate(() => window.__onitama.ctl['pieces'].pieces.filter(p => (p.fade ?? 1) < 0.9).map(p => p.square)));
await page.screenshot({ path: 'shots/occlusion.png' });
const before = await page.evaluate(() => window.__onitama.ctl.history.length);
await page.mouse.click(t.x, t.y);
await page.waitForTimeout(500);
console.log('history', before, '->', await page.evaluate(() => window.__onitama.ctl.history.length));
// collapse toggle
await page.waitForFunction(() => { const c = window.__onitama.ctl; return !c.busy && c.state.turn === 0; }, null, { polling: 500, timeout: 300000 });
console.log('panel after AI reply:', await page.evaluate(() => document.getElementById('opp').innerText.replace(/\n+/g, ' | ')));
await page.screenshot({ path: 'shots/panel.png' });
await page.click('#opp-toggle');
await page.waitForTimeout(500);
console.log('collapsed:', await page.evaluate(() => document.getElementById('opp').className), 'stored', await page.evaluate(() => localStorage.getItem('onitama.oppCollapsed')));
await page.screenshot({ path: 'shots/panel-collapsed.png', clip: { x: 900, y: 0, width: 380, height: 200 } });
await browser.close();

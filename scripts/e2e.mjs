// End-to-end: real clicks through the UI against the AI.
import { chromium } from 'playwright';
const W = 1280, H = 800;
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-dev-shm-usage'] });
const page = await browser.newPage({ viewport: { width: W, height: H } });
const logs = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'log') console.log(`  [${m.type()}] ${m.text()}`.slice(0, 400)); });
page.on('pageerror', (e) => console.log('  [pageerror] ' + e.message + '\n' + e.stack));
page.setDefaultTimeout(400000);
await page.addInitScript(() => { localStorage.setItem('onitama.quality', 'low'); localStorage.setItem('onitama.muted', '1'); });
await page.goto('http://localhost:4173/?fast');
await page.waitForFunction(() => window.__onitama, null, { polling: 2000 });
console.log('booted');
await page.click('#btn-start');
const status = () => page.evaluate(() => { const c = window.__onitama.ctl; return JSON.stringify({ busy: c.busy, turn: c.state.turn, ply: c.state.ply, win: c.state.winner, pend: c.pendingAI, hist: c.history.length, hint: document.getElementById('hint').textContent }); });
const humanReady = async () => { try { await page.waitForFunction(() => { const c = window.__onitama.ctl; return c.playing && !c.busy && c.state.turn === 0 && c.state.winner === -1; }, null, { polling: 500, timeout: 150000 }); } catch (e) { console.log('STUCK', await status()); await page.screenshot({ path: 'shots/e2e-stuck.png' }); await browser.close(); process.exit(1); } };
const proj = (expr) => page.evaluate((expr) => {
  const o = window.__onitama; const v = eval(expr).clone();
  v.project(o.stage.camera);
  return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight };
}, expr);
const shots = [];
for (let turn = 0; turn < 4; turn++) {
  await humanReady();
  const st = await page.evaluate(() => { const o = window.__onitama; const ms = o.legalMoves(o.ctl.state); const caps = ms.filter(m => m.from >= 0 && o.ctl.state.board[m.to] !== 0); const m = caps[0] || ms[Math.floor(Math.random() * ms.length)]; return { m, hist: o.ctl.history.length }; });
  const m = st.m;
  console.log('turn', turn, 'history', st.hist, 'move', JSON.stringify(m));
  if (m.from < 0) { const c = await proj(`o.cards.cards.get(${m.card}).group.position`); await page.mouse.click(c.x, c.y); continue; }
  const c = await proj(`o.cards.cards.get(${m.card}).group.position`);
  await page.mouse.move(c.x, c.y); await page.mouse.click(c.x, c.y);
  await page.waitForTimeout(300);
  const f = await proj(`o.squarePos(${m.from})`); f.y -= 12;
  await page.mouse.click(f.x, f.y);
  const t = await proj(`o.squarePos(${m.to})`);
  await page.mouse.move(t.x, t.y);
  await page.waitForTimeout(1200);
  if (turn === 1) { await page.screenshot({ path: 'shots/e2e-select.png' }); shots.push('select'); }
  const sel = await page.evaluate(() => { const c = window.__onitama.ctl; return { card: c.selCard, sq: c.selSq }; });
  console.log('  selection', JSON.stringify(sel));
  await page.mouse.click(t.x, t.y);
  console.log('  after click', await status());
  await page.waitForTimeout(800);
  if (turn === 2) { await page.screenshot({ path: 'shots/e2e-anim.png' }); }
}
await humanReady();
await page.screenshot({ path: 'shots/e2e-mid.png' });
const before = await page.evaluate(() => window.__onitama.ctl.history.length);
await page.click('#btn-undo');
await page.waitForTimeout(1500);
const after = await page.evaluate(() => ({ h: window.__onitama.ctl.history.length, turn: window.__onitama.ctl.state.turn }));
console.log('undo history', before, '->', JSON.stringify(after));
await page.screenshot({ path: 'shots/e2e-undo.png' });
console.log(logs.join('\n') || 'no console errors');
await browser.close();

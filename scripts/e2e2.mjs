// Hotseat flow + forced victory screen.
import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-dev-shm-usage'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('console', (m) => { if (m.type() === 'error') console.log('  [error]', m.text().slice(0, 300)); });
page.on('pageerror', (e) => console.log('  [pageerror] ' + e.message));
page.setDefaultTimeout(400000);
await page.addInitScript(() => { localStorage.setItem('onitama.quality', 'low'); localStorage.setItem('onitama.muted', '1'); localStorage.setItem('onitama.mode', 'hotseat'); });
await page.goto('http://localhost:4173/?fast');
await page.waitForFunction(() => window.__onitama, null, { polling: 2000 });
console.log('booted');
await page.click('#btn-start');
const ready = () => page.waitForFunction(() => { const c = window.__onitama.ctl; return c.playing && !c.busy; }, null, { polling: 500, timeout: 300000 });
await ready();
const info = () => page.evaluate(() => { const o = window.__onitama; const c = o.ctl; const cam = o.stage.camera.position; return JSON.stringify({ mode: c.mode, turn: c.state.turn, hist: c.history.length, camZ: +cam.z.toFixed(2), hint: document.getElementById('hint').textContent, name: document.querySelector('.turn-name').textContent }); });
console.log('start', await info());
// play one move for whoever is first via the controller, then check camera swings
await page.evaluate(() => { const o = window.__onitama; const m = o.legalMoves(o.ctl.state)[0]; o.ctl.play(m); });
await ready();
console.log('after move 1', await info());
await page.screenshot({ path: 'shots/hotseat.png' });
await page.evaluate(() => { const o = window.__onitama; const m = o.legalMoves(o.ctl.state)[0]; o.ctl.play(m); });
await ready();
console.log('after move 2', await info());
// Force a Way-of-the-Stream win: set a position where the current player's master can step onto the enemy temple.
await page.evaluate(() => {
  const o = window.__onitama; const c = o.ctl; const s = c.state;
  const pl = s.turn; s.board.fill(0);
  const P0M = 2, P1M = 4, P0S = 1, P1S = 3;
  if (pl === 0) { s.board[17] = P0M; s.board[0] = P0S; s.board[20] = P1M; s.board[24] = P1S; }
  else { s.board[7] = P1M; s.board[24] = P1S; s.board[4] = P0M; s.board[0] = P0S; }
  s.hands[pl] = [8, 12]; // Monkey, Crane
  const others = [0,1,2,3,4,5,6,7,9,10,11,13,14,15].filter(x => !s.hands[pl].includes(x));
  s.hands[1 - pl] = [others[0], others[1]]; s.side = others[2];
  o.stage.controls; c.pieces?.sync?.(s);
  window.__onitama.ctl['pieces'].sync(s); window.__onitama.ctl['cards'].layout(s.hands, s.side, s.turn);
  const win = o.legalMoves(s).find(m => m.to === (pl === 0 ? 22 : 2) && (m.from === 17 || m.from === 7));
  c.play(win);
});
await page.waitForFunction(() => !document.getElementById('result').classList.contains('hidden'), null, { polling: 500, timeout: 300000 });
console.log('result:', await page.evaluate(() => [document.querySelector('.result-kanji').textContent, document.querySelector('.result-title').textContent, document.querySelector('.result-sub').textContent].join(' | ')));
await page.screenshot({ path: 'shots/victory.png' });
// rematch works
await page.click('#btn-rematch');
await ready();
console.log('rematch', await info());
await browser.close();

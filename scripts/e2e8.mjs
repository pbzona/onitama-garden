// Real capture → log gets a capture mark; no errors from the reward layer / light pool.
import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-dev-shm-usage'] });
const page = await browser.newPage({ viewport: { width: 1100, height: 700 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
page.setDefaultTimeout(400000);
await page.addInitScript(() => { localStorage.setItem('onitama.quality', 'low'); localStorage.setItem('onitama.muted', '1'); localStorage.setItem('onitama.mode', 'hotseat'); localStorage.setItem('onitama.viewHintSeen', '1'); });
await page.goto('http://localhost:4173/?fast');
await page.waitForFunction(() => window.__onitama, null, { polling: 2000 });
await page.click('#btn-start');
await page.waitForFunction(() => { const c = window.__onitama.ctl; return c.playing && !c.busy; }, null, { polling: 500, timeout: 300000 });
await page.evaluate(() => {
  const o = window.__onitama, c = o.ctl, s = c.state;
  s.board.fill(0); s.board[2] = 2; s.board[7] = 1; s.board[12] = 3; s.board[17] = 3; s.board[22] = 4;
  s.turn = 0; s.hands[0] = [4, 0]; s.hands[1] = [11, 2]; s.side = 3;
  c['pieces'].sync(s); c['cards'].layout(s.hands, s.side, s.turn);
  c.play({ card: 4, from: 7, to: 12 }); // Crab: student takes student
});
await page.waitForFunction(() => { const c = window.__onitama.ctl; return !c.busy; }, null, { polling: 500, timeout: 300000 });
// Basalt replies by taking back with a quiet non-capture? play a non-capturing move then a master capture later isn't needed; show log.
await page.evaluate(() => { const o = window.__onitama, c = o.ctl; const m = o.legalMoves(c.state).find((m) => m.from >= 0 && c.state.board[m.to] === 0); c.play(m); });
await page.waitForFunction(() => { const c = window.__onitama.ctl; return !c.busy; }, null, { polling: 500, timeout: 300000 });
console.log('log html:', await page.evaluate(() => document.getElementById('log').innerHTML));
await page.screenshot({ path: 'shots/log-marks.png', clip: { x: 0, y: 60, width: 320, height: 120 } });
// undo keeps marks when rebuilding the log
await page.click('#btn-undo');
await page.waitForTimeout(800);
console.log('after undo:', await page.evaluate(() => document.getElementById('log').innerText.replace(/\n/g, ' | ')), await page.evaluate(() => document.querySelectorAll('#log .capmark').length), 'mark(s)');
console.log('errors', errs.length ? errs : 'none');
await browser.close();

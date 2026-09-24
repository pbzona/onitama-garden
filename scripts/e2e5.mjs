// A real in-game capture triggers the card effect without errors.
import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-dev-shm-usage'] });
const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
page.setDefaultTimeout(400000);
await page.addInitScript(() => { localStorage.setItem('onitama.quality', 'low'); localStorage.setItem('onitama.muted', '1'); localStorage.setItem('onitama.mode', 'hotseat'); });
await page.goto('http://localhost:4173/?fast');
await page.waitForFunction(() => window.__onitama, null, { polling: 2000 });
await page.click('#btn-start');
await page.waitForFunction(() => { const c = window.__onitama.ctl; return c.playing && !c.busy; }, null, { polling: 500, timeout: 300000 });
const r = await page.evaluate(() => {
  const o = window.__onitama, c = o.ctl, s = c.state;
  // Granite student on c2 captures Basalt student on c3 with Crab (forward 1)
  s.board.fill(0); s.board[2] = 2; s.board[7] = 1; s.board[12] = 3; s.board[22] = 4;
  s.turn = 0; s.hands[0] = [4, 0]; s.hands[1] = [1, 2]; s.side = 3;
  c['pieces'].sync(s); c['cards'].layout(s.hands, s.side, s.turn);
  let captured = null;
  const orig = o.vfx.capture.bind(o.vfx);
  o.vfx.capture = (name, ctx) => { captured = name; window.__cap = name; return orig(name, ctx); };
  c.play({ card: 4, from: 7, to: 12 });
  return 'played';
});
await page.waitForFunction(() => { const c = window.__onitama.ctl; return !c.busy; }, null, { polling: 500, timeout: 300000 });
console.log(r, 'effect:', await page.evaluate(() => window.__cap), 'board c3:', await page.evaluate(() => window.__onitama.ctl.state.board[12]), 'errors:', errs.length ? errs : 'none');
await browser.close();

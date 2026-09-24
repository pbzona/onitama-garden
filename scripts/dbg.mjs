import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 800, height: 500 } });
page.on('console', (m) => console.log(`[${m.type()}] ${m.text()}`.slice(0, 300)));
page.on('pageerror', (e) => console.log('[pageerror] ' + e.message));
page.on('worker', w => { console.log('worker created'); w.on('console', m => console.log('[worker]', m.text())); });
page.setDefaultTimeout(400000);
await page.addInitScript(() => { localStorage.setItem('onitama.quality', 'low'); localStorage.setItem('onitama.muted', '1'); });
await page.goto('http://localhost:4173/?fast');
await page.waitForFunction(() => window.__onitama, null, { polling: 2000 });
await page.click('#btn-start');
for (let i = 0; i < 3; i++) {
  await page.waitForTimeout(5000);
  console.log(await page.evaluate(() => { const c = window.__onitama.ctl; console.log("uTime", window.__onitama.stage.grade.uniforms.uTime.value, document.hidden, document.visibilityState); return JSON.stringify({ playing: c.playing, busy: c.busy, turn: c.state.turn, ply: c.state.ply, pend: c.pendingAI, hint: document.getElementById('hint').textContent, sub: document.querySelector('.turn-sub').textContent, fps: 0 }); }));
}
await browser.close();

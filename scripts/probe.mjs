import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 800, height: 500 } });
page.on('console', (m) => console.log(`[${m.type()}] ${m.text()}`.slice(0, 300)));
page.on('pageerror', (e) => console.log('[pageerror] ' + e.message));
await page.addInitScript(() => localStorage.setItem('onitama.quality', 'low'));
const t0 = Date.now();
await page.goto('http://localhost:4173/', { waitUntil: 'load' });
console.log('loaded', Date.now() - t0);
for (let i = 0; i < 36; i++) {
  await page.waitForTimeout(5000);
  const r = await page.evaluate(() => [!!window.__onitama, document.getElementById('loading').className, performance.now()|0]).catch(e => 'eval-fail ' + e.message);
  console.log(Date.now() - t0, JSON.stringify(r));
  if (r[0]) break;
}
await browser.close();

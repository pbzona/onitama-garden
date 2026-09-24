// Generates favicon PNGs and the Open Graph image from public/favicon.svg and brand/hero-*.png.
// Usage: node scripts/brand.mjs [hero-file]
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';

// Binary outputs are stored as base64 text in public-b64/ (decoded at build time by vite.config.ts)
// so the whole repo stays text-only.
const toB64 = (file) => {
  const name = file.split('/').pop();
  const b = readFileSync(file).toString('base64');
  writeFileSync(`public-b64/${name}.b64`, b.match(/.{1,76}/g).join('\n') + '\n');
  unlinkSync(file);
};

const hero = process.argv[2] || 'brand/hero-a.png';
const svg = readFileSync('public/favicon.svg', 'utf8');
const browser = await chromium.launch();
const page = await browser.newPage();

// ---- icon PNGs
for (const [file, size, pad] of [
  ['public/favicon-32.png', 32, 0],
  ['public/apple-touch-icon.png', 180, 0],
  ['public/icon-192.png', 192, 0],
  ['public/icon-512.png', 512, 0],
  ['public/icon-maskable-512.png', 512, 0.12],
]) {
  await page.setViewportSize({ width: size, height: size });
  const inner = Math.round(size * (1 - pad * 2));
  await page.setContent(
    `<html><body style="margin:0;background:${pad ? '#22272b' : 'transparent'};display:grid;place-items:center;width:${size}px;height:${size}px">
     <div style="width:${inner}px;height:${inner}px">${svg.replace('<svg ', `<svg width="${inner}" height="${inner}" `)}</div></body></html>`,
  );
  await page.screenshot({ path: file, omitBackground: !pad });
  toB64(file);
  console.log('wrote', file, '(as base64)');
}

// ---- OG image 1200x630
await page.setViewportSize({ width: 1200, height: 630 });
const heroData = readFileSync(hero).toString('base64');
const iconData = Buffer.from(svg).toString('base64');
await page.setContent(`<!doctype html><html><head>
<link href="https://fonts.googleapis.com/css2?family=Shippori+Mincho+B1:wght@600;700&family=Yuji+Syuku&family=Zen+Kaku+Gothic+New:wght@500&display=block" rel="stylesheet">
<style>
  html,body{margin:0;width:1200px;height:630px;overflow:hidden;background:#14110e}
  .bg{position:absolute;inset:0;background:url(data:image/png;base64,${heroData}) center/cover}
  .shade{position:absolute;inset:0;background:
    linear-gradient(90deg, rgba(16,13,10,0.92) 0%, rgba(16,13,10,0.78) 30%, rgba(16,13,10,0.25) 55%, rgba(16,13,10,0) 70%),
    linear-gradient(0deg, rgba(16,13,10,0.55) 0%, rgba(16,13,10,0) 30%)}
  .txt{position:absolute;left:72px;top:50%;transform:translateY(-50%);color:#eee3cc;width:520px}
  .kanji{font-family:'Yuji Syuku',serif;font-size:92px;line-height:1;opacity:.95}
  h1{font-family:'Shippori Mincho B1',serif;font-weight:700;font-size:72px;letter-spacing:.22em;margin:18px 0 4px;text-transform:uppercase}
  .sub{font-family:'Shippori Mincho B1',serif;font-style:italic;color:#d9a54a;font-size:28px;letter-spacing:.08em}
  .line{width:84px;height:2px;background:#d9a54a;opacity:.7;margin:26px 0 22px}
  .tag{font-family:'Zen Kaku Gothic New',sans-serif;font-size:21px;color:rgba(238,227,204,.8);line-height:1.5}
  .mark{position:absolute;right:40px;bottom:36px;width:56px;height:56px;opacity:.9}
</style></head><body>
<div class="bg"></div><div class="shade"></div>
<div class="txt">
  <div class="kanji">鬼玉</div>
  <h1>Onitama</h1>
  <div class="sub">The Stone Garden</div>
  <div class="line"></div>
  <div class="tag">A 3D martial-arts strategy duel in your browser.<br>Play the Garden Master or a friend.</div>
</div>
<img class="mark" src="data:image/svg+xml;base64,${iconData}">
</body></html>`);
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(600);
await page.screenshot({ path: 'public/og.jpg', type: 'jpeg', quality: 88 });
toB64('public/og.jpg');
console.log('wrote public/og.jpg (as base64)');

// small web manifest
writeFileSync(
  'public/site.webmanifest',
  JSON.stringify(
    {
      name: 'Onitama · The Stone Garden',
      short_name: 'Onitama',
      description: 'A 3D martial-arts strategy duel in a Japanese stone garden.',
      start_url: './',
      display: 'fullscreen',
      background_color: '#14110e',
      theme_color: '#1a1714',
      icons: [
        { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
        { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    null,
    2,
  ),
);
console.log('wrote public/site.webmanifest');
await browser.close();

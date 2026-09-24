import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
const svg = readFileSync('public/favicon.svg', 'utf8');
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 520, height: 220 } });
const sizes = [16, 32, 64, 180];
await p.setContent(`<body style="margin:0;background:#dcd6cc;display:flex;gap:24px;align-items:center;padding:20px">${sizes.map(s => `<div style="text-align:center;font:12px sans-serif">${svg.replace('<svg ', `<svg width="${s}" height="${s}" `)}<div>${s}px</div></div>`).join('')}<div style="background:#202124;padding:8px 12px;border-radius:8px;color:#ddd;font:13px sans-serif;display:flex;gap:8px;align-items:center">${svg.replace('<svg ', '<svg width="16" height="16" ')} Onitama · The Stone…</div></body>`);
await p.screenshot({ path: 'brand/favicon-sheet.png' }); await b.close();

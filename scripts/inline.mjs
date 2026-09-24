// Produces dist-single/index.html with all JS/CSS inlined (for single-file previews).
// The normal multi-file build in dist/ is what you'd host.
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
const html = readFileSync('dist/index.html', 'utf8');
let out = html.replace(/<script type="module" crossorigin src="\.\/(assets\/[^"]+\.js)"><\/script>/, (_, f) => {
  const js = readFileSync('dist/' + f, 'utf8').replace(/<\/script/gi, '<\\/script');
  return `<script type="module">${js}</script>`;
});
out = out.replace(/<link rel="stylesheet" crossorigin href="\.\/(assets\/[^"]+\.css)">/, (_, f) => `<style>${readFileSync('dist/' + f, 'utf8')}</style>`);
mkdirSync('dist-single', { recursive: true });
writeFileSync('dist-single/index.html', out);
console.log('dist-single/index.html', (out.length / 1024).toFixed(0) + ' KB', 'assets:', readdirSync('dist/assets').join(', '));

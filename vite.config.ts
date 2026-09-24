import { defineConfig, type Plugin } from 'vite';
import { readFileSync, readdirSync, existsSync } from 'node:fs';

/**
 * Social-preview crawlers need absolute URLs for og:image. Set SITE_URL at build time
 * (e.g. SITE_URL=https://onitama.example.com npm run build). On Vercel the production
 * domain is picked up automatically. Without either, URLs fall back to relative paths.
 */
function siteUrl(): Plugin {
  const raw =
    process.env.SITE_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : '') ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '');
  const base = raw ? raw.replace(/\/?$/, '/') : './';
  return {
    name: 'site-url',
    transformIndexHtml: (html) => html.replaceAll('%SITE_URL%', base),
  };
}

/**
 * Binary assets (PNG icons, the OG image) live in public-b64/ as base64 text so the repo stays
 * text-only. They are decoded into the build output and served decoded by the dev server.
 */
function b64Assets(): Plugin {
  const dir = 'public-b64';
  const load = () =>
    existsSync(dir)
      ? readdirSync(dir)
          .filter((f) => f.endsWith('.b64'))
          .map((f) => ({ name: f.slice(0, -4), data: Buffer.from(readFileSync(`${dir}/${f}`, 'utf8').replace(/\s+/g, ''), 'base64') }))
      : [];
  const mime: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' };
  return {
    name: 'b64-assets',
    generateBundle() {
      for (const a of load()) this.emitFile({ type: 'asset', fileName: a.name, source: a.data });
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const name = (req.url || '').split('?')[0].split('/').pop()!;
        const a = load().find((x) => x.name === name);
        if (!a) return next();
        res.setHeader('Content-Type', mime[name.split('.').pop()!] || 'application/octet-stream');
        res.end(a.data);
      });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [siteUrl(), b64Assets()],
  build: { target: 'es2022', chunkSizeWarningLimit: 1500 },
  worker: { format: 'es' },
});

import { defineConfig, type Plugin } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DESIGN_DIR = path.join(ROOT, 'Game Design & Balancing');

// Serves / ships every YAML file from "Game Design & Balancing" under ./design/
// so the game reads the balancing at start (dev: live from disk, build: copied into dist).
function designFiles(): Plugin {
  return {
    name: 'pog-design-files',
    configureServer(server) {
      server.watcher.add(DESIGN_DIR);
      server.watcher.on('change', (f) => {
        if (path.resolve(f).startsWith(DESIGN_DIR)) server.ws.send({ type: 'full-reload' });
      });
      // dev-only tool endpoint: the sound cutting tool saves processed clips into public/audio/ (raw sources stay in sfx/)
      server.middlewares.use('/__tools/save-sfx', (req, res) => {
        const name = new URL(req.url || '', 'http://x').searchParams.get('name') || '';
        if (req.method !== 'POST' || !/^[a-z0-9_]+\.wav$/.test(name)) { res.statusCode = 400; res.end('bad'); return; }
        const chunks: Buffer[] = [];
        req.on('data', (c: Buffer) => chunks.push(c));
        req.on('end', () => {
          const dir = path.join(ROOT, 'public', 'audio'); fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(path.join(dir, name), Buffer.concat(chunks)); res.end('ok');
        });
      });
      server.middlewares.use('/__tools/list-sfx', (_req, res) => {
        const dir = path.join(ROOT, 'sfx');
        res.setHeader('Content-Type', 'application/json');
        const out: string[] = [];
        const walk = (d: string, rel: string) => {
          for (const e of fs.readdirSync(d, { withFileTypes: true })) {
            if (e.isDirectory()) walk(path.join(d, e.name), rel + e.name + '/');
            else if (/\.(wav|mp3|ogg)$/i.test(e.name)) out.push(rel + e.name);
          }
        };
        if (fs.existsSync(dir)) walk(dir, '');
        res.end(JSON.stringify(out));
      });
      // dev-only: analysis images of the sound tool (not part of the game)
      server.middlewares.use('/__tools/save-png', (req, res) => {
        const name = new URL(req.url || '', 'http://x').searchParams.get('name') || '';
        if (req.method !== 'POST' || !/^[a-z0-9_]+\.png$/.test(name)) { res.statusCode = 400; res.end('bad'); return; }
        const chunks: Buffer[] = [];
        req.on('data', (c: Buffer) => chunks.push(c));
        req.on('end', () => {
          const dir = path.join(ROOT, '.tools-out'); fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(path.join(dir, name), Buffer.concat(chunks)); res.end('ok');
        });
      });
      server.middlewares.use((req, res, next) => {
        const url = decodeURIComponent((req.url || '').split('?')[0]);
        const m = url.match(/\/design\/([\w.\- ]+\.ya?ml)$/);
        if (!m) return next();
        const file = path.join(DESIGN_DIR, m[1]);
        if (!fs.existsSync(file)) return next();
        res.setHeader('Content-Type', 'text/yaml; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        res.end(fs.readFileSync(file));
      });
    },
    generateBundle() {
      for (const name of fs.readdirSync(DESIGN_DIR)) {
        if (!/\.ya?ml$/.test(name)) continue;
        this.emitFile({ type: 'asset', fileName: 'design/' + name, source: fs.readFileSync(path.join(DESIGN_DIR, name), 'utf8') });
      }
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [designFiles()],
  build: {
    target: 'es2020', chunkSizeWarningLimit: 2500,
    // vfx.html = VFX lab (developer tool for skill effects, not linked from the game)
    rollupOptions: { input: { main: path.join(ROOT, 'index.html'), vfx: path.join(ROOT, 'vfx.html'), tiere: path.join(ROOT, 'tiere.html') } },
  },
});

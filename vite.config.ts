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
  build: { target: 'es2020', chunkSizeWarningLimit: 2500 },
});

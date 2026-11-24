import fs from 'node:fs';
import path from 'node:path';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const manifest = JSON.parse(
  fs.readFileSync(path.resolve(process.cwd(), 'komari-theme.json'), 'utf8')
) as { version?: string };

function flagIconsStaticPlugin(): Plugin {
  const srcFlagsDir = path.resolve(process.cwd(), 'node_modules/flag-icons/flags/4x3');

  return {
    name: 'komari-flag-icons',
    configureServer(server) {
      server.middlewares.use('/flags', (req, res, next) => {
        const clean = (req.url || '').split('?')[0].replace(/^\/+/, '');
        if (!/^[a-z0-9-]+\.svg$/i.test(clean)) {
          next();
          return;
        }
        const filePath = path.join(srcFlagsDir, clean.toLowerCase());
        if (fs.existsSync(filePath)) {
          res.setHeader('Content-Type', 'image/svg+xml');
          res.setHeader('Cache-Control', 'public, max-age=86400');
          fs.createReadStream(filePath).pipe(res);
          return;
        }
        next();
      });
    },
    closeBundle() {
      if (!fs.existsSync(srcFlagsDir)) return;
      const outFlagsDir = path.resolve(process.cwd(), 'dist/flags');
      fs.mkdirSync(outFlagsDir, { recursive: true });
      for (const file of fs.readdirSync(srcFlagsDir)) {
        if (file.endsWith('.svg')) {
          fs.copyFileSync(path.join(srcFlagsDir, file), path.join(outFlagsDir, file));
        }
      }
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const komariTarget = env.VITE_KOMARI_BASE || '';
  const appVersion = process.env.THEME_VERSION || manifest.version || '1.0.0';

  return {
    plugins: [react(), flagIconsStaticPlugin()],
    base: '/',
    define: {
      __APP_VERSION__: JSON.stringify(appVersion),
    },
    server: {
      host: '0.0.0.0',
      port: 5173,
      allowedHosts: true,
      proxy: komariTarget
        ? {
            '/api': {
              target: komariTarget,
              changeOrigin: true,
              ws: true,
            },
          }
        : undefined,
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      sourcemap: false,
    },
  };
});

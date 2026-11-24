import fs from 'node:fs';
import path from 'node:path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const manifest = JSON.parse(
  fs.readFileSync(path.resolve(process.cwd(), 'komari-theme.json'), 'utf8')
) as { version?: string };

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const komariTarget = env.VITE_KOMARI_BASE || '';
  const appVersion = process.env.THEME_VERSION || manifest.version || '1.0.0';

  return {
    plugins: [react()],
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

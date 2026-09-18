import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export const DEV_SERVER_PROXY = Object.freeze({
  '/api': 'http://127.0.0.1:8791',
  '/mcp': 'http://127.0.0.1:8791',
  '/generated': 'http://127.0.0.1:8791',
  '/inspiration-assets': 'http://127.0.0.1:8791',
});

function enforceThemeCssLast() {
  return {
    name: 'enforce-theme-css-last',
    enforce: 'post',
    generateBundle(_options, bundle) {
      for (const asset of Object.values(bundle)) {
        if (asset.type !== 'asset' || !asset.fileName.endsWith('.html')) continue;
        const source = String(asset.source);
        const themeLinks = source.match(
          /\s*<link[^>]+href="[^"]*dark-green-theme-[^"]+\.css"[^>]*>/g,
        );
        if (!themeLinks?.length) continue;
        const withoutThemeLinks = source.replace(
          /\s*<link[^>]+href="[^"]*dark-green-theme-[^"]+\.css"[^>]*>/g,
          '',
        );
        asset.source = withoutThemeLinks.replace(
          '</head>',
          `${themeLinks.join('')}\n  </head>`,
        );
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), enforceThemeCssLast()],
  server: {
    port: 5173,
    proxy: DEV_SERVER_PROXY,
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        app: resolve(import.meta.dirname, 'index.html'),
        admin: resolve(import.meta.dirname, 'admin.html'),
      },
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('@xyflow/react')) return 'workflow-vendor';
          if (id.includes('react-dom') || id.includes('/react/')) return 'react-vendor';
          return undefined;
        },
      },
    },
  },
});


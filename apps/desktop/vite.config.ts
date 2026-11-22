import path from 'node:path';
import react from '@vitejs/plugin-react';
import Unfonts from 'unplugin-fonts/vite';
import { defineConfig, type Plugin } from 'vite';

const host = process.env.TAURI_DEV_HOST;

const reactScan = (): Plugin => ({
  name: 'react-scan',
  apply: 'serve',
  transformIndexHtml: () => [
    {
      tag: 'script',
      attrs: { type: 'module', src: '/src/lib/react-scan.ts' },
      injectTo: 'head-prepend',
    },
  ],
});

export default defineConfig(async () => ({
  envDir: path.resolve(__dirname, '../..'),
  plugins: [
    reactScan(),
    react(),
    Unfonts({
      custom: {
        families: [
          {
            name: 'Forevs',
            local: 'Forevs',
            src: './src/assets/fonts/primary/*.otf',
          },
        ],
        display: 'auto',
        preload: true,
        prefetch: false,
        injectTo: 'head-prepend',
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    dedupe: ['react', 'react-dom', 'zod'],
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'react/jsx-runtime'],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalizedId = id.replaceAll(path.sep, '/');
          if (normalizedId.includes('/node_modules/three/')) {
            return 'vendor-three';
          }
        },
      },
    },
  },

  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host,
    hmr: host
      ? {
          protocol: 'ws',
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ['**/src-tauri/**', '**/target/**'],
    },
  },
}));

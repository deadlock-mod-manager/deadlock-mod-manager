import path from 'node:path';
import react from '@vitejs/plugin-react';
import Unfonts from 'unplugin-fonts/vite';
import { defineConfig, type Plugin } from 'vite';

const host = process.env.TAURI_DEV_HOST;

// React Scan must load before React, so inject it ahead of main.tsx in dev only.
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

// https://vitejs.dev/config/
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
    dedupe: ['react', 'react-dom'],
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

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
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

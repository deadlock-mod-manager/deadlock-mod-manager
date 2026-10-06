import path from 'node:path';
import react from '@vitejs/plugin-react';
import Unfonts from 'unplugin-fonts/vite';
import { defineConfig } from 'vite';

const host = process.env.TAURI_DEV_HOST;

// https://vitejs.dev/config/
export default defineConfig(async ({ command }) => ({
  envDir: path.resolve(__dirname, '../..'),
  // Release builds must not inherit development service URLs from the root .env.
  // Explicit environment variables still allow staging and E2E builds.
  define:
    command === 'build'
      ? {
          'import.meta.env.VITE_API_URL': JSON.stringify(
            process.env.VITE_API_URL ?? 'https://api.deadlockmods.app',
          ),
          'import.meta.env.VITE_WEB_URL': JSON.stringify(
            process.env.VITE_WEB_URL ?? 'https://deadlockmods.app',
          ),
          'import.meta.env.VITE_AUTH_URL': JSON.stringify(
            process.env.VITE_AUTH_URL ?? 'https://auth.deadlockmods.app',
          ),
        }
      : undefined,
  plugins: [
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

import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import viteTsConfigPaths from 'vite-tsconfig-paths'
import tailwindcss from '@tailwindcss/vite'
import sitemap from 'vite-plugin-sitemap';
import { copyCrosshairBackgrounds } from './tools/vite-plugin-copy-backgrounds';

const config = defineConfig({
  plugins: [
    copyCrosshairBackgrounds(),
    viteTsConfigPaths({
      projects: ['./tsconfig.json'],
    }),
    tanstackStart({
      srcDirectory: './src',
    }),
    viteReact(),
    tailwindcss(),
    sitemap({
      hostname: 'https://deadlockmods.app',
      outDir: 'dist/client',
      dynamicRoutes: [
        '/',
        '/mods',
        '/download/windows',
        '/download/linux',
        '/download',
        '/vpk-analyzer',
        '/status',
        '/privacy',
        '/terms',
        '/discord',
        '/docs',
        '/crosshair-generator', 
      ],
      exclude: [
        '/login',
      ],
      changefreq: {
        '/': 'weekly',
        '/mods': 'hourly',
        '/download': 'weekly', 
        '/download/windows': 'weekly',
        '/download/linux': 'weekly',
        '/vpk-analyzer': 'monthly',
        '/status': 'daily',
        '/privacy': 'monthly',
        '/terms': 'monthly',
        '/discord': 'monthly',
        '/docs': 'weekly',
        '/crosshair-generator': 'weekly',
        '*': 'weekly',
      },
      priority: {
        '/': 1.0,
        '/mods': 0.9,
        '/download': 0.9,
        '/download/windows': 0.8,
        '/download/linux': 0.8,
        '/docs': 0.9,
        '/vpk-analyzer': 0.7,
        '/status': 0.6,
        '/privacy': 0.5,
        '/terms': 0.5,
        '/discord': 0.7,
        '/crosshair-generator': 0.7,
        '*': 0.6,
      },
      generateRobotsTxt: false,
    }),
  ],
})

export default config

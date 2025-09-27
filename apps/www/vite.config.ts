import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import sitemap from 'vite-plugin-sitemap';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    tailwindcss(),
    tanstackRouter({}),
    react(),
    sitemap({
      hostname: 'https://deadlockmods.app',
      dynamicRoutes: [
        '/download/windows',
        '/download/linux',
        '/download',
        '/vpk-analyzer',
        '/status',
        '/privacy',
        '/terms',
        '/discord',
      ],
      exclude: [
        '/login', // Login page might not need to be indexed
      ],
      changefreq: {
        '/': 'weekly',
        '/download': 'weekly', 
        '/download/windows': 'weekly',
        '/download/linux': 'weekly',
        '/vpk-analyzer': 'monthly',
        '/status': 'daily',
        '/privacy': 'monthly',
        '/terms': 'monthly',
        '/discord': 'monthly', // Discord invite rarely changes
        '*': 'weekly', // default for other pages
      },
      priority: {
        '/': 1.0,
        '/download': 0.9,
        '/download/windows': 0.8,
        '/download/linux': 0.8,
        '/vpk-analyzer': 0.7,
        '/status': 0.6,
        '/privacy': 0.5,
        '/terms': 0.5,
        '/discord': 0.7, // Important for community engagement
        '*': 0.6, // default for other pages
      },
      generateRobotsTxt: true,
      robots: [
        {
          userAgent: '*',
          allow: '/',
        },
        {
          userAgent: 'Googlebot',
          allow: '/',
        },
        {
          userAgent: 'Bingbot',
          allow: '/',
        },
      ],
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});

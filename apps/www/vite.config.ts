import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import viteTsConfigPaths from 'vite-tsconfig-paths'
import tailwindcss from '@tailwindcss/vite'
import { copyCrosshairBackgrounds } from './tools/vite-plugin-copy-backgrounds';

// sitemap.xml is served by src/routes/sitemap[.]xml.ts
const config = defineConfig(() => ({
  ssr: {
    // packages/ui pins an older lucide-react than this app. Left external, the
    // server bundle resolves every lucide import from apps/www while the client
    // bundles packages/ui's copy, so icons render different SVG on each side
    // and hydration fails (React #418). Bundling keeps both sides identical.
    noExternal: ['lucide-react'],
  },
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
  ],
}))

export default config

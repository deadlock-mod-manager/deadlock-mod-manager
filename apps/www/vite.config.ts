import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import viteTsConfigPaths from 'vite-tsconfig-paths'
import tailwindcss from '@tailwindcss/vite'
import { copyCrosshairBackgrounds } from './tools/vite-plugin-copy-backgrounds';

const config = defineConfig(() => ({
  ssr: {
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

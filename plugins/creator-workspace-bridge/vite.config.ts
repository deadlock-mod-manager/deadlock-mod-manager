import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  root: "ui",
  base: "./",
  plugins: [react()],
  resolve: {
    dedupe: ["react", "react-dom"],
  },
  build: {
    outDir: "../dist/package/ui",
    emptyOutDir: true,
    assetsInlineLimit: 0,
    modulePreload: { polyfill: false },
    sourcemap: false,
    target: "es2022",
  },
});

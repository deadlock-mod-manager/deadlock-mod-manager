import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { Plugin } from "vite";

export const copyCrosshairBackgrounds = (): Plugin => {
  return {
    name: "copy-crosshair-backgrounds",
    buildStart() {
      const sourceDir = join(
        process.cwd(),
        "../../packages/crosshair/public/backgrounds",
      );
      const targetDir = join(process.cwd(), "public/backgrounds");

      if (!existsSync(sourceDir)) {
        return;
      }

      if (!existsSync(targetDir)) {
        mkdirSync(targetDir, { recursive: true });
      }

      const files = ["bg-1.jpg", "bg-2.jpg"];

      for (const file of files) {
        const sourcePath = join(sourceDir, file);
        const targetPath = join(targetDir, file);

        if (existsSync(sourcePath)) {
          copyFileSync(sourcePath, targetPath);
        }
      }
    },
  };
};

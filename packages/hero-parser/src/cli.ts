import { lstatSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createAppLogger } from "@deadlock-mods/logging";
import { parseVpkFile } from "@deadlock-mods/vpk-parser";
import { detectHero } from "./detect-hero";

const logger = createAppLogger({ app: "hero-parser" });

const inputPath = process.argv[2];

if (!inputPath) {
  logger.error("Usage: pnpm hero-parser <vpk-file-or-folder>");
  process.exit(1);
}

function collectVpkFiles(dirPath: string): string[] {
  return readdirSync(dirPath)
    .filter((f) => f.endsWith(".vpk"))
    .map((f) => join(dirPath, f));
}

function parseVpkEntries(vpkPath: string): string[] {
  logger.info(`Parsing VPK: ${vpkPath}`);
  const parsed = parseVpkFile(vpkPath, {
    includeFullFileHash: false,
    filePath: vpkPath,
    lastModified: null,
    includeMerkle: false,
    includeEntries: true,
  });
  return parsed.entries.map((e) => e.fullPath);
}

const stat = lstatSync(inputPath);
const vpkFiles = stat.isDirectory() ? collectVpkFiles(inputPath) : [inputPath];

if (vpkFiles.length === 0) {
  logger.error(`No .vpk files found in ${inputPath}`);
  process.exit(1);
}

logger.info(`Processing ${vpkFiles.length} VPK file(s)`);

const allPaths: string[] = [];
for (const vpkFile of vpkFiles) {
  const entries = parseVpkEntries(vpkFile);
  logger.info(`  ${vpkFile}: ${entries.length} entries`);
  allPaths.push(...entries);
}

logger.info(`Total entries: ${allPaths.length}`);

const result = detectHero(allPaths);

if (result.hero) {
  logger.info(`Detected hero: ${result.hero} (display: ${result.heroDisplay})`);
} else {
  logger.info("Detected hero: Other/Misc");
}

logger.info(
  `Internal names found: ${result.internalNames.join(", ") || "none"}`,
);
logger.info(`Category: ${result.category}`);

if (result.usesCriticalPaths) {
  logger.info(`Critical paths: ${result.criticalPaths.join(", ")}`);
}

import { createAppLogger } from "@deadlock-mods/logging";
import { parseVpkFile } from "@deadlock-mods/vpk-parser";
import { detectHero } from "./detect-hero";

const logger = createAppLogger({ app: "hero-parser" });

const filePath = process.argv[2];

if (!filePath) {
  logger.error("Usage: pnpm hero-parser <vpk-file-path>");
  process.exit(1);
}

logger.info(`Parsing VPK: ${filePath}`);

const parsed = parseVpkFile(filePath, {
  includeFullFileHash: false,
  filePath,
  lastModified: null,
  includeMerkle: false,
  includeEntries: true,
});

const paths = parsed.entries.map((e) => e.fullPath);
logger.info(`Entries found: ${paths.length}`);

const result = detectHero(paths);

if (result.hero) {
  logger.info(`Detected hero: ${result.hero} (display: ${result.heroDisplay})`);
} else {
  logger.info("Detected hero: Other/Misc");
}

logger.info(
  `Internal names found: ${result.internalNames.join(", ") || "none"}`,
);
logger.info(`Category: ${result.category}`);

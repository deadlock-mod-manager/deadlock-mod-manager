import { parseVpkFile } from "@deadlock-mods/vpk-parser";
import { detectHero } from "./detect-hero";

const filePath = process.argv[2];

if (!filePath) {
  console.error("Usage: pnpm hero-parser <vpk-file-path>");
  process.exit(1);
}

console.log(`Parsing VPK: ${filePath}`);

const parsed = parseVpkFile(filePath, {
  includeFullFileHash: false,
  filePath,
  lastModified: null,
  includeMerkle: false,
  includeEntries: true,
});

const paths = parsed.entries.map((e) => e.fullPath);
console.log(`Entries found: ${paths.length}`);

const result = detectHero(paths);

if (result.hero) {
  console.log(`Detected hero: ${result.hero} (display: ${result.heroDisplay})`);
} else {
  console.log("Detected hero: Other/Misc");
}

console.log(
  `Internal names found: ${result.internalNames.join(", ") || "none"}`,
);
console.log(`Category: ${result.category}`);

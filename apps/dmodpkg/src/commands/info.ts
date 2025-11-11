import { getPackageInfo } from "@deadlock-mods/dmodpkg";
import chalk from "chalk";
import { logger } from "../utils/logger";

/**
 * Display package information
 */
export async function infoCommand(
  packagePath: string,
  options?: {
    json?: boolean;
    verbose?: boolean;
  },
) {
  try {
    logger.withMetadata({ packagePath }).info("Reading package information");

    const info = await getPackageInfo(packagePath);

    if (options?.json) {
      console.log(JSON.stringify(info, null, 2));
      return;
    }

    // Display formatted output
    console.log();
    console.log(
      chalk.bold.cyan(`${info.config.displayName} v${info.config.version}`),
    );
    console.log("=".repeat(60));
    console.log();

    console.log(chalk.bold("Description:"));
    console.log(`  ${info.config.description}`);
    console.log();

    console.log(chalk.bold("Authors:"));
    for (const author of info.config.authors) {
      if (typeof author === "string") {
        console.log(`  • ${author}`);
      } else if ("name" in author) {
        console.log(
          `  • ${author.name}${author.role ? ` (${author.role})` : ""}`,
        );
      }
    }
    console.log();

    if (info.config.license) {
      console.log(chalk.bold("License:"), info.config.license);
      console.log();
    }

    if (info.config.gameVersion) {
      console.log(chalk.bold("Game Version:"), info.config.gameVersion);
      console.log();
    }

    console.log(chalk.bold("Layers:"));
    for (const layer of info.layers) {
      const required = layer.required ? chalk.red("[required]") : "";
      console.log(
        `  • ${layer.name} (priority ${layer.priority}) - ${layer.fileCount} files, ${formatBytes(layer.totalSize)} ${required}`,
      );
    }
    console.log();

    if (info.config.variantGroups && info.config.variantGroups.length > 0) {
      console.log(chalk.bold("Variant Groups:"));
      for (const group of info.config.variantGroups) {
        console.log(`  ${group.name} (default: ${group.default})`);
        for (const variant of group.variants) {
          console.log(`    • ${variant.id} - ${variant.name}`);
        }
      }
      console.log();
    }

    console.log(chalk.bold("Package Info:"));
    console.log(`  Files: ${info.stats.fileCount}`);
    console.log(`  Chunks: ${info.stats.chunkCount}`);
    console.log(`  Package Size: ${formatBytes(info.stats.totalSize)}`);
    console.log(
      `  Uncompressed Size: ${formatBytes(info.stats.uncompressedSize)}`,
    );
    console.log(
      `  Compression Ratio: ${((1 - info.stats.compressionRatio) * 100).toFixed(1)}%`,
    );
    console.log();

    if (options?.verbose) {
      console.log(chalk.bold("Build Info:"));
      console.log(`  Builder Version: ${info.buildInfo.builderVersion}`);
      console.log(`  Build Time: ${info.buildInfo.buildTimestamp}`);
      console.log(`  Platform: ${info.buildInfo.platform}`);
      console.log();
    }

    logger.info("Package information displayed");
  } catch (error) {
    logger.withError(error as Error).error("Failed to read package info");
    throw error;
  }
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${Number.parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`;
}

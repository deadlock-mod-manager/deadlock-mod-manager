import { packMod } from "@deadlock-mods/dmodpkg";
import chalk from "chalk";
import ora from "ora";
import { logger } from "../utils/logger";

/**
 * Package a mod project into .dmodpkg
 */
export async function packCommand(options?: {
  config?: string;
  output?: string;
  compression?: string;
  chunkSize?: string;
  validate?: boolean;
  sign?: string;
}) {
  const spinner = ora("Packing mod...").start();

  try {
    const projectPath = process.cwd();
    const compressionLevel = options?.compression
      ? Number.parseInt(options.compression, 10)
      : 9;
    const chunkSize = options?.chunkSize
      ? parseSize(options.chunkSize)
      : 1024 * 1024;

    logger
      .withMetadata({
        projectPath,
        compressionLevel,
        chunkSize,
      })
      .info("Starting pack operation");

    // Don't pass output path - let Rust handle default build directory creation
    const result = await packMod(projectPath, undefined, {
      compressionLevel,
      chunkSize,
      skipValidation: options?.validate === false,
    });

    spinner.succeed(chalk.green("Mod packed successfully!"));

    // Display results
    console.log();
    console.log(chalk.bold("Package Information:"));
    console.log(`  Path: ${chalk.cyan(result.packagePath)}`);
    console.log(`  Files: ${chalk.cyan(result.fileCount.toString())}`);
    console.log(
      `  Uncompressed: ${chalk.cyan(formatBytes(result.uncompressedSize))}`,
    );
    console.log(
      `  Compressed: ${chalk.cyan(formatBytes(result.compressedSize))}`,
    );
    console.log(
      `  Compression: ${chalk.cyan(`${((1 - result.compressionRatio) * 100).toFixed(1)}%`)}`,
    );

    if (result.warnings.length > 0) {
      console.log();
      console.log(chalk.yellow("Warnings:"));
      for (const warning of result.warnings) {
        console.log(chalk.yellow(`  ⚠ ${warning}`));
      }
    }

    logger
      .withMetadata({
        packagePath: result.packagePath,
        fileCount: result.fileCount,
        compressionRatio: result.compressionRatio,
      })
      .info("Pack operation completed");
  } catch (error) {
    spinner.fail(chalk.red("Failed to pack mod"));
    logger.withError(error as Error).error("Pack operation failed");
    throw error;
  }
}

function parseSize(size: string): number {
  const units: Record<string, number> = {
    B: 1,
    KB: 1024,
    MB: 1024 * 1024,
    GB: 1024 * 1024 * 1024,
  };

  const match = size.match(/^(\d+(?:\.\d+)?)\s*([A-Z]+)?$/i);
  if (!match) {
    throw new Error(`Invalid size format: ${size}`);
  }

  const value = Number.parseFloat(match[1]);
  const unit = (match[2] || "B").toUpperCase();

  if (!(unit in units)) {
    throw new Error(`Unknown size unit: ${unit}`);
  }

  return Math.floor(value * units[unit]);
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${Number.parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`;
}

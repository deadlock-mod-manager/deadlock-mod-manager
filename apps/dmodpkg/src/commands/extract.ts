import { extractMod } from "@deadlock-mods/dmodpkg";
import chalk from "chalk";
import ora from "ora";
import { logger } from "../utils/logger";

/**
 * Extract a .dmodpkg package
 */
export async function extractCommand(
  packagePath: string,
  options?: {
    output?: string;
    layers?: string;
    verify?: boolean;
    decompress?: boolean;
  },
) {
  const spinner = ora("Extracting package...").start();

  try {
    const layers = options?.layers?.split(",").map((l) => l.trim());

    logger
      .withMetadata({
        packagePath,
        outputPath: options?.output,
        layers,
      })
      .info("Starting extract operation");

    const result = await extractMod(packagePath, options?.output, {
      verifyChecksums: options?.verify !== false,
      layers: layers || [],
      overwrite: true,
    });

    spinner.succeed(chalk.green("Package extracted successfully!"));

    // Display results
    console.log();
    console.log(chalk.bold("Extraction Information:"));
    console.log(`  Project Path: ${chalk.cyan(result.projectPath)}`);
    console.log(
      `  Files Extracted: ${chalk.cyan(result.filesExtracted.toString())}`,
    );
    console.log(
      `  Bytes Extracted: ${chalk.cyan(formatBytes(result.bytesExtracted))}`,
    );
    console.log(`  Layers: ${chalk.cyan(result.layersExtracted.join(", "))}`);

    logger
      .withMetadata({
        projectPath: result.projectPath,
        filesExtracted: result.filesExtracted,
      })
      .info("Extract operation completed");
  } catch (error) {
    spinner.fail(chalk.red("Failed to extract package"));
    logger.withError(error as Error).error("Extract operation failed");
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

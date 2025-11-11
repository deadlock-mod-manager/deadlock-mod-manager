import { validateProject } from "@deadlock-mods/dmodpkg";
import chalk from "chalk";
import { logger } from "../utils/logger";

/**
 * Validate a mod project or package
 */
export async function validateCommand(
  target?: string,
  options?: {
    strict?: boolean;
    schema?: string;
  },
) {
  try {
    const projectPath = target || process.cwd();

    logger
      .withMetadata({ projectPath, strict: options?.strict })
      .info("Starting validation");

    const result = await validateProject(projectPath, {
      strict: options?.strict || false,
    });

    console.log();
    if (result.valid) {
      console.log(chalk.green("✓ Validation passed"));
    } else {
      console.log(chalk.red("✗ Validation failed"));
    }
    console.log();

    if (result.warnings.length > 0) {
      console.log(chalk.yellow("Warnings:"));
      for (const warning of result.warnings) {
        console.log(chalk.yellow(`  ⚠ ${warning.message}`));
      }
      console.log();
    }

    if (result.errors.length > 0) {
      console.log(chalk.red("Errors:"));
      for (const error of result.errors) {
        console.log(chalk.red(`  ✗ ${error}`));
      }
      console.log();
    }

    logger
      .withMetadata({
        valid: result.valid,
        warningCount: result.warnings.length,
        errorCount: result.errors.length,
      })
      .info("Validation completed");

    if (!result.valid) {
      process.exit(1);
    }
  } catch (error) {
    logger.withError(error as Error).error("Validation failed");
    throw error;
  }
}

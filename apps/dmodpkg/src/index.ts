#!/usr/bin/env bun

import { VERSION } from "@deadlock-mods/dmodpkg";
import { Command } from "commander";

const program = new Command();

program
  .name("dmodpkg")
  .description(
    "Deadlock mod package CLI scaffold; commands are not implemented",
  )
  .version(VERSION);

// TODO: Import and register commands
// import { initCommand } from "./commands/init";
// import { packCommand } from "./commands/pack";
// import { extractCommand } from "./commands/extract";
// import { infoCommand } from "./commands/info";
// import { validateCommand } from "./commands/validate";
// import { migrateCommand } from "./commands/migrate";

// Placeholder commands - to be implemented
const notImplemented = (command: string) => () => {
  program.error(`dmodpkg ${command}: not implemented yet`);
};

program
  .command("init [project-name]")
  .description("Initialize a new mod project (not implemented)")
  .option(
    "--template <name>",
    "Use project template (basic, advanced, multilayer)",
  )
  .option("--author <name>", "Set author name")
  .option("--license <spdx>", "Set license (default: MIT)")
  .option("-i, --interactive", "Interactive project setup")
  .action(notImplemented("init"));

program
  .command("pack")
  .description("Package a mod project into .dmodpkg (not implemented)")
  .option("--config <path>", "Path to mod.config.json", "./mod.config.json")
  .option("--output <path>", "Output directory", "./build")
  .option("--compression <n>", "Zstd compression level 1-22", "9")
  .option("--chunk-size <size>", "Chunk size", "1MB")
  .option("--no-validate", "Skip validation checks")
  .option("--sign <key>", "Sign package with private key")
  .action(notImplemented("pack"));

program
  .command("extract <package>")
  .description("Extract a .dmodpkg package (not implemented)")
  .option("--output <path>", "Output directory")
  .option("--layers <names>", "Extract specific layers (comma-separated)")
  .option("--verify", "Verify checksums during extraction")
  .option("--no-decompress", "Extract without decompressing")
  .action(notImplemented("extract"));

program
  .command("info <package>")
  .description("Display package information (not implemented)")
  .option("--json", "Output as JSON")
  .option("-v, --verbose", "Show detailed information")
  .action(notImplemented("info"));

program
  .command("validate [target]")
  .description("Validate a mod project or package (not implemented)")
  .option("--strict", "Enable strict validation mode")
  .option("--schema <version>", "Schema version to validate against")
  .action(notImplemented("validate"));

program
  .command("migrate <archive>")
  .description("Migrate from legacy archive formats (not implemented)")
  .option("--output <path>", "Output project directory")
  .option("--auto-detect", "Attempt to auto-detect variants")
  .option("--template <name>", "Use migration template")
  .action(notImplemented("migrate"));

// Bundle commands
const bundle = program
  .command("bundle")
  .description("Manage mod bundles (not implemented)");

bundle
  .command("pack")
  .description("Create a bundle from multiple mod packages (not implemented)")
  .option(
    "--config <path>",
    "Path to bundle.config.json",
    "./bundle.config.json",
  )
  .option("--output <path>", "Output directory", "./build")
  .option("--no-validate", "Skip validation checks")
  .action(notImplemented("bundle pack"));

bundle
  .command("extract <bundle>")
  .description(
    "Extract individual mod packages from a bundle (not implemented)",
  )
  .option("--output <path>", "Output directory")
  .option("--packages <names>", "Extract specific packages (comma-separated)")
  .option("--all", "Extract all packages (default)")
  .action(notImplemented("bundle extract"));

bundle
  .command("info <bundle>")
  .description("Display bundle information (not implemented)")
  .option("--json", "Output as JSON")
  .option("-v, --verbose", "Show detailed information")
  .action(notImplemented("bundle info"));

bundle
  .command("validate [target]")
  .description("Validate a bundle project or package (not implemented)")
  .option("--strict", "Enable strict validation mode")
  .action(notImplemented("bundle validate"));

program.parse();

#!/usr/bin/env bun

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const getCommitHash = (): string => {
  try {
    return execSync("git rev-parse --short HEAD").toString().trim();
  } catch (error) {
    console.error("Failed to get git commit hash:", error);
    process.exit(1);
  }
};

const updatePackageJson = (commitHash: string): string => {
  const packageJsonPath = join(
    process.cwd(),
    "apps",
    "desktop",
    "package.json",
  );
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));

  const baseVersion = packageJson.version;
  const nightlyVersion = `${baseVersion}-${commitHash}`;

  packageJson.version = nightlyVersion;

  writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);

  console.log(
    `Updated package.json version: ${baseVersion} -> ${nightlyVersion}`,
  );

  return nightlyVersion;
};

const updateCargoToml = (commitHash: string): void => {
  const cargoTomlPath = join(
    process.cwd(),
    "apps",
    "desktop",
    "src-tauri",
    "Cargo.toml",
  );
  const cargoToml = readFileSync(cargoTomlPath, "utf-8");

  const versionRegex = /^version = "([^"]+)"/m;
  const match = cargoToml.match(versionRegex);

  if (!match) {
    console.error("Failed to find version in Cargo.toml");
    process.exit(1);
  }

  const baseVersion = match[1];
  const nightlyVersion = `${baseVersion}-${commitHash}`;

  const updatedCargoToml = cargoToml.replace(
    versionRegex,
    `version = "${nightlyVersion}"`,
  );

  writeFileSync(cargoTomlPath, updatedCargoToml);

  console.log(
    `Updated Cargo.toml version: ${baseVersion} -> ${nightlyVersion}`,
  );
};

const main = () => {
  const commitHash = process.argv[2] || getCommitHash();

  console.log(`Updating versions with commit hash: ${commitHash}`);

  const version = updatePackageJson(commitHash);
  updateCargoToml(commitHash);

  console.log(`✓ Successfully updated all versions to include commit hash`);
  console.log(`  Final version: ${version}`);
};

main();

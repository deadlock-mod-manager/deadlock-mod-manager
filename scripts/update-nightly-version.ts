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

const getDateStamp = (): string => {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const day = String(now.getUTCDate()).padStart(2, "0");
  return `${year}${month}${day}`;
};

const isReleased = (version: string): boolean => {
  try {
    return (
      execSync(`git ls-remote --tags origin refs/tags/v${version}`)
        .toString()
        .trim() !== ""
    );
  } catch (error) {
    console.error("Failed to query release tags:", error);
    process.exit(1);
  }
};

// Bump minor only once released, so nightlies always sort above stable.
const resolveNightlyBase = (version: string): string => {
  if (!isReleased(version)) {
    return version;
  }
  const [major, minor] = version.split(".").map(Number);
  return `${major}.${minor + 1}.0`;
};

const buildNightlyVersion = (base: string, commitHash: string): string =>
  `${base}-nightly.${getDateStamp()}.${commitHash}`;

const updatePackageJson = (commitHash: string): string => {
  const packageJsonPath = join(
    process.cwd(),
    "apps",
    "desktop",
    "package.json",
  );
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));

  const baseVersion = packageJson.version;
  const nightlyVersion = buildNightlyVersion(
    resolveNightlyBase(baseVersion),
    commitHash,
  );

  packageJson.version = nightlyVersion;

  writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);

  console.log(
    `Updated package.json version: ${baseVersion} -> ${nightlyVersion}`,
  );

  return nightlyVersion;
};

const updateCargoToml = (nightlyVersion: string): void => {
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
  updateCargoToml(version);

  console.log(`Successfully updated all versions`);
  console.log(`  Final version: ${version}`);
};

main();

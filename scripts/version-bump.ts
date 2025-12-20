#!/usr/bin/env bun

/**
 * Version Bump Script
 *
 * This script is run after `pnpm changeset version` to:
 * 1. Sync the desktop package.json version to Cargo.toml
 * 2. Generate/update the "What's New" translations for the new version
 *
 * Usage: bun scripts/version-bump.ts [--generate-whats-new]
 */

import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const DESKTOP_PACKAGE_JSON = join(
  process.cwd(),
  "apps",
  "desktop",
  "package.json",
);
const CARGO_TOML = join(
  process.cwd(),
  "apps",
  "desktop",
  "src-tauri",
  "Cargo.toml",
);
const CHANGELOG_PATH = join(process.cwd(), "apps", "desktop", "CHANGELOG.md");
const EN_TRANSLATION_PATH = join(
  process.cwd(),
  "apps",
  "desktop",
  "src",
  "locales",
  "en",
  "translation.json",
);

interface WhatsNewVersion {
  title: string;
  features: string[];
}

interface TranslationFile {
  whatsNew: {
    versions: Record<string, WhatsNewVersion>;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

/**
 * Get the current version from package.json
 */
function getPackageVersion(): string {
  const packageJson = JSON.parse(readFileSync(DESKTOP_PACKAGE_JSON, "utf-8"));
  return packageJson.version;
}

/**
 * Get the current version from Cargo.toml
 */
function getCargoVersion(): string {
  const cargoToml = readFileSync(CARGO_TOML, "utf-8");
  const match = cargoToml.match(/^version = "([^"]+)"/m);
  if (!match) {
    throw new Error("Could not find version in Cargo.toml");
  }
  return match[1];
}

/**
 * Update Cargo.toml with the new version
 */
function updateCargoVersion(newVersion: string): void {
  const cargoToml = readFileSync(CARGO_TOML, "utf-8");
  const updatedCargoToml = cargoToml.replace(
    /^version = "[^"]+"/m,
    `version = "${newVersion}"`,
  );
  writeFileSync(CARGO_TOML, updatedCargoToml);
  console.log(`Updated Cargo.toml version to ${newVersion}`);
}

/**
 * Parse the CHANGELOG.md to extract features for a specific version
 */
function parseChangelogForVersion(version: string): WhatsNewVersion | null {
  if (!existsSync(CHANGELOG_PATH)) {
    console.warn("CHANGELOG.md not found");
    return null;
  }

  const changelog = readFileSync(CHANGELOG_PATH, "utf-8");
  const lines = changelog.split("\n");

  let inTargetVersion = false;
  let title = "";
  const features: string[] = [];
  let currentSection = "";

  for (const line of lines) {
    // Check for version header (## X.X.X)
    if (line.match(/^## \d+\.\d+\.\d+/)) {
      const versionMatch = line.match(/^## (\d+\.\d+\.\d+)/);
      if (versionMatch) {
        if (inTargetVersion) {
          // We've reached the next version, stop parsing
          break;
        }
        if (versionMatch[1] === version) {
          inTargetVersion = true;
          continue;
        }
      }
    }

    if (!inTargetVersion) continue;

    // Check for section headers (### Minor Changes, ### Patch Changes)
    if (line.startsWith("### ")) {
      currentSection = line.replace("### ", "").trim();
      continue;
    }

    // Parse list items
    if (line.startsWith("- ") && currentSection) {
      let feature = line.substring(2).trim();

      // Skip dependency update lines
      if (
        feature.startsWith("Updated dependencies") ||
        feature.startsWith("@deadlock-mods/")
      ) {
        continue;
      }

      // Remove commit hashes (e.g., "f48352c: ")
      feature = feature.replace(/^[a-f0-9]+: /, "");

      // Skip empty features
      if (feature.length > 0) {
        features.push(feature);
      }
    }
  }

  if (features.length === 0) {
    return null;
  }

  // Generate a title from the first feature or use a default
  title = generateTitle(features, version);

  return { title, features: formatFeaturesForWhatsNew(features) };
}

/**
 * Generate a title from the features
 */
function generateTitle(features: string[], version: string): string {
  // Try to extract key themes from features
  const themes: string[] = [];

  for (const feature of features) {
    const lowerFeature = feature.toLowerCase();

    if (lowerFeature.includes("auth")) themes.push("Auth");
    if (lowerFeature.includes("crosshair")) themes.push("Crosshairs");
    if (lowerFeature.includes("plugin")) themes.push("Plugins");
    if (lowerFeature.includes("profile")) themes.push("Profiles");
    if (lowerFeature.includes("theme")) themes.push("Themes");
    if (lowerFeature.includes("download")) themes.push("Downloads");
    if (lowerFeature.includes("vpk")) themes.push("VPK");
    if (lowerFeature.includes("language") || lowerFeature.includes("i18n"))
      themes.push("Localization");
    if (lowerFeature.includes("developer") || lowerFeature.includes("dev mode"))
      themes.push("Developer Tools");
    if (lowerFeature.includes("fix")) themes.push("Bug Fixes");
    if (
      lowerFeature.includes("performance") ||
      lowerFeature.includes("improve")
    )
      themes.push("Improvements");
  }

  // Deduplicate themes
  const uniqueThemes = [...new Set(themes)];

  if (uniqueThemes.length === 0) {
    return `Version ${version} Updates`;
  }

  if (uniqueThemes.length <= 3) {
    return uniqueThemes.join(" & ");
  }

  return `${uniqueThemes.slice(0, 2).join(", ")} & More`;
}

/**
 * Format features for the What's New dialog with emojis
 */
function formatFeaturesForWhatsNew(features: string[]): string[] {
  return features.map((feature) => {
    // Already has emoji
    if (/^[\u{1F300}-\u{1F9FF}]/u.test(feature)) {
      return feature;
    }

    const lowerFeature = feature.toLowerCase();

    // Add appropriate emoji based on content
    if (lowerFeature.includes("fix")) return `🔧 ${feature}`;
    if (lowerFeature.includes("auth")) return `🔒 ${feature}`;
    if (lowerFeature.includes("crosshair")) return `🎯 ${feature}`;
    if (lowerFeature.includes("plugin")) return `🔌 ${feature}`;
    if (lowerFeature.includes("theme")) return `🎨 ${feature}`;
    if (lowerFeature.includes("profile")) return `📁 ${feature}`;
    if (lowerFeature.includes("download")) return `📥 ${feature}`;
    if (lowerFeature.includes("vpk")) return `📦 ${feature}`;
    if (lowerFeature.includes("language") || lowerFeature.includes("japanese"))
      return `🌐 ${feature}`;
    if (lowerFeature.includes("developer") || lowerFeature.includes("dev"))
      return `🛠️ ${feature}`;
    if (lowerFeature.includes("performance")) return `⚡ ${feature}`;
    if (lowerFeature.includes("ui") || lowerFeature.includes("ux"))
      return `✨ ${feature}`;
    if (lowerFeature.includes("security")) return `🛡️ ${feature}`;
    if (lowerFeature.includes("add") || lowerFeature.includes("new"))
      return `✨ ${feature}`;

    return `🔧 ${feature}`;
  });
}

/**
 * Update the English translation file with the new version's What's New content
 */
function updateWhatsNewTranslation(
  version: string,
  content: WhatsNewVersion,
): void {
  if (!existsSync(EN_TRANSLATION_PATH)) {
    console.error("English translation file not found");
    return;
  }

  const translation: TranslationFile = JSON.parse(
    readFileSync(EN_TRANSLATION_PATH, "utf-8"),
  );

  // Check if version already exists
  if (translation.whatsNew?.versions?.[version]) {
    console.log(
      `What's New for version ${version} already exists, skipping...`,
    );
    return;
  }

  // Ensure the structure exists
  if (!translation.whatsNew) {
    translation.whatsNew = { versions: {} } as TranslationFile["whatsNew"];
  }
  if (!translation.whatsNew.versions) {
    translation.whatsNew.versions = {};
  }

  // Add the new version at the top by recreating the versions object
  const existingVersions = translation.whatsNew.versions;
  translation.whatsNew.versions = {
    [version]: content,
    ...existingVersions,
  };

  writeFileSync(
    EN_TRANSLATION_PATH,
    `${JSON.stringify(translation, null, 2)}\n`,
  );
  console.log(`Updated What's New for version ${version}`);
}

/**
 * Get recent git commits since last tag
 */
function getRecentCommits(): string[] {
  try {
    const lastTag = execSync(
      "git describe --tags --abbrev=0 2>/dev/null || echo ''",
      {
        encoding: "utf-8",
      },
    ).trim();

    const range = lastTag ? `${lastTag}..HEAD` : "HEAD~10..HEAD";
    const commits = execSync(
      `git log ${range} --pretty=format:"%s" --no-merges 2>/dev/null || echo ''`,
      { encoding: "utf-8" },
    )
      .trim()
      .split("\n")
      .filter((c) => c.length > 0);

    return commits;
  } catch {
    return [];
  }
}

/**
 * Main function
 */
function main(): void {
  const args = process.argv.slice(2);
  const generateWhatsNew = args.includes("--generate-whats-new");
  const dryRun = args.includes("--dry-run");

  console.log("=== Version Bump Script ===\n");

  // Step 1: Get versions
  const packageVersion = getPackageVersion();
  const cargoVersion = getCargoVersion();

  console.log(`Package.json version: ${packageVersion}`);
  console.log(`Cargo.toml version: ${cargoVersion}`);

  // Step 2: Sync Cargo.toml if needed
  if (packageVersion !== cargoVersion) {
    console.log(`\nVersion mismatch detected!`);
    if (dryRun) {
      console.log(`[DRY RUN] Would update Cargo.toml to ${packageVersion}`);
    } else {
      updateCargoVersion(packageVersion);
    }
  } else {
    console.log(`\nVersions are in sync.`);
  }

  // Step 3: Generate What's New content
  if (generateWhatsNew) {
    console.log(`\n=== Generating What's New Content ===\n`);

    const changelogContent = parseChangelogForVersion(packageVersion);

    if (changelogContent) {
      console.log(`Generated title: ${changelogContent.title}`);
      console.log(`Features (${changelogContent.features.length}):`);
      for (const f of changelogContent.features) {
        console.log(`  - ${f}`);
      }

      if (dryRun) {
        console.log(`\n[DRY RUN] Would update translation file`);
      } else {
        updateWhatsNewTranslation(packageVersion, changelogContent);
      }
    } else {
      console.log(`No changelog content found for version ${packageVersion}`);
      console.log(`Falling back to git commits...`);

      const commits = getRecentCommits();
      if (commits.length > 0) {
        const content: WhatsNewVersion = {
          title: `Version ${packageVersion}`,
          features: formatFeaturesForWhatsNew(
            commits.slice(0, 8).map((c) => {
              // Clean up conventional commit format
              return c.replace(
                /^(feat|fix|chore|docs|refactor|perf|test)\(.*?\): /,
                "",
              );
            }),
          ),
        };

        console.log(`Generated from ${commits.length} commits:`);
        for (const f of content.features) {
          console.log(`  - ${f}`);
        }

        if (dryRun) {
          console.log(`\n[DRY RUN] Would update translation file`);
        } else {
          updateWhatsNewTranslation(packageVersion, content);
        }
      } else {
        console.log(`No commits found to generate What's New content`);
      }
    }
  }

  console.log(`\n=== Done ===`);
}

main();

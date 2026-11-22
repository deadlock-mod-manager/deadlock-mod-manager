#!/usr/bin/env bun

/**
 * Version all packages except the desktop app.
 *
 * Desktop-only changesets are moved out before versioning and restored after,
 * so they remain for a later release. Mixed changesets (desktop + other packages)
 * are split: non-desktop packages get versioned now, desktop entries are
 * preserved for later.
 *
 * Usage: bun scripts/version-without-desktop.ts
 */

import { execSync } from "node:child_process";
import {
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

const CHANGESET_DIR = join(process.cwd(), ".changeset");
const TEMP_DIR = join(process.cwd(), ".changeset-temp");
const DESKTOP_PACKAGE = "@deadlock-mods/desktop";

interface ChangesetFrontmatter {
  packages: Record<string, string>;
}

function parseFrontmatter(content: string): {
  frontmatter: ChangesetFrontmatter;
  body: string;
} {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) {
    throw new Error("Invalid changeset format: missing frontmatter");
  }
  const frontmatterText = match[1];
  const body = match[2].trim();

  const packages: Record<string, string> = {};
  for (const line of frontmatterText.split("\n")) {
    const lineMatch = line.match(/^"([^"]+)":\s*(\S+)$/);
    if (lineMatch) {
      packages[lineMatch[1]] = lineMatch[2];
    }
  }
  return { frontmatter: { packages }, body };
}

function serializeFrontmatter(
  packages: Record<string, string>,
  body: string,
): string {
  const lines = Object.entries(packages)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([pkg, type]) => `"${pkg}": ${type}`);
  return `---\n${lines.join("\n")}\n---\n\n${body}`;
}

function hasDesktop(packages: Record<string, string>): boolean {
  return DESKTOP_PACKAGE in packages;
}

function isDesktopOnly(packages: Record<string, string>): boolean {
  return Object.keys(packages).length === 1 && hasDesktop(packages);
}

function main(): void {
  rmSync(TEMP_DIR, { recursive: true, force: true });
  mkdirSync(TEMP_DIR, { recursive: true });

  const files = readdirSync(CHANGESET_DIR).filter(
    (f) => f.endsWith(".md") && f !== "README.md",
  );

  for (const filename of files) {
    const filepath = join(CHANGESET_DIR, filename);
    const content = readFileSync(filepath, "utf-8");
    const { frontmatter, body } = parseFrontmatter(content);
    const { packages } = frontmatter;

    if (!hasDesktop(packages)) {
      continue;
    }

    if (isDesktopOnly(packages)) {
      const tempPath = join(TEMP_DIR, filename);
      writeFileSync(tempPath, content);
      rmSync(filepath);
      continue;
    }

    const packagesWithoutDesktop = { ...packages };
    delete packagesWithoutDesktop[DESKTOP_PACKAGE];

    const desktopOnlyPackages = {
      [DESKTOP_PACKAGE]: packages[DESKTOP_PACKAGE],
    };
    const desktopOnlyContent = serializeFrontmatter(desktopOnlyPackages, body);
    writeFileSync(join(TEMP_DIR, filename), desktopOnlyContent);

    const withoutDesktopContent = serializeFrontmatter(
      packagesWithoutDesktop,
      body,
    );
    writeFileSync(filepath, withoutDesktopContent);
  }

  execSync("pnpm changeset version", {
    stdio: "inherit",
    cwd: process.cwd(),
  });

  const tempFiles = readdirSync(TEMP_DIR);
  for (const filename of tempFiles) {
    const tempPath = join(TEMP_DIR, filename);
    const destPath = join(CHANGESET_DIR, filename);
    const content = readFileSync(tempPath, "utf-8");
    writeFileSync(destPath, content);
  }
  rmSync(TEMP_DIR, { recursive: true, force: true });
}

main();

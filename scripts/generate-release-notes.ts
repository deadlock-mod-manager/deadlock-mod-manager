#!/usr/bin/env bun

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

interface ReleaseNotesOptions {
  version: string;
  previousTag?: string;
  changelogPath?: string;
  includeCommits?: boolean;
}

const extractLatestChangelog = (
  changelogPath: string,
  version: string,
): string | null => {
  try {
    const changelogContent = readFileSync(changelogPath, "utf-8");
    const lines = changelogContent.split("\n");

    let inVersionSection = false;
    const sectionContent: string[] = [];
    const versionHeaderRegex = new RegExp(
      `^##\\s+${version.replace(/\./g, "\\.")}\\s*$`,
    );

    for (const line of lines) {
      if (versionHeaderRegex.test(line)) {
        inVersionSection = true;
        continue;
      }

      if (inVersionSection) {
        if (line.startsWith("## ")) {
          break;
        }
        sectionContent.push(line);
      }
    }

    if (sectionContent.length === 0) {
      return null;
    }

    return sectionContent.join("\n").trim();
  } catch (error) {
    console.error(`Failed to read changelog: ${error}`);
    return null;
  }
};

const getCommitList = (previousTag?: string): string => {
  try {
    let commitRange = "HEAD";
    if (previousTag) {
      commitRange = `${previousTag}..HEAD`;
    }

    const commits = execSync(
      `git log ${commitRange} --pretty=format:"- %s (%h)" --no-merges`,
      { encoding: "utf-8" },
    ).trim();

    return commits || "No commits found";
  } catch (error) {
    console.error(`Failed to get commit list: ${error}`);
    return "Failed to retrieve commit list";
  }
};

const getPreviousTag = (currentVersion: string): string | null => {
  try {
    const tags = execSync("git tag --sort=-version:refname", {
      encoding: "utf-8",
    })
      .trim()
      .split("\n")
      .filter((tag) => tag.trim().length > 0);

    const currentTagVariants = [`v${currentVersion}`, currentVersion];

    for (const tag of tags) {
      if (!currentTagVariants.includes(tag)) {
        return tag;
      }
    }

    return null;
  } catch (error) {
    console.error(`Failed to get previous tag: ${error}`);
    return null;
  }
};

export const generateReleaseNotes = (options: ReleaseNotesOptions): string => {
  const {
    version,
    previousTag: providedPreviousTag,
    changelogPath = join(process.cwd(), "apps", "desktop", "CHANGELOG.md"),
    includeCommits = true,
  } = options;

  const sections: string[] = [];

  sections.push(`# Release ${version}\n`);

  const changelog = extractLatestChangelog(changelogPath, version);
  if (changelog) {
    sections.push("## 📝 Changelog\n");
    sections.push(changelog);
    sections.push("");
  }

  if (includeCommits) {
    const previousTag = providedPreviousTag || getPreviousTag(version);

    if (previousTag) {
      sections.push(`## 📋 Commits since ${previousTag}\n`);
    } else {
      sections.push("## 📋 All Commits\n");
    }

    const commits = getCommitList(previousTag || undefined);
    sections.push(commits);
    sections.push("");
  }

  sections.push(
    "---\n*This release was generated automatically using GitHub Actions.*",
  );

  return sections.join("\n");
};

const main = () => {
  const version = process.argv[2];
  const previousTag = process.argv[3];

  if (!version) {
    console.error("Usage: generate-release-notes.ts <version> [previousTag]");
    process.exit(1);
  }

  const releaseNotes = generateReleaseNotes({
    version,
    previousTag,
  });

  console.log(releaseNotes);
};

if (import.meta.main) {
  main();
}

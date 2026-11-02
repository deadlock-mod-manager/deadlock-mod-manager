import { afterEach, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { findRecentReversions } from "../check-recent-reversions.mjs";

const repositories: string[] = [];

afterEach(() => {
  for (const cwd of repositories.splice(0)) {
    if (
      dirname(resolve(cwd)) !== resolve(tmpdir()) ||
      !basename(cwd).startsWith("dmm-reversion-")
    ) {
      throw new Error("Unexpected fixture cleanup path");
    }
    rmSync(cwd, { recursive: true, force: true });
  }
});

function repository() {
  const cwd = mkdtempSync(join(tmpdir(), "dmm-reversion-"));
  repositories.push(cwd);
  const git = (...args: string[]) =>
    execFileSync("git", args, {
      cwd,
      encoding: "utf8",
    }).trim();
  git("init", "--quiet");
  git("config", "user.name", "Recovery fixture");
  git("config", "user.email", "fixture@example.invalid");
  git("config", "commit.gpgsign", "false");
  git("config", "core.autocrlf", "false");
  const write = (file: string, contents: string) =>
    writeFileSync(join(cwd, file), contents);
  const commit = () => {
    git("add", "--all");
    git("commit", "--quiet", "-m", "fixture");
    return git("rev-parse", "HEAD");
  };
  return { cwd, git, write, commit };
}

test("warns when a recent addition disappears alongside unrelated work", () => {
  const repo = repository();
  repo.write("workflow.yml", "name: Build\n");
  repo.commit();
  repo.write("workflow.yml", "name: Build\nenvironment: Nightly\n");
  const base = repo.commit();
  repo.write("workflow.yml", "name: Build\n");
  repo.write("feature.txt", "a new feature\n");
  const head = repo.commit();
  expect(findRecentReversions({ cwd: repo.cwd, base, head })).toEqual([
    { path: "workflow.yml", commit: base },
  ]);
  const result = execFileSync(
    process.execPath,
    [resolve("scripts/check-recent-reversions.mjs"), base, head],
    { cwd: repo.cwd, encoding: "utf8" },
  );
  expect(result).toContain("::warning file=workflow.yml");
  expect(result).toContain("advisory only");
});

test("recognizes a complete replacement being reversed", () => {
  const repo = repository();
  repo.write("route with spaces.txt", "route: legacy\n");
  repo.commit();
  repo.write("route with spaces.txt", "route: preference\n");
  const base = repo.commit();
  repo.write("route with spaces.txt", "route: legacy\n");
  const head = repo.commit();
  expect(findRecentReversions({ cwd: repo.cwd, base, head })).toEqual([
    { path: "route with spaces.txt", commit: base },
  ]);
});

test("recognizes a recent deletion being undone", () => {
  const repo = repository();
  repo.write("settings.txt", "active: true\nobsolete: true\n");
  repo.commit();
  repo.write("settings.txt", "active: true\n");
  const base = repo.commit();
  repo.write("settings.txt", "active: true\nobsolete: true\n");
  const head = repo.commit();
  expect(findRecentReversions({ cwd: repo.cwd, base, head })).toEqual([
    { path: "settings.txt", commit: base },
  ]);
});

test("does not warn for unrelated edits that keep the recent feature", () => {
  const repo = repository();
  repo.write("settings.txt", "route: preference\n");
  const base = repo.commit();
  repo.write("settings.txt", "route: preference\nother: enabled\n");
  const head = repo.commit();
  expect(findRecentReversions({ cwd: repo.cwd, base, head })).toEqual([]);
});

test("does not mistake a replacement with new behavior for an exact reversal", () => {
  const repo = repository();
  repo.write("route with spaces.txt", "route: legacy\n");
  repo.commit();
  repo.write("route with spaces.txt", "route: preference\n");
  const base = repo.commit();
  repo.write("route with spaces.txt", "route: automatic\n");
  const head = repo.commit();
  expect(findRecentReversions({ cwd: repo.cwd, base, head })).toEqual([]);
});

test("reads quoted Git paths and escapes warning properties", () => {
  const repo = repository();
  const file = "route,é.txt";
  repo.write(file, "route: legacy\n");
  repo.commit();
  repo.write(file, "route: preference\n");
  const base = repo.commit();
  repo.write(file, "route: legacy\n");
  const head = repo.commit();
  expect(findRecentReversions({ cwd: repo.cwd, base, head })).toEqual([
    { path: file, commit: base },
  ]);
  const result = execFileSync(
    process.execPath,
    [resolve("scripts/check-recent-reversions.mjs"), base, head],
    { cwd: repo.cwd, encoding: "utf8" },
  );
  expect(result).toContain("::warning file=route%2Cé.txt");
});

test("does not warn when a release consumes a changeset", () => {
  const repo = repository();
  repo.write("version.txt", "1.0.0\n");
  repo.commit();
  mkdirSync(join(repo.cwd, ".changeset"));
  repo.write(".changeset/feature.md", "Describe the new feature.\n");
  const base = repo.commit();
  rmSync(join(repo.cwd, ".changeset/feature.md"));
  repo.write("changelog.txt", "Released the new feature.\n");
  const head = repo.commit();
  expect(findRecentReversions({ cwd: repo.cwd, base, head })).toEqual([]);
});

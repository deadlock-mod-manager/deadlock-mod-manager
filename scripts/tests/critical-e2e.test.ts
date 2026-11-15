import { afterEach, expect, test } from "bun:test";
import { execFileSync, spawnSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { requiresDesktopE2E } from "../select-critical-e2e.mjs";

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("selects desktop, dependency, build, and gate changes without a label", () => {
  for (const file of [
    "apps/desktop/src/hooks/use-nuke-reinstall.ts",
    "apps/desktop/src-tauri/src/mod_manager/mod.rs",
    "packages/shared/src/mod.ts",
    "tools/typescript/base.json",
    ".github/actions/setup-desktop-e2e/action.yml",
    ".github/workflows/ci.yml",
    ".github/workflows/desktop-e2e.yml",
    "scripts/select-critical-e2e.mjs",
    "pnpm-lock.yaml",
    "pnpm-workspace.yaml",
    "package.json",
    "turbo.json",
  ]) {
    expect(requiresDesktopE2E([file])).toBe(true);
  }
  expect(requiresDesktopE2E(["README.md", "apps/api/src/index.ts"])).toBe(
    false,
  );
  expect(requiresDesktopE2E([])).toBe(false);
});

test("git selection includes removed desktop files when renamed outside desktop", () => {
  const directory = mkdtempSync(join(tmpdir(), "dmm-critical-e2e-"));
  directories.push(directory);
  const git = (...args: string[]) =>
    execFileSync("git", args, { cwd: directory, encoding: "utf8" }).trim();
  git("init", "--quiet");
  git("config", "user.email", "fixture@example.invalid");
  git("config", "user.name", "Fixture");
  git("config", "commit.gpgsign", "false");
  mkdirSync(join(directory, "apps/desktop"), { recursive: true });
  writeFileSync(
    join(directory, "apps/desktop/example.ts"),
    "export const value = 1;\n",
  );
  git("add", ".");
  git("-c", "core.hooksPath=", "commit", "--quiet", "-m", "initial fixture");
  const base = git("rev-parse", "HEAD");
  renameSync(
    join(directory, "apps/desktop/example.ts"),
    join(directory, "example.ts"),
  );
  git("add", "-A");
  git(
    "-c",
    "core.hooksPath=",
    "commit",
    "--quiet",
    "-m",
    "move outside desktop",
  );
  const head = git("rev-parse", "HEAD");
  const output = join(directory, "output.txt");
  const run = (baseSha: string, headSha: string) => {
    writeFileSync(output, "");
    return spawnSync(
      process.execPath,
      [resolve(import.meta.dir, "../select-critical-e2e.mjs")],
      {
        cwd: directory,
        encoding: "utf8",
        env: {
          ...process.env,
          BASE_SHA: baseSha,
          HEAD_SHA: headSha,
          GITHUB_OUTPUT: output,
        },
      },
    );
  };
  expect(run(base, head).status).toBe(0);
  expect(readFileSync(output, "utf8")).toBe("required=true\n");
  expect(run(head, head).status).toBe(0);
  expect(readFileSync(output, "utf8")).toBe("required=false\n");
  expect(run("", head).status).toBe(0);
  expect(readFileSync(output, "utf8")).toBe("required=true\n");
  expect(run("0".repeat(40), head).status).toBe(0);
  expect(readFileSync(output, "utf8")).toBe("required=true\n");
  expect(run("f".repeat(40), head).status).not.toBe(0);
  expect(readFileSync(output, "utf8")).toBe("");
  expect(run("--invalid-ref", head).status).not.toBe(0);
  expect(readFileSync(output, "utf8")).toBe("");
});

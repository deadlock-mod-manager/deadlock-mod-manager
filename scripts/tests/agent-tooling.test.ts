import { afterEach, expect, test } from "bun:test";
import {
  mkdtemp,
  mkdir,
  readFile,
  readlink,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { checkToolchain } from "../check-toolchain.mjs";
import { linkClaudeSkills } from "../link-claude-skills.mjs";

const workspaces: string[] = [];

afterEach(async () => {
  for (const workspace of workspaces.splice(0)) {
    await rm(workspace, { recursive: true, force: true });
  }
});

async function workspace() {
  const path = await mkdtemp(join(tmpdir(), "dmm-agent-tooling-"));
  workspaces.push(path);
  return path;
}

test("links skills idempotently and repairs a stale link", async () => {
  const root = await workspace();
  const source = join(root, ".agents", "skills", "sample");
  const destination = join(root, ".claude", "skills");
  await mkdir(source, { recursive: true });
  await writeFile(join(source, "SKILL.md"), "# Sample");
  await mkdir(destination, { recursive: true });
  const old = join(root, "old");
  await mkdir(old);
  const link = join(destination, "sample");
  await symlink(old, link, process.platform === "win32" ? "junction" : "dir");
  await linkClaudeSkills(root);
  await linkClaudeSkills(root);
  expect(resolve(destination, await readlink(link))).toBe(source);
  expect(await readFile(join(link, "SKILL.md"), "utf8")).toBe("# Sample");
});

test("preserves an existing skill directory instead of replacing it", async () => {
  const root = await workspace();
  await mkdir(join(root, ".agents", "skills", "sample"), { recursive: true });
  const existing = join(root, ".claude", "skills", "sample");
  await mkdir(existing, { recursive: true });
  await writeFile(join(existing, "SKILL.md"), "User-owned skill");
  await expect(linkClaudeSkills(root)).rejects.toThrow("not a link");
  expect(await readFile(join(existing, "SKILL.md"), "utf8")).toBe(
    "User-owned skill",
  );
});

async function toolchainFixture() {
  const root = await workspace();
  await mkdir(join(root, ".github", "workflows"), { recursive: true });
  await writeFile(join(root, ".nvmrc"), "24.8.0\n");
  await writeFile(join(root, ".bun-version"), "1.4.2\n");
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({
      engines: { node: ">=24.8.0", bun: ">=1.4.2" },
      packageManager: "pnpm@11.18.0",
    }),
  );
  await writeFile(
    join(root, ".github", "workflows", "ci.yml"),
    'env:\n  NODE_VERSION: "24.8.0"\nsteps:\n  - bun-version: "1.4.2"\n',
  );
  return root;
}

test("accepts matching runtime and CI pins", async () => {
  expect(await checkToolchain(await toolchainFixture())).toEqual({
    node: "24.8.0",
    bun: "1.4.2",
    pnpm: "pnpm@11.18.0",
  });
});

test("rejects a mismatched CI runtime", async () => {
  const root = await toolchainFixture();
  await writeFile(
    join(root, ".github", "workflows", "ci.yml"),
    'NODE_VERSION: "22.0.0"\nbun-version: latest\n',
  );
  await expect(checkToolchain(root)).rejects.toThrow("CI Node version differs");
});

test("rejects unpinned package managers and malformed runtime pins", async () => {
  const root = await toolchainFixture();
  await writeFile(join(root, ".nvmrc"), "24\n");
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({
      engines: { node: ">=24", bun: ">=1.4.2" },
      packageManager: "pnpm@latest",
    }),
  );
  await expect(checkToolchain(root)).rejects.toThrow(
    "Node pin must be an exact version",
  );
});

test("loads anti-slop through the repository lint config and detects an assertion chain", async () => {
  const root = await workspace();
  const file = join(root, "assertions.ts");
  await writeFile(
    file,
    "const input: object = {}; const value = input as unknown as { name: string }; console.log(value);",
  );
  const result = spawnSync(
    process.execPath,
    [
      "node_modules/oxlint/bin/oxlint",
      "--config",
      ".oxlintrc.json",
      "--format",
      "json",
      file,
    ],
    { encoding: "utf8" },
  );
  expect(result.status).toBe(0);
  expect(result.stdout).toContain("anti-slop(no-chained-type-assertions)");
});

test("accepts precise inferred values through the anti-slop plugin", async () => {
  const root = await workspace();
  const file = join(root, "inferred.ts");
  await writeFile(
    file,
    'const value = { name: "mod" } satisfies { name: string }; console.log(value);',
  );
  const result = spawnSync(
    process.execPath,
    [
      "node_modules/oxlint/bin/oxlint",
      "--config",
      ".oxlintrc.json",
      "--format",
      "json",
      file,
    ],
    { encoding: "utf8" },
  );
  expect(result.status).toBe(0);
  expect(result.stdout).not.toContain("anti-slop(");
});

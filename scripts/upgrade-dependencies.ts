#!/usr/bin/env bun

import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const PKG_PATH = join(ROOT, "package.json");

const isConditionalOverride = (key: string): boolean => {
  // Scoped packages start with @, so strip that first
  const name = key.startsWith("@") ? key.slice(1) : key;
  // If there's still an @ after stripping scope, it has a version selector
  return name.includes("@");
};

const readPkg = () => JSON.parse(readFileSync(PKG_PATH, "utf-8"));
const writePkg = (pkg: Record<string, unknown>) =>
  writeFileSync(PKG_PATH, `${JSON.stringify(pkg, null, 2)}\n`);

const pkg = readPkg();
const overrides: Record<string, string> = pkg.pnpm?.overrides ?? {};

// Separate conditional overrides from simple ones
const conditionalOverrides: Record<string, string> = {};
const simpleOverrides: Record<string, string> = {};

for (const [key, value] of Object.entries(overrides)) {
  if (isConditionalOverride(key)) {
    conditionalOverrides[key] = value;
  } else {
    simpleOverrides[key] = value;
  }
}

const conditionalCount = Object.keys(conditionalOverrides).length;
if (conditionalCount > 0) {
  console.log(
    `Temporarily stripping ${conditionalCount} conditional override(s) for taze compatibility...`,
  );
}

// Strip conditional overrides
pkg.pnpm.overrides = simpleOverrides;
writePkg(pkg);

const restore = () => {
  const current = readPkg();
  current.pnpm.overrides = {
    ...current.pnpm.overrides,
    ...conditionalOverrides,
  };
  writePkg(current);
  if (conditionalCount > 0) {
    console.log(`Restored ${conditionalCount} conditional override(s).`);
  }
};

process.on("SIGINT", () => {
  restore();
  process.exit(130);
});
process.on("SIGTERM", () => {
  restore();
  process.exit(143);
});

let exitCode = 0;
try {
  const args = process.argv.slice(2).join(" ");
  const cmd = `pnpm dlx taze -r ${args}`.trim();
  execSync(cmd, { stdio: "inherit", cwd: ROOT });
} catch (error: unknown) {
  if (
    error &&
    typeof error === "object" &&
    "status" in error &&
    typeof error.status === "number"
  ) {
    exitCode = error.status;
  } else {
    exitCode = 1;
  }
} finally {
  restore();
}

process.exit(exitCode);

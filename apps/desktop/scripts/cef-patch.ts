#!/usr/bin/env bun

import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

// Pinned so upstream API changes on the `feat/cef` branches can't break CI
// unannounced. The plugins revision is the `feat/cef` commit built against
// this Tauri tag. Bump together with `TAURI_CEF_TAG` in `_build-cef.yml`.
const TAURI_CEF_TAG = process.env.TAURI_CEF_TAG ?? "tauri-cef-v3.0.0-alpha.27";
const PLUGINS_CEF_REV = "835adce473e8f059f6ba84660dd07bcb19fb9030";
const TAURI_GIT = "https://github.com/tauri-apps/tauri";
const PLUGINS_GIT = "https://github.com/tauri-apps/plugins-workspace";
const TAURI_CORE_CRATES = [
  "tauri",
  "tauri-build",
  "tauri-plugin",
  "tauri-utils",
];
// Several crates.io releases enable `tauri/wry` for mobile targets, a feature
// the CEF branch removed. Patch every official plugin we use from the matching
// plugins branch so they also share its internal plugin dependencies.
const CEF_PATCHED_PLUGINS = [
  "tauri-plugin-clipboard-manager",
  "tauri-plugin-deep-link",
  "tauri-plugin-dialog",
  "tauri-plugin-fs",
  "tauri-plugin-http",
  "tauri-plugin-log",
  "tauri-plugin-opener",
  "tauri-plugin-os",
  "tauri-plugin-process",
  "tauri-plugin-single-instance",
  "tauri-plugin-store",
  "tauri-plugin-updater",
];
const PATCH_MARKER = "[patch.crates-io]";
const CEF_TAURI_CONFIG = "src-tauri/tauri.cef.conf.json";
const DEPENDENCIES_HEADER = "[dependencies]";

// On `feat/cef` the CEF runtime is a standalone crate and `tauri` no longer has
// `wry`/`cef` features, so CEF builds swap the Wry feature for one enabling an
// optional `tauri-runtime-cef` dependency.
const TAURI_WRY_LINE =
  'tauri-wry = ["tauri/wry", "dep:tauri-plugin-mcp-bridge"]';
const CEF_FEATURE_LINES = 'tauri-wry = []\ncef = ["dep:tauri-runtime-cef"]';
const CEF_DEPENDENCY_LINE = `tauri-runtime-cef = { git = "${TAURI_GIT}", tag = "${TAURI_CEF_TAG}", optional = true, features = ["devtools"] }`;

const desktopDir = resolve(import.meta.dirname, "..");
const workspaceCargoToml = resolve(desktopDir, "Cargo.toml");
const packageCargoToml = resolve(desktopDir, "src-tauri", "Cargo.toml");

const patchBlock = [
  "",
  PATCH_MARKER,
  ...TAURI_CORE_CRATES.map(
    (name) => `${name} = { git = "${TAURI_GIT}", tag = "${TAURI_CEF_TAG}" }`,
  ),
  ...CEF_PATCHED_PLUGINS.map(
    (name) =>
      `${name} = { git = "${PLUGINS_GIT}", rev = "${PLUGINS_CEF_REV}" }`,
  ),
  "",
].join("\n");

function readUtf8(path: string): string {
  return readFileSync(path, "utf8").replace(/\r\n/g, "\n");
}

function writeUtf8(path: string, content: string): void {
  writeFileSync(path, content.replace(/\r\n/g, "\n"), "utf8");
}

function syncTauriLockfile(context: "inject" | "restore"): void {
  const result = spawnSync(
    "cargo",
    ["update", ...TAURI_CORE_CRATES.flatMap((name) => ["-p", name])],
    { cwd: desktopDir, stdio: "inherit" },
  );

  if (result.status !== 0) {
    const message =
      context === "inject"
        ? "Failed to update Cargo.lock for CEF patch"
        : "Failed to restore Cargo.lock after removing CEF patch";
    console.error(message);
    process.exit(result.status ?? 1);
  }
}

function injectPatch(): void {
  const workspace = readUtf8(workspaceCargoToml);
  writeUtf8(workspaceCargoToml, `${workspace.trimEnd()}${patchBlock}`);
  console.log(`Injected Tauri CEF patch (${TAURI_CEF_TAG})`);
}

function stripPatch(): boolean {
  const workspace = readUtf8(workspaceCargoToml);
  const patchIndex = workspace.indexOf(`\n${PATCH_MARKER}`);
  if (patchIndex === -1) {
    return false;
  }

  writeUtf8(
    workspaceCargoToml,
    `${workspace.slice(0, patchIndex).trimEnd()}\n`,
  );
  return true;
}

function injectCefManifest(): void {
  const manifest = readUtf8(packageCargoToml);
  for (const anchor of [TAURI_WRY_LINE, DEPENDENCIES_HEADER]) {
    if (!manifest.includes(`${anchor}\n`)) {
      console.error(`Could not find ${anchor} in src-tauri/Cargo.toml`);
      process.exit(1);
    }
  }

  writeUtf8(
    packageCargoToml,
    manifest
      .replace(`${TAURI_WRY_LINE}\n`, `${CEF_FEATURE_LINES}\n`)
      .replace(
        `${DEPENDENCIES_HEADER}\n`,
        `${DEPENDENCIES_HEADER}\n${CEF_DEPENDENCY_LINE}\n`,
      ),
  );
  console.log("Injected tauri-runtime-cef in src-tauri/Cargo.toml");
}

function stripCefManifest(): boolean {
  const manifest = readUtf8(packageCargoToml);
  // Match the dependency by prefix so cleanup still works after a pin bump.
  const updated = manifest
    .replace(/^tauri-runtime-cef = .*\n/m, "")
    .replace(`${CEF_FEATURE_LINES}\n`, `${TAURI_WRY_LINE}\n`);

  if (updated === manifest) {
    return false;
  }

  writeUtf8(packageCargoToml, updated);
  return true;
}

function isCefSetupCurrent(): boolean {
  const manifest = readUtf8(packageCargoToml);
  return (
    readUtf8(workspaceCargoToml).includes(patchBlock) &&
    manifest.includes(`${CEF_FEATURE_LINES}\n`) &&
    manifest.includes(`${CEF_DEPENDENCY_LINE}\n`)
  );
}

// Re-injects from a clean state whenever the existing setup doesn't match the
// current pins, so a tag bump never leaves a stale or duplicated patch behind.
// Like `cleanup`, this restores Cargo.lock from git first, discarding any
// uncommitted lockfile edits.
function ensureCefSetup(): boolean {
  if (isCefSetupCurrent()) {
    return false;
  }

  cleanupCefSetup();
  injectPatch();
  injectCefManifest();
  syncTauriLockfile("inject");
  console.log("Run `pnpm cef:cleanup` when finished to restore Wry builds.");
  return true;
}

function cleanupCefSetup(): boolean {
  const patchRemoved = stripPatch();
  const featureRemoved = stripCefManifest();

  if (patchRemoved) {
    const restoredFromGit =
      spawnSync("git", ["checkout", "--", "Cargo.lock"], {
        cwd: desktopDir,
        stdio: "pipe",
      }).status === 0;

    if (!restoredFromGit) {
      syncTauriLockfile("restore");
    }
  }

  return patchRemoved || featureRemoved;
}

// CEF builds need `--features cef` passed twice: once to the Tauri CLI (before
// `--`) so the bundler picks up libcef.dll, and once to cargo (after `--`)
// alongside `--no-default-features` so the crate compiles against the cef
// feature instead of the default wry feature. `tauri build` also gets the CEF
// config overlay, which declares the Linux package dependencies Chromium needs.
// Centralizing this here keeps every call site (package.json scripts, CI
// steps) free of the contract.
function injectCefFlags(
  command: string,
  args: string[],
): { command: string; args: string[] } {
  const tokens = [command, ...args];
  const tauriIdx = tokens.indexOf("tauri");
  if (tauriIdx === -1) {
    return { command, args };
  }

  const subcommand = tokens[tauriIdx + 1];
  if (subcommand !== "build" && subcommand !== "dev") {
    return { command, args };
  }

  const cliFlags =
    subcommand === "build"
      ? ["--features", "cef", "--config", CEF_TAURI_CONFIG]
      : ["--features", "cef"];
  const cargoFlags = ["--no-default-features", "--features", "cef"];
  const insertAt = tauriIdx + 2;
  const dashDashIdx = tokens.indexOf("--", insertAt);

  const updated =
    dashDashIdx === -1
      ? [
          ...tokens.slice(0, insertAt),
          ...cliFlags,
          ...tokens.slice(insertAt),
          "--",
          ...cargoFlags,
        ]
      : [
          ...tokens.slice(0, insertAt),
          ...cliFlags,
          ...tokens.slice(insertAt, dashDashIdx + 1),
          ...cargoFlags,
          ...tokens.slice(dashDashIdx + 1),
        ];

  return { command: updated[0], args: updated.slice(1) };
}

function runCommand(command: string, args: string[]): number {
  ensureCefSetup();

  const invocation = injectCefFlags(command, args);

  const result = spawnSync(invocation.command, invocation.args, {
    cwd: desktopDir,
    shell: true,
    stdio: "inherit",
    env: process.env,
  });

  return result.status ?? 1;
}

const [subcommand, ...rest] = process.argv.slice(2);

if (subcommand === undefined) {
  console.error("Usage:");
  console.error("  bun scripts/cef-patch.ts setup");
  console.error("  bun scripts/cef-patch.ts cleanup");
  console.error("  bun scripts/cef-patch.ts <command> [args...]");
  process.exit(1);
}

if (subcommand === "setup") {
  const result = spawnSync(
    "cargo",
    ["install", "tauri-cli", "--git", TAURI_GIT, "--tag", TAURI_CEF_TAG],
    { stdio: "inherit" },
  );
  process.exit(result.status ?? 1);
}

if (subcommand === "cleanup") {
  const changed = cleanupCefSetup();
  console.log(
    changed
      ? "Removed injected CEF patch and feature, restored Cargo.lock"
      : "No injected CEF changes found",
  );
  process.exit(0);
}

process.exitCode = runCommand(subcommand, rest);

#!/usr/bin/env bun

import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const TAURI_CEF_BRANCH = process.env.TAURI_CEF_BRANCH ?? "feat/cef";
const PATCH_MARKER = "[patch.crates-io]";
const CEF_FEATURE = 'cef = ["tauri/cef"]';
const TAURI_WRY_LINE = 'tauri-wry = ["tauri/wry"]';

const desktopDir = resolve(import.meta.dirname, "..");
const workspaceCargoToml = resolve(desktopDir, "Cargo.toml");
const packageCargoToml = resolve(desktopDir, "src-tauri", "Cargo.toml");

const patchBlock = `
[patch.crates-io]
tauri = { git = "https://github.com/tauri-apps/tauri", branch = "${TAURI_CEF_BRANCH}" }
tauri-build = { git = "https://github.com/tauri-apps/tauri", branch = "${TAURI_CEF_BRANCH}" }
`;

function readUtf8(path: string): string {
  return readFileSync(path, "utf8").replace(/\r\n/g, "\n");
}

function writeUtf8(path: string, content: string): void {
  writeFileSync(path, content.replace(/\r\n/g, "\n"), "utf8");
}

function syncTauriLockfile(context: "inject" | "restore"): void {
  const result = spawnSync(
    "cargo",
    ["update", "-p", "tauri", "-p", "tauri-build@2.6.2"],
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

function injectPatch(): boolean {
  const workspace = readUtf8(workspaceCargoToml);
  if (workspace.includes(PATCH_MARKER)) {
    return false;
  }

  writeUtf8(workspaceCargoToml, `${workspace.trimEnd()}${patchBlock}`);
  console.log(`Injected Tauri CEF patch (branch ${TAURI_CEF_BRANCH})`);
  return true;
}

function stripPatch(): boolean {
  const workspace = readUtf8(workspaceCargoToml);
  const patchIndex = workspace.indexOf("\n[patch.crates-io]");
  if (patchIndex === -1) {
    return false;
  }

  writeUtf8(
    workspaceCargoToml,
    `${workspace.slice(0, patchIndex).trimEnd()}\n`,
  );
  return true;
}

function injectCefFeature(): boolean {
  const manifest = readUtf8(packageCargoToml);
  if (manifest.includes(CEF_FEATURE)) {
    return false;
  }

  if (!manifest.includes(TAURI_WRY_LINE)) {
    console.error(`Could not find ${TAURI_WRY_LINE} in src-tauri/Cargo.toml`);
    process.exit(1);
  }

  const updated = manifest.replace(
    `${TAURI_WRY_LINE}\n`,
    `${TAURI_WRY_LINE}\n${CEF_FEATURE}\n`,
  );

  if (updated === manifest) {
    console.error("Failed to inject cef feature in src-tauri/Cargo.toml");
    process.exit(1);
  }

  writeUtf8(packageCargoToml, updated);
  console.log("Injected cef feature in src-tauri/Cargo.toml");
  return true;
}

function stripCefFeature(): boolean {
  const manifest = readUtf8(packageCargoToml);
  if (!manifest.includes(CEF_FEATURE)) {
    return false;
  }

  writeUtf8(packageCargoToml, manifest.replace(`${CEF_FEATURE}\n`, ""));
  return true;
}

function ensureCefSetup(): boolean {
  const patchInjected = injectPatch();
  const featureInjected = injectCefFeature();

  if (patchInjected) {
    syncTauriLockfile("inject");
  }

  if (patchInjected || featureInjected) {
    console.log("Run `pnpm cef:cleanup` when finished to restore Wry builds.");
  }

  return patchInjected || featureInjected;
}

function cleanupCefSetup(): boolean {
  const patchRemoved = stripPatch();
  const featureRemoved = stripCefFeature();

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
// feature instead of the default wry feature. Centralizing this here keeps
// every call site (package.json scripts, CI steps) free of the contract.
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

  const cliFlags = ["--features", "cef"];
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
  console.error("  bun scripts/cef-patch.ts cleanup");
  console.error("  bun scripts/cef-patch.ts <command> [args...]");
  process.exit(1);
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

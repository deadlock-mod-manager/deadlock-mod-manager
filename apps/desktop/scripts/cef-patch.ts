#!/usr/bin/env bun

import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";

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
const CEF_UNUSED_DEPENDENCIES = [
  "tauri-plugin-mcp-bridge",
  "tauri-plugin-wdio",
  "tauri-plugin-wdio-webdriver",
];
const PATCH_MARKER = "[patch.crates-io]";
const CEF_TAURI_CONFIG = "src-tauri/tauri.cef.conf.json";
const DEPENDENCIES_HEADER = "[dependencies]";

const TAURI_WRY_LINE = `tauri-wry = [
  "tauri/wry",
  "dep:tauri-plugin-mcp-bridge",
  "tauri-plugin-dialog/gtk3",
]`;
const CEF_FEATURE_LINES =
  'tauri-wry = []\ncef = ["dep:tauri-runtime-cef", "tauri-plugin-dialog/xdg-portal"]';
const CEF_DEPENDENCY_LINE = `tauri-runtime-cef = { git = "${TAURI_GIT}", tag = "${TAURI_CEF_TAG}", optional = true, features = ["devtools"] }`;

const desktopDir = resolve(import.meta.dirname, "..");
const workspaceCargoToml = resolve(desktopDir, "Cargo.toml");
const packageCargoToml = resolve(desktopDir, "src-tauri", "Cargo.toml");
const packageCargoTomlBackup = resolve(
  desktopDir,
  "target",
  "cef-patch",
  "Cargo.toml",
);
const workspaceCargoLock = resolve(desktopDir, "Cargo.lock");
const cefCargoLock = resolve(desktopDir, "Cargo.cef.lock");
const workspaceCargoLockBackup = resolve(
  desktopDir,
  "target",
  "cef-patch",
  "Cargo.lock",
);

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

function updateCefLockfile(): number {
  ensureCefSetup(existsSync(cefCargoLock) ? cefCargoLock : workspaceCargoLock);
  const result = spawnSync(
    "cargo",
    [
      "update",
      ...[...TAURI_CORE_CRATES, ...CEF_PATCHED_PLUGINS].flatMap((name) => [
        "-p",
        name,
      ]),
    ],
    { cwd: desktopDir, stdio: "inherit" },
  );

  if (result.status !== 0) {
    console.error("Failed to update Cargo.cef.lock");
  } else {
    copyFileSync(workspaceCargoLock, cefCargoLock);
    console.log("Updated Cargo.cef.lock");
  }
  cleanupCefSetup();
  return result.status ?? 1;
}

const CEF_METADATA_ARGS = [
  "metadata",
  "--format-version",
  "1",
  "--no-default-features",
  "--features",
  "cef,match-sync",
];

function syncCefLockfile(): number {
  ensureCefSetup();
  const result = spawnSync("cargo", CEF_METADATA_ARGS, {
    cwd: desktopDir,
    stdio: ["ignore", "ignore", "inherit"],
  });

  if (result.status !== 0) {
    console.error("Failed to sync Cargo.cef.lock");
  } else {
    copyFileSync(workspaceCargoLock, cefCargoLock);
    console.log("Synced Cargo.cef.lock");
  }
  cleanupCefSetup();
  return result.status ?? 1;
}

function checkCefLockfile(): number {
  ensureCefSetup();
  const result = spawnSync("cargo", [...CEF_METADATA_ARGS, "--locked"], {
    cwd: desktopDir,
    stdio: ["ignore", "ignore", "inherit"],
  });
  cleanupCefSetup();

  if (result.status !== 0) {
    console.error(
      "Cargo.cef.lock is out of date. Run `pnpm --filter @deadlock-mods/desktop cef:sync-lockfile` and commit the result.",
    );
  }
  return result.status ?? 1;
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

  mkdirSync(dirname(packageCargoTomlBackup), { recursive: true });
  writeUtf8(packageCargoTomlBackup, manifest);

  let updated = manifest
    .replace(`${TAURI_WRY_LINE}\n`, `${CEF_FEATURE_LINES}\n`)
    .replace(
      `${DEPENDENCIES_HEADER}\n`,
      `${DEPENDENCIES_HEADER}\n${CEF_DEPENDENCY_LINE}\n`,
    );
  for (const name of [...TAURI_CORE_CRATES, ...CEF_PATCHED_PLUGINS]) {
    updated = updated.replace(
      new RegExp(`^(${name} = (?:\\{ version = )?)"[^"]*"`, "gm"),
      '$1"2"',
    );
  }
  for (const name of CEF_UNUSED_DEPENDENCIES) {
    updated = updated
      .replace(new RegExp(`^${name} = .*\\n`, "m"), "")
      .replace(new RegExp(`^\\s*"dep:${name}",\\n`, "gm"), "");
  }
  writeUtf8(packageCargoToml, updated);
  console.log("Injected tauri-runtime-cef in src-tauri/Cargo.toml");
}

function stripCefManifest(): boolean {
  if (existsSync(packageCargoTomlBackup)) {
    writeUtf8(packageCargoToml, readUtf8(packageCargoTomlBackup));
    rmSync(packageCargoTomlBackup);
    return true;
  }

  const manifest = readUtf8(packageCargoToml);
  const updated = manifest
    .replace(/^tauri-runtime-cef = .*\n/m, "")
    .replace(/^tauri-wry = \[\]\ncef = \[.*\]\n/m, `${TAURI_WRY_LINE}\n`);

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
    manifest.includes(`${CEF_DEPENDENCY_LINE}\n`) &&
    existsSync(packageCargoTomlBackup) &&
    existsSync(workspaceCargoLockBackup)
  );
}

function ensureCefSetup(lockfile = cefCargoLock): boolean {
  if (isCefSetupCurrent()) {
    return false;
  }

  cleanupCefSetup();
  const lock = readFileSync(lockfile);
  mkdirSync(dirname(workspaceCargoLockBackup), { recursive: true });
  copyFileSync(workspaceCargoLock, workspaceCargoLockBackup);
  writeFileSync(workspaceCargoLock, lock);
  injectPatch();
  injectCefManifest();
  console.log("Run `pnpm cef:cleanup` when finished to restore Wry builds.");
  return true;
}

function cleanupCefSetup(): boolean {
  const patchRemoved = stripPatch();
  const featureRemoved = stripCefManifest();

  const lockRestored = existsSync(workspaceCargoLockBackup);
  if (lockRestored) {
    copyFileSync(workspaceCargoLockBackup, workspaceCargoLock);
    rmSync(workspaceCargoLockBackup);
  }

  return patchRemoved || featureRemoved || lockRestored;
}

function injectCefFlags(command: string, args: string[]) {
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
  const cargoFlags = ["--no-default-features", "--features", "cef,match-sync"];
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
  console.error("  bun scripts/cef-patch.ts prepare");
  console.error("  bun scripts/cef-patch.ts update-lockfile");
  console.error("  bun scripts/cef-patch.ts sync-lockfile");
  console.error("  bun scripts/cef-patch.ts check-lockfile");
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

if (subcommand === "prepare") {
  ensureCefSetup();
  process.exit(0);
}

if (subcommand === "update-lockfile") {
  process.exit(updateCefLockfile());
}

if (subcommand === "sync-lockfile") {
  process.exit(syncCefLockfile());
}

if (subcommand === "check-lockfile") {
  process.exit(checkCefLockfile());
}

process.exitCode = runCommand(subcommand, rest);

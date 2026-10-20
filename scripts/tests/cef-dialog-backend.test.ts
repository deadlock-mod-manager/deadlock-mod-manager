import { afterEach, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const fixtures: string[] = [];
const desktop = new URL("../../apps/desktop/", import.meta.url);

afterEach(() => {
  for (const fixture of fixtures.splice(0)) {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test("CEF uses portal dialogs and cleanup restores Wry's GTK backend", () => {
  const fixture = mkdtempSync(join(tmpdir(), "dmm-cef-dialog-"));
  fixtures.push(fixture);
  for (const directory of ["scripts", "src-tauri", "bin"]) {
    mkdirSync(join(fixture, directory));
  }
  for (const path of [
    "Cargo.toml",
    "src-tauri/Cargo.toml",
    "scripts/cef-patch.ts",
  ]) {
    copyFileSync(new URL(path, desktop), join(fixture, path));
  }
  // Exercise the real manifest transformation without fetching dependencies
  // or allowing its lockfile cleanup to touch the working checkout.
  for (const command of ["cargo", "git"]) {
    writeFileSync(join(fixture, "bin", command), "#!/bin/sh\nexit 0\n", {
      mode: 0o755,
    });
  }
  const manifestPath = join(fixture, "src-tauri/Cargo.toml");
  const original = readFileSync(manifestPath, "utf8");
  const run = (command: string) => {
    const result = spawnSync(
      process.execPath,
      [join(fixture, "scripts/cef-patch.ts"), command],
      {
        cwd: fixture,
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${join(fixture, "bin")}:${process.env.PATH}`,
        },
      },
    );
    expect(result.status, result.stderr).toBe(0);
  };

  expect(Bun.TOML.parse(original)).toMatchObject({
    features: {
      "tauri-wry": expect.arrayContaining(["tauri-plugin-dialog/gtk3"]),
    },
    dependencies: {
      "tauri-plugin-dialog": { "default-features": false },
    },
  });
  run("true");
  const injected = readFileSync(manifestPath, "utf8");
  expect(Bun.TOML.parse(injected)).toMatchObject({
    features: {
      "tauri-wry": [],
      cef: ["dep:tauri-runtime-cef", "tauri-plugin-dialog/xdg-portal"],
    },
    dependencies: {
      "tauri-plugin-dialog": { "default-features": false },
    },
  });
  run("true");
  expect(readFileSync(manifestPath, "utf8")).toBe(injected);
  writeFileSync(
    manifestPath,
    injected.replace(
      'cef = ["dep:tauri-runtime-cef", "tauri-plugin-dialog/xdg-portal"]',
      'cef = ["dep:tauri-runtime-cef"]',
    ),
  );
  run("true");
  expect(readFileSync(manifestPath, "utf8")).toBe(injected);
  run("cleanup");
  expect(readFileSync(manifestPath, "utf8")).toBe(original);
});

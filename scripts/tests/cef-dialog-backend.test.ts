import { afterEach, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
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

function createFixture(env: NodeJS.ProcessEnv = {}) {
  const fixture = mkdtempSync(join(tmpdir(), "dmm-cef-dialog-"));
  fixtures.push(fixture);
  for (const directory of ["scripts", "src-tauri"]) {
    mkdirSync(join(fixture, directory));
  }
  for (const path of [
    "Cargo.toml",
    "src-tauri/Cargo.toml",
    "scripts/cef-patch.ts",
  ]) {
    copyFileSync(new URL(path, desktop), join(fixture, path));
  }
  writeFileSync(join(fixture, "Cargo.lock"), "# Local Wry lockfile edits\r\n");
  writeFileSync(join(fixture, "Cargo.cef.lock"), "# Vendored CEF lockfile\n");
  const manifestPath = join(fixture, "src-tauri/Cargo.toml");
  const original = readFileSync(manifestPath, "utf8");
  const run = (...args: string[]) =>
    spawnSync(
      process.execPath,
      [join(fixture, "scripts/cef-patch.ts"), ...args],
      {
        cwd: fixture,
        encoding: "utf8",
        env: {
          ...process.env,
          TAURI_CEF_TAG: "tauri-cef-v3.0.0-alpha.27",
          ...env,
        },
      },
    );
  const succeed = (...args: string[]) => {
    const result = run(...args);
    expect(result.status, result.stderr).toBe(0);
  };
  return { fixture, manifestPath, original, run, succeed };
}

test("CEF uses portal dialogs and cleanup restores Wry's GTK backend", () => {
  const { manifestPath, original, succeed } = createFixture();

  expect(Bun.TOML.parse(original)).toMatchObject({
    features: {
      "tauri-wry": expect.arrayContaining(["tauri-plugin-dialog/gtk3"]),
    },
    dependencies: {
      "tauri-plugin-dialog": { "default-features": false },
    },
  });
  succeed("prepare");
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
  succeed("prepare");
  expect(readFileSync(manifestPath, "utf8")).toBe(injected);
  writeFileSync(
    manifestPath,
    injected.replace(
      'cef = ["dep:tauri-runtime-cef", "tauri-plugin-dialog/xdg-portal"]',
      'cef = ["dep:tauri-runtime-cef"]',
    ),
  );
  succeed("prepare");
  expect(readFileSync(manifestPath, "utf8")).toBe(injected);
  succeed("cleanup");
  expect(readFileSync(manifestPath, "utf8")).toBe(original);
});

test("CEF selects the vendored lock and cleanup preserves local Wry edits", () => {
  const { fixture, succeed } = createFixture();
  const lockPath = join(fixture, "Cargo.lock");
  const cefPath = join(fixture, "Cargo.cef.lock");
  const original = readFileSync(lockPath);
  const cef = readFileSync(cefPath);

  succeed("prepare");
  expect(readFileSync(lockPath)).toEqual(cef);
  succeed("prepare");
  expect(readFileSync(lockPath)).toEqual(cef);
  writeFileSync(lockPath, "# Build modified the active CEF lock\n");
  succeed("cleanup");
  expect(readFileSync(lockPath)).toEqual(original);
  expect(readFileSync(cefPath)).toEqual(cef);
  expect(existsSync(join(fixture, "target/cef-patch/Cargo.lock"))).toBe(false);
  succeed("cleanup");
  expect(readFileSync(lockPath)).toEqual(original);
});

test("refreshing a stale CEF manifest keeps the original Wry lock backup", () => {
  const { fixture, manifestPath, succeed } = createFixture();
  const lockPath = join(fixture, "Cargo.lock");
  const original = readFileSync(lockPath);
  succeed("prepare");
  writeFileSync(
    manifestPath,
    readFileSync(manifestPath, "utf8").replace(
      'cef = ["dep:tauri-runtime-cef", "tauri-plugin-dialog/xdg-portal"]',
      'cef = ["dep:tauri-runtime-cef"]',
    ),
  );
  succeed("prepare");
  expect(readFileSync(lockPath)).toEqual(
    readFileSync(join(fixture, "Cargo.cef.lock")),
  );
  succeed("cleanup");
  expect(readFileSync(lockPath)).toEqual(original);
});

test("a missing CEF lock fails before modifying Wry files", () => {
  const { fixture, manifestPath, original, run } = createFixture();
  const workspace = readFileSync(join(fixture, "Cargo.toml"));
  const lock = readFileSync(join(fixture, "Cargo.lock"));
  rmSync(join(fixture, "Cargo.cef.lock"));

  expect(run("prepare").status).not.toBe(0);
  expect(readFileSync(join(fixture, "Cargo.toml"))).toEqual(workspace);
  expect(readFileSync(manifestPath, "utf8")).toBe(original);
  expect(readFileSync(join(fixture, "Cargo.lock"))).toEqual(lock);
});

test("a failed lockfile refresh restores Wry without changing the vendored lock", () => {
  const { fixture, manifestPath, original, run } = createFixture({ PATH: "" });
  const workspace = readFileSync(join(fixture, "Cargo.toml"));
  const lock = readFileSync(join(fixture, "Cargo.lock"));
  const cef = readFileSync(join(fixture, "Cargo.cef.lock"));

  expect(run("update-lockfile").status).not.toBe(0);
  expect(readFileSync(join(fixture, "Cargo.toml"))).toEqual(workspace);
  expect(readFileSync(manifestPath, "utf8")).toBe(original);
  expect(readFileSync(join(fixture, "Cargo.lock"))).toEqual(lock);
  expect(readFileSync(join(fixture, "Cargo.cef.lock"))).toEqual(cef);
});

test.each([0, 7])(
  "wrapped commands return exit code %i with the CEF lock active",
  (code) => {
    const { fixture, run, succeed } = createFixture();
    writeFileSync(
      join(fixture, "command.ts"),
      `import { readFileSync } from "node:fs";
if (readFileSync("Cargo.lock", "utf8") !== "# Vendored CEF lockfile\\n") process.exit(99);
process.exit(${code});`,
    );
    expect(run("bun", "command.ts").status).toBe(code);
    succeed("cleanup");
    expect(readFileSync(join(fixture, "Cargo.lock"), "utf8")).toBe(
      "# Local Wry lockfile edits\r\n",
    );
  },
);

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import {
  assertNoHarnessBinary,
  assertNoHarnessDependencies,
  assertNoHarnessText,
} from "./support/release-surface";
import { runProcess } from "./support/process-control";
import { REPOSITORY_ROOT } from "./support/world";

// This probe launches a release executable. Keep it on the disposable CI host.
assert.equal(
  process.env.GITHUB_ACTIONS,
  "true",
  "Release execution is restricted to GitHub Actions",
);
assert.equal(
  process.env.RUNNER_ENVIRONMENT,
  "github-hosted",
  "Use a disposable GitHub-hosted runner",
);
const desktop = path.join(REPOSITORY_ROOT, "apps", "desktop");
const artifacts = path.join(REPOSITORY_ROOT, ".e2e", "release");
await mkdir(artifacts, { recursive: true });
try {
  const { stdout: tree } = await promisify(execFile)(
    "cargo",
    ["tree", "--locked", "--edges", "normal", "--prefix", "none"],
    { cwd: desktop, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
  );
  await writeFile(path.join(artifacts, "dependencies.txt"), tree);
  assertNoHarnessDependencies(tree);
  const binary = path.join(
    desktop,
    "target",
    "release",
    "deadlock-mod-manager.exe",
  );
  await assertNoHarnessBinary(binary);
  const capabilities = await readFile(
    path.join(desktop, "src-tauri", "gen", "schemas", "capabilities.json"),
    "utf8",
  );
  assertNoHarnessText(capabilities, "Generated capabilities");
  await writeFile(path.join(artifacts, "capabilities.json"), capabilities);
  const dist = path.join(desktop, "dist");
  const files = await readdir(dist, { recursive: true });
  const scripts = files.filter((file) => file.endsWith(".js"));
  assert(scripts.length > 0, "Release frontend assets are missing");
  for (const file of scripts)
    assertNoHarnessText(await readFile(path.join(dist, file), "utf8"), file);
  const result = await runProcess({
    executable: binary,
    args: ["--disable-auto-update"],
    cwd: desktop,
    environment: {
      ...process.env,
      DMM_E2E_CONFIG: path.join(artifacts, "must-not-load.json"),
      WDIO_EMBEDDED_SERVER: "true",
    },
    outputPath: path.join(artifacts, "rejection.log"),
    timeoutMs: 10_000,
  });
  assert.equal(
    result.termination,
    null,
    "Ordinary release did not reject E2E configuration promptly",
  );
  assert.equal(
    result.exitCode,
    2,
    "Ordinary release must reject E2E configuration before app startup",
  );
  assert.match(
    result.output,
    /DMM_E2E_CONFIG cannot activate E2E mode in a production build/,
    "Release must reject configuration for the expected reason",
  );
  await writeFile(
    path.join(artifacts, "result.json"),
    JSON.stringify(
      {
        passed: true,
        checkedFrontendScripts: scripts.length,
        rejectionExitCode: result.exitCode,
      },
      null,
      2,
    ),
  );
} catch (error) {
  await writeFile(
    path.join(artifacts, "result.json"),
    JSON.stringify(
      {
        passed: false,
        error: error instanceof Error ? error.stack : String(error),
      },
      null,
      2,
    ),
  );
  throw error;
}

import {
  access,
  mkdir,
  mkdtemp,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { createReadStream } from "node:fs";
import { spawnSync } from "node:child_process";
import { createServer as createTcpServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { DriverProvider } from "./support/contracts";
import { defaultBinaryPath, runE2eWorld } from "./support/supervisor";
import { WORLDS_ROOT } from "./support/world";
import { parseScenarioId } from "./support/scenarios";
import { nativePickerBinary } from "./support/native-picker";

const argumentsList = process.argv.slice(2);
const command = argumentsList[0] ?? "run";

const valueAfter = (flag: string): string | undefined => {
  const index = argumentsList.indexOf(flag);
  return index >= 0 ? argumentsList[index + 1] : undefined;
};

const provider = (): DriverProvider => {
  const value = valueAfter("--provider") ?? "embedded";
  if (value !== "embedded" && value !== "external") {
    throw new Error(
      `Unsupported provider '${value}'. Use embedded or external.`,
    );
  }
  return value;
};

const commandExists = (executable: string, argument: string): boolean => {
  if (process.platform === "win32") {
    return (
      spawnSync("where.exe", [executable], {
        stdio: "ignore",
        windowsHide: true,
      }).status === 0
    );
  }
  return (
    spawnSync(executable, [argument], {
      stdio: "ignore",
      windowsHide: true,
    }).status === 0
  );
};

const isInteractiveWindowsSession = (): boolean =>
  process.platform === "win32" &&
  spawnSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "if ([Environment]::UserInteractive) { exit 0 } else { exit 1 }",
    ],
    { stdio: "ignore", windowsHide: true },
  ).status === 0;

const hasWebView2Runtime = async (): Promise<boolean> => {
  const roots = [process.env["ProgramFiles(x86)"], process.env.LOCALAPPDATA]
    .filter((root): root is string => root !== undefined)
    .map((root) => path.join(root, "Microsoft", "EdgeWebView", "Application"));
  for (const root of roots) {
    try {
      const entries = await readdir(root, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        try {
          await access(path.join(root, entry.name, "msedgewebview2.exe"));
          return true;
        } catch {
          // Continue looking through installed runtime versions.
        }
      }
    } catch {
      // Continue through per-machine and per-user installation roots.
    }
  }
  return false;
};

const canWriteHarnessRoot = async (): Promise<boolean> => {
  let probeDirectory: string | undefined;
  try {
    await mkdir(WORLDS_ROOT, { recursive: true });
    probeDirectory = await mkdtemp(path.join(WORLDS_ROOT, "doctor-"));
    await writeFile(path.join(probeDirectory, "probe"), "ok");
    await rm(probeDirectory, { recursive: true });
    return true;
  } catch {
    if (probeDirectory !== undefined) {
      await rm(probeDirectory, { recursive: true, force: true }).catch(
        () => undefined,
      );
    }
    return false;
  }
};

const canBindLoopback = async (): Promise<boolean> =>
  await new Promise<boolean>((resolve) => {
    const server = createTcpServer();
    server.once("error", () => resolve(false));
    server.listen(0, "127.0.0.1", () => {
      server.close((error) => resolve(error === undefined));
    });
  });

const binaryContains = async (
  binaryPath: string,
  markerText: string,
): Promise<boolean> => {
  const marker = Buffer.from(markerText);
  let suffix = Buffer.alloc(0);
  for await (const chunk of createReadStream(binaryPath)) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    const searchable = Buffer.concat([suffix, bytes]);
    if (searchable.indexOf(marker) >= 0) return true;
    suffix = searchable.subarray(
      Math.max(0, searchable.byteLength - marker.byteLength + 1),
    );
  }
  return false;
};

const doctor = async (): Promise<void> => {
  const binaryPath = valueAfter("--binary") ?? defaultBinaryPath;
  const selectedProvider = provider();
  const checks: Array<{ name: string; ok: boolean; detail: string }> = [];
  if (parseScenarioId(valueAfter("--case")) !== "about-smoke") {
    let pickerExists = true;
    try {
      await access(nativePickerBinary);
    } catch {
      pickerExists = false;
    }
    checks.push({
      name: "native input helper",
      ok: pickerExists,
      detail: pickerExists
        ? nativePickerBinary
        : "run pnpm e2e:build:picker (.NET 10 SDK required)",
    });
  }
  checks.push({
    name: "platform",
    ok: process.platform === "win32",
    detail: `${process.platform}; milestone 1 supports Windows/Wry`,
  });
  checks.push({
    name: "interactive session",
    ok: isInteractiveWindowsSession(),
    detail:
      "desktop WebView automation requires an interactive Windows session",
  });
  const hasWebView2 = await hasWebView2Runtime();
  checks.push({
    name: "WebView2 Runtime",
    ok: hasWebView2,
    detail: hasWebView2
      ? "msedgewebview2.exe found"
      : "Microsoft Edge WebView2 Runtime is missing",
  });
  const harnessRootWritable = await canWriteHarnessRoot();
  checks.push({
    name: "harness root",
    ok: harnessRootWritable,
    detail: `${WORLDS_ROOT} write/delete access`,
  });
  const loopbackAvailable = await canBindLoopback();
  checks.push({
    name: "loopback bind",
    ok: loopbackAvailable,
    detail: "ephemeral TCP listener on 127.0.0.1",
  });
  checks.push({
    name: "process-tree cleanup",
    ok: process.platform === "win32" && commandExists("taskkill.exe", "/?"),
    detail: "taskkill.exe on PATH",
  });
  const servicePath = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
    "node_modules",
    "@wdio",
    "tauri-service",
  );
  let embeddedServiceExists = true;
  try {
    await access(servicePath);
  } catch {
    embeddedServiceExists = false;
  }
  checks.push({
    name: "embedded WDIO service",
    ok: embeddedServiceExists,
    detail: embeddedServiceExists
      ? servicePath
      : "@wdio/tauri-service is not installed",
  });
  checks.push({
    name: "pnpm",
    ok: commandExists("pnpm", "--version"),
    detail: "pnpm on PATH",
  });
  checks.push({
    name: "cargo",
    ok: commandExists("cargo", "--version"),
    detail: "cargo on PATH",
  });
  let binaryExists = true;
  try {
    await access(binaryPath);
  } catch {
    binaryExists = false;
  }
  checks.push({
    name: "E2E binary",
    ok: binaryExists,
    detail: binaryExists
      ? binaryPath
      : `${binaryPath} missing; run pnpm e2e:build`,
  });
  if (binaryExists) {
    const hasHarnessMarker = await binaryContains(
      binaryPath,
      "e2e-harness builds require an E2E configuration",
    );
    checks.push({
      name: "E2E binary feature",
      ok: hasHarnessMarker,
      detail: hasHarnessMarker
        ? "binary contains the e2e-harness feature marker"
        : "binary is not an E2E build; run pnpm e2e:build",
    });
  }
  if (selectedProvider === "external") {
    checks.push({
      name: "tauri-driver",
      ok: commandExists("tauri-driver", "--version"),
      detail: "external provider requires tauri-driver on PATH",
    });
  }
  for (const check of checks) {
    console.log(`${check.ok ? "PASS" : "FAIL"} ${check.name}: ${check.detail}`);
  }
  if (checks.some((check) => !check.ok)) process.exitCode = 1;
};

const run = async (): Promise<void> => {
  const result = await runE2eWorld({
    provider: provider(),
    runId: `local-${Date.now()}`,
    caseId: parseScenarioId(valueAfter("--case")),
    attempt: 1,
    binaryPath: valueAfter("--binary"),
    retainPassedWorld: argumentsList.includes("--keep"),
  });
  console.log(
    `${result.passed ? "PASS" : "FAIL"} in ${(result.elapsedMs / 1000).toFixed(1)}s`,
  );
  if (!result.passed) {
    console.log(`Retained failure world: ${result.worldDirectory}`);
    process.exitCode = 1;
  } else if (argumentsList.includes("--keep")) {
    console.log(`Retained requested world: ${result.worldDirectory}`);
  }
};

const qualify = async (): Promise<void> => {
  const selectedProvider = provider();
  const runId = `qualification-${selectedProvider}-${Date.now()}`;
  for (let attempt = 1; attempt <= 10; attempt += 1) {
    const result = await runE2eWorld({
      provider: selectedProvider,
      runId,
      caseId: parseScenarioId(valueAfter("--case")),
      attempt,
      binaryPath: valueAfter("--binary"),
    });
    if (!result.passed) {
      console.error(
        `Qualification stopped at fresh run ${attempt}; retained ${result.worldDirectory}`,
      );
      process.exitCode = 1;
      return;
    }
    console.log(
      `Fresh run ${attempt}/10 passed in ${(result.elapsedMs / 1000).toFixed(1)}s`,
    );
  }
  const timeoutResult = await runE2eWorld({
    provider: selectedProvider,
    runId,
    caseId: "about-smoke",
    attempt: 11,
    binaryPath: valueAfter("--binary"),
    intentionalTimeout: true,
  });
  if (!timeoutResult.passed || !timeoutResult.expectedFailureObserved) {
    console.error(
      `Intentional timeout did not fail as expected; retained ${timeoutResult.worldDirectory}`,
    );
    process.exitCode = 1;
    return;
  }
  console.log(
    `PASS ${selectedProvider}: 10/10 fresh runs and intentional-timeout teardown`,
  );
};

if (command === "doctor") await doctor();
else if (command === "run") await run();
else if (command === "qualify") await qualify();
else throw new Error(`Unknown E2E command '${command}'`);

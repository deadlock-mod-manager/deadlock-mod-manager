import { expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const runCli = (args: string[]) =>
  spawnSync("node", ["--import", "tsx", "e2e/cli.ts", ...args], {
    cwd: fileURLToPath(new URL("../", import.meta.url)),
    encoding: "utf8",
    windowsHide: true,
    timeout: 10_000,
  });

it.skipIf(process.platform === "win32")(
  "rejects Windows-only cases before creating a world",
  () => {
    const result = runCli(["run", "--case", "local-mod-lifecycle"]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("supports win32");
    expect(result.stdout).toBe("");
  },
);

// Native-input cases are only registered on Windows.
it.skipIf(process.platform !== "win32")(
  "rejects a native-input suite before executing even its first smoke case",
  () => {
    const result = runCli([
      "run",
      "--suite",
      "all",
      "--binary",
      "missing-harness.exe",
    ]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("--allow-native-input");
    expect(result.stderr).toContain("local-mod-lifecycle");
    expect(result.stdout).toBe("");
  },
);

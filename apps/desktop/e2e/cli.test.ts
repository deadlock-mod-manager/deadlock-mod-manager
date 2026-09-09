import { expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

it("rejects a native-input suite before executing even its first smoke case", () => {
  const result = spawnSync(
    "node",
    [
      "--import",
      "tsx",
      "e2e/cli.ts",
      "run",
      "--suite",
      "all",
      "--binary",
      "missing-harness.exe",
    ],
    {
      cwd: fileURLToPath(new URL("../", import.meta.url)),
      encoding: "utf8",
      windowsHide: true,
      timeout: 10_000,
    },
  );
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("--allow-native-input");
  expect(result.stderr).toContain("local-mod-lifecycle");
  expect(result.stdout).toBe("");
});

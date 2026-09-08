import { afterEach, describe, expect, it } from "bun:test";
import path from "node:path";
import { access, readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import {
  assertOwnedWorld,
  collectFileInventory,
  createWorld,
  removeOwnedWorld,
} from "./world";

const worlds: string[] = [];

afterEach(async () => {
  for (const world of worlds.splice(0)) {
    await removeOwnedWorld(world);
  }
});

describe("isolated E2E worlds", () => {
  it.skipIf(process.platform !== "win32")(
    "waits for a Windows file lock instead of omitting the file",
    async () => {
      const world = await createWorld({
        runId: "unit-run",
        caseId: "file-lock",
        attempt: 1,
        fixtureOrigin: "http://127.0.0.1:43123",
      });
      worlds.push(world.directory);
      const filePath = path.join(world.configuration.roots.game, "locked.txt");
      await writeFile(filePath, "retained bytes");
      const scriptPath = path.join(world.artifactsDirectory, "hold-lock.ps1");
      await writeFile(
        scriptPath,
        'param([string]$FilePath)\n$stream = [IO.File]::Open($FilePath, [IO.FileMode]::Open, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)\ntry { [Console]::WriteLine("locked"); Start-Sleep -Milliseconds 800 } finally { $stream.Dispose() }\n',
      );
      const child = spawn(
        "powershell.exe",
        ["-NoProfile", "-NonInteractive", "-File", scriptPath, filePath],
        { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
      );
      const closed = new Promise<void>((resolve) =>
        child.once("close", () => resolve()),
      );
      try {
        await new Promise<void>((resolve, reject) => {
          child.stdout.once("data", () => resolve());
          child.once("error", reject);
          child.once("exit", (code) => {
            if (code !== 0)
              reject(new Error("Could not acquire Windows file lock"));
          });
        });
        const inventory = await collectFileInventory(
          world.configuration.roots.game,
        );
        expect(inventory["locked.txt"]).toMatch(/^14:/);
      } finally {
        if (child.exitCode === null) child.kill();
        await closed;
      }
    },
  );

  it("creates every configured path beneath an owned world", async () => {
    const world = await createWorld({
      runId: "unit-run",
      caseId: "world-contract",
      attempt: 1,
      fixtureOrigin: "http://127.0.0.1:43123",
    });
    worlds.push(world.directory);
    const manifest = await assertOwnedWorld(world.directory);
    expect(manifest.configuration.roots.world).toBe(
      path.resolve(world.directory),
    );
    expect(
      Object.values(manifest.configuration.roots).every((root) =>
        root.startsWith(world.directory),
      ),
    ).toBe(true);
    const state = await readFile(
      path.join(world.configuration.roots.appData, "state.json"),
      "utf8",
    );
    expect(state).toContain("hasCompletedOnboarding");
    await access(path.join(world.configuration.roots.steam, "steam.exe"));
  });

  it("records content changes with relative paths and hashes", async () => {
    const world = await createWorld({
      runId: "unit-run",
      caseId: "inventory",
      attempt: 1,
      fixtureOrigin: "http://127.0.0.1:43123",
    });
    worlds.push(world.directory);
    const before = await collectFileInventory(world.configuration.roots.game);
    await writeFile(
      path.join(world.configuration.roots.game, "change.txt"),
      "changed",
    );
    const after = await collectFileInventory(world.configuration.roots.game);
    expect(before["change.txt"]).toBeUndefined();
    expect(after["change.txt"]).toMatch(/^7:/);
  });

  it("refuses cleanup when the ownership marker was changed", async () => {
    const world = await createWorld({
      runId: "unit-run",
      caseId: "ownership",
      attempt: 1,
      fixtureOrigin: "http://127.0.0.1:43123",
    });
    worlds.push(world.directory);
    const manifest = await readFile(world.manifestPath, "utf8");
    await writeFile(
      world.manifestPath,
      manifest.replace("dmm-e2e-harness", "someone-else"),
    );
    await expect(removeOwnedWorld(world.directory)).rejects.toThrow("unowned");
    await writeFile(world.manifestPath, manifest);
  });
});

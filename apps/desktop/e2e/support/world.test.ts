import { afterEach, describe, expect, it } from "bun:test";
import path from "node:path";
import { access, readFile, writeFile } from "node:fs/promises";
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

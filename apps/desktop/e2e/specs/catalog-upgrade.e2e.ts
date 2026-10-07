import { browser } from "@wdio/globals";
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { startApplication } from "../support/application";
import { closeApplication } from "../support/application-exit";
import { assertUpgradedCatalog } from "../support/catalog-upgrade-fixtures";
import { contentMods } from "../support/content-fixtures";
import { step } from "../support/evidence";
import { observeUntil } from "../support/observations";
import { navigate, waitForDisplayed } from "../support/ui";
import { assertOwnedWorld } from "../support/world";

const inspectCatalog = async () =>
  browser.execute(() =>
    // oxlint-disable-next-line no-underscore-dangle -- Tauri's injected IPC global.
    window.__TAURI_INTERNALS__.invoke<{
      available: boolean;
      unavailableReason: string | null;
      count: number;
      lastFullSyncAt: number | null;
      syncPhase: string | null;
    }>("inspect_gamebanana_catalog_state"),
  );

describe("legacy catalog upgrade", () => {
  it("preserves the catalog, resumes sync, and survives a restart", async () => {
    const runtime = await startApplication();
    const world = runtime.roots.world;
    const { configuration } = await assertOwnedWorld(world);
    const checkpoint = path.join(
      world,
      "artifacts",
      "catalog-upgrade-process.json",
    );
    if (process.env.DMM_E2E_PHASE === "restart-upgrade") {
      const previous = z
        .object({ processId: z.number() })
        .parse(JSON.parse(await readFile(checkpoint, "utf8")));
      assert.notEqual(runtime.processId, previous.processId);
    } else {
      await writeFile(
        checkpoint,
        JSON.stringify({ processId: runtime.processId }),
      );
    }
    await step("the legacy catalog opens and sync completes", async () => {
      const initial = await inspectCatalog();
      assert.equal(
        initial.available,
        true,
        initial.unavailableReason ?? "Catalog unavailable",
      );
      await observeUntil(
        "Catalog sync completes after upgrade",
        inspectCatalog,
        (state) =>
          state.available &&
          state.count === contentMods.length &&
          state.lastFullSyncAt !== null &&
          state.syncPhase === null,
      );
    });
    await navigate("mods");
    await step("cached and newly synced mods are visible", async () => {
      for (const mod of contentMods) {
        await waitForDisplayed(`[title="${mod.name}"]`);
      }
    });
    await closeApplication(world, runtime.processId);
    assertUpgradedCatalog(configuration.roots.appData);
  });
});

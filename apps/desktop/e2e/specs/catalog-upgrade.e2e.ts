import { $, browser, expect } from "@wdio/globals";
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
    await step(
      "backfilled World descendants filter the upgraded catalog",
      async () => {
        await $('button[aria-label="Category"]').click();
        await $('[cmdk-item][data-value="browse:mod:33154"]').click();
        await expect($(`[title="${contentMods[1].name}"]`)).toBeDisplayed();
        const worldChip =
          '//*[@data-slot="badge" and normalize-space()="Category: World"]';
        await expect($(worldChip)).not.toExist();
        await $('[cmdk-item][data-value="mod:33154"]').click();
        await expect($(worldChip)).toBeDisplayed();
        await $('[cmdk-item][data-value="browse:mod:44691"]').click();
        await expect($(worldChip)).toBeDisplayed();
        await $('[cmdk-item][data-value="mod:44458"]').click();
        const walkerChip =
          '//*[@data-slot="badge" and normalize-space()="Category: World / NPCs / Walker"]';
        await expect($(walkerChip)).toBeDisplayed();
        await expect($(worldChip)).not.toExist();

        await $('[cmdk-item][data-value="mod:44691"]').click();
        await expect(
          $('button[aria-label="Remove Walker filter"]'),
        ).not.toExist();
        await expect(
          $('button[aria-label="Remove NPCs filter"]'),
        ).toBeDisplayed();
        await $('[cmdk-item][data-value="mod:44458"]').click();
        await expect(
          $('button[aria-label="Remove NPCs filter"]'),
        ).not.toExist();
        await expect($(walkerChip)).toBeDisplayed();
        await browser.keys("Escape");
        await waitForDisplayed(`[title="${contentMods[0].name}"]`);
        await expect($(`[title="${contentMods[1].name}"]`)).not.toExist();
        await $('button[aria-label="Remove Walker filter"]').click();
        await waitForDisplayed(`[title="${contentMods[1].name}"]`);
      },
    );
    await step(
      "skin categories link to the Hero filter and clear together",
      async () => {
        await $('button[aria-label="Category"]').click();
        await $(
          '//nav[@aria-label="Category path"]/button[normalize-space()="Category"]',
        ).click();
        await $('[cmdk-item][data-value="browse:mod:33295"]').click();
        await $('[cmdk-item][data-value="browse:mod:920010"]').click();
        await expect($('button[aria-label="Hero"] .truncate')).toHaveText(
          "All Heroes",
        );
        await $('[cmdk-item][data-value="mod:920010"]').click();
        const skinsChip =
          '//*[@data-slot="badge" and normalize-space()="Category: Skins"]';
        const heroChip =
          '//*[@data-slot="badge"][button[@aria-label="Remove Infernus hero filter"]]';
        await expect($(skinsChip)).toBeDisplayed();
        await expect($(heroChip)).toBeDisplayed();
        await expect($('button[aria-label="Hero"] .truncate')).toHaveText(
          "Infernus",
        );
        await expect(
          $('button[aria-label="Remove Infernus filter"]'),
        ).not.toExist();
        await browser.keys("Escape");
        await waitForDisplayed(`[title="${contentMods[1].name}"]`);
        await expect($(`[title="${contentMods[0].name}"]`)).not.toExist();
        await $('button[aria-label="Remove Infernus hero filter"]').click();
        await expect($(heroChip)).not.toExist();
        await expect($('button[aria-label="Hero"] .truncate')).toHaveText(
          "All Heroes",
        );
        await expect($(skinsChip)).toBeDisplayed();
        await expect($(`[title="${contentMods[0].name}"]`)).not.toExist();

        await $('button[aria-label="Category"]').click();
        await $('[cmdk-item][data-value="mod:920011"]').click();
        await expect(
          $('button[aria-label="Remove Faithful filter"]'),
        ).toBeDisplayed();
        await expect($(heroChip)).toBeDisplayed();
        await expect($('button[aria-label="Hero"] .truncate')).toHaveText(
          "Infernus",
        );
        await browser.keys("Escape");

        await $('button[aria-label="Hero"]').click();
        await $('//*[@cmdk-item and normalize-space()="Clear all"]').click();
        await browser.keys("Escape");
        await expect(
          $('button[aria-label="Remove Faithful filter"]'),
        ).not.toExist();
        await expect($(heroChip)).not.toExist();
        await expect($('button[aria-label="Hero"] .truncate')).toHaveText(
          "All Heroes",
        );
        await expect($(skinsChip)).toBeDisplayed();
        await waitForDisplayed(`[title="${contentMods[1].name}"]`);
        await expect($(`[title="${contentMods[0].name}"]`)).not.toExist();
        await $(`${skinsChip}/button`).click();
        await waitForDisplayed(`[title="${contentMods[0].name}"]`);
      },
    );
    await closeApplication(world, runtime.processId);
    assertUpgradedCatalog(configuration.roots.appData);
  });
});

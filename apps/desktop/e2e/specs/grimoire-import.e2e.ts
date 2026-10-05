import { $, $$, browser, expect } from "@wdio/globals";
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { startApplication } from "../support/application";
import { closeApplication } from "../support/application-exit";
import { step } from "../support/evidence";
import {
  CASUAL_PROFILE_IMPORTED,
  grimoireFixtureMods,
  LINKED_OVERFLOW_ID,
  LINKED_OVERFLOW_NAME,
  LOADOUT_PROFILE,
} from "../support/interchange-fixtures";
import {
  assertGrimoireImported,
  derivedModId,
  finalModId,
  readInterchangeState,
} from "../support/interchange-oracle";
import { observeUntil } from "../support/observations";
import { navigate } from "../support/ui";
import { assertOwnedWorld } from "../support/world";

const checkpointSchema = z.object({ processId: z.number() });

const wizard = () => $('[data-testid="interchange-wizard"]');

const waitForStep = async (stepName: string, timeout = 60_000) => {
  await browser.waitUntil(
    async () => (await wizard().getAttribute("data-step")) === stepName,
    { timeout, timeoutMsg: `Import wizard did not reach step ${stepName}` },
  );
};

/** Radix menus open on keyboard input under the embedded driver. */
const openGrimoireImport = async () => {
  const menu = await $('[data-testid="interchange-import-menu"]');
  await menu.waitForClickable();
  await menu.click();
  await expect(menu).toBeFocused();
  await browser.keys("ArrowDown");
  await expect(menu).toHaveAttribute("aria-expanded", "true");
  const item = await $('[data-testid="interchange-source-grimoire"]');
  await item.waitForDisplayed();
  await item.click();
  await wizard().waitForDisplayed();
  await waitForStep("contents");
};

const checked = async (testId: string) =>
  (await $(`[data-testid="${testId}"]`).getAttribute("data-state")) ===
  "checked";

describe("Grimoire import", () => {
  it("transfers mods, profiles and crosshairs and lets the user identify local mods", async () => {
    const phase = process.env.DMM_E2E_PHASE;
    assert(phase === "import" || phase === "restart-import");
    const runtime = await startApplication();
    const world = runtime.roots.world;
    const { configuration } = await assertOwnedWorld(world);
    const fixtures = grimoireFixtureMods(configuration.roots.game);
    const checkpointPath = path.join(
      world,
      "artifacts",
      "interchange-process.json",
    );

    await navigate("my-mods");

    if (phase === "import") {
      assert.deepEqual((await readInterchangeState(world)).localMods, []);

      await step("choose what to import", async () => {
        await openGrimoireImport();
        assert.equal(await checked("interchange-section-mods"), true);
        assert.equal(await checked("interchange-section-crosshairs"), true);
        // Profiles are opt-in: they copy every file once more per profile.
        assert.equal(await checked("interchange-section-profiles"), false);
        await $('[data-testid="interchange-section-profiles"]').click();
        assert.equal(await checked("interchange-section-profiles"), true);

        const profileRows = await $$('[data-testid="interchange-profile-row"]');
        assert.equal(profileRows.length, 2);

        await $('[data-testid="interchange-choose-mods"]').click();
        const keys = await $$('[data-testid="interchange-mod-row"]').map(
          (row) => row.getAttribute("data-key"),
        );
        assert.deepEqual(
          keys,
          fixtures.map((fixture) => fixture.key),
          "Rows follow Grimoire's load order",
        );
      });

      await step("import with progress", async () => {
        await $('[data-testid="interchange-next"]').click();
        await waitForStep("unrecognized", 120_000);
      });

      await step("identify the local mods", async () => {
        const rows = await $$(
          '[data-testid="interchange-unrecognized-row"]',
        ).map((row) => row.getAttribute("data-mod-id"));
        assert.deepEqual(
          [...rows].sort(),
          [derivedModId(fixtures[1]), derivedModId(fixtures[2])].sort(),
        );
        // The hash lookup finds nothing for these synthetic files.
        await $('[data-testid="interchange-analyze"]').click();
        await browser.waitUntil(
          async () =>
            await $('[data-testid="interchange-analyze"]').isEnabled(),
        );
        const overflowRow = await $(
          `[data-testid="interchange-unrecognized-row"][data-mod-id="${derivedModId(fixtures[2])}"]`,
        );
        await overflowRow
          .$('[data-testid="interchange-link-input"]')
          .setValue(`https://gamebanana.com/mods/${LINKED_OVERFLOW_ID}`);
        await overflowRow.$('[data-testid="interchange-link-button"]').click();
        await browser.waitUntil(
          async () =>
            (await overflowRow.getAttribute("data-linked")) === "true",
          { timeout: 30_000, timeoutMsg: "Manual link did not complete" },
        );
        // The drifted slot stays local: skip the rest.
        await $('[data-testid="interchange-finish"]').click();
        await waitForStep("done");
      });

      await step("summary and disk state", async () => {
        const summary = await $('[data-testid="interchange-summary"]');
        await expect(summary).toHaveAttribute("data-imported", "7");
        await expect(summary).toHaveAttribute("data-skipped", "0");
        await expect(summary).toHaveAttribute("data-failed", "0");
        await expect(summary).toHaveAttribute("data-profiles", "2");
        await expect(summary).toHaveAttribute("data-crosshairs", "2");
        await $('[data-testid="interchange-close"]').click();
        await expect(wizard()).not.toExist();
        await observeUntil(
          "Linked and imported state was not persisted",
          () => readInterchangeState(world),
          (state) =>
            Object.keys(state.profiles).length === 3 &&
            state.localMods.some((mod) => mod.name === LINKED_OVERFLOW_NAME),
          30_000,
        );
        await assertGrimoireImported(world, "imported");
      });

      await step("a second import offers nothing new", async () => {
        await openGrimoireImport();
        // Everything that is left is already in the library (the overflow mod
        // through the import ledger, since its id changed when it was linked).
        assert.equal(
          await $('[data-testid="interchange-section-mods"]').isEnabled(),
          false,
        );
        await $('[data-testid="interchange-section-crosshairs"]').click();
        assert.equal(
          await $('[data-testid="interchange-next"]').isEnabled(),
          false,
        );
        await browser.keys("Escape");
        await expect(wizard()).not.toExist();
        await assertGrimoireImported(world, "reopened");
      });

      await writeFile(
        checkpointPath,
        JSON.stringify({ processId: runtime.processId }),
      );
    } else {
      const checkpoint = checkpointSchema.parse(
        JSON.parse(await readFile(checkpointPath, "utf8")),
      );
      expect(runtime.processId).not.toBe(checkpoint.processId);
      await step("the library survives a restart", async () => {
        const state = await readInterchangeState(world);
        const active = state.profiles[state.activeProfileId];
        assert.deepEqual(
          active.mods.map((mod) => mod.remoteId).sort(),
          fixtures.map(finalModId).sort(),
        );
        assert.deepEqual(
          Object.values(state.profiles)
            .map((profile) => profile.name)
            .sort(),
          ["Default Profile", CASUAL_PROFILE_IMPORTED, LOADOUT_PROFILE].sort(),
        );
        await expect($(`[title="${LINKED_OVERFLOW_NAME}"]`)).toExist();
        await assertGrimoireImported(world, "restarted");
      });
    }

    await closeApplication(world, runtime.processId);
    await assertGrimoireImported(world, `closed-${phase}`);
  });
});

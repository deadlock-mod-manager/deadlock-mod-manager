import { $, $$, browser, expect } from "@wdio/globals";
import assert from "node:assert/strict";
import { readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { startApplication } from "../support/application";
import { closeApplication } from "../support/application-exit";
import { step } from "../support/evidence";
import {
  grimoireFixtureMods,
  lateLocalMod,
  LINKED_OVERFLOW_ID,
  LINKED_OVERFLOW_NAME,
  LOADOUT_PROFILE,
  reshuffleGrimoireWorld,
} from "../support/interchange-fixtures";
import {
  assertGrimoireImported,
  assertGrimoireReimported,
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
    assert(
      phase === "import" || phase === "restart-import" || phase === "reimport",
    );
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
        // The default profile's only mod is already there from the library.
        await expect(summary).toHaveAttribute("data-imported", "6");
        await expect(summary).toHaveAttribute("data-skipped", "1");
        await expect(summary).toHaveAttribute("data-failed", "0");
        await expect(summary).toHaveAttribute("data-profiles", "2");
        await expect(summary).toHaveAttribute("data-crosshairs", "2");
        await $('[data-testid="interchange-close"]').click();
        await expect(wizard()).not.toExist();
        await observeUntil(
          "Linked and imported state was not persisted",
          () => readInterchangeState(world),
          (state) =>
            Object.keys(state.profiles).length === 2 &&
            state.localMods.some((mod) => mod.name === LINKED_OVERFLOW_NAME),
          30_000,
        );
        await assertGrimoireImported(world, "imported");
      });

      await step("a second import offers nothing new", async () => {
        await openGrimoireImport();
        // Files DMM took over resolve through its store, including the overflow
        // mod under the GameBanana id the user assigned to it.
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
    } else if (phase === "restart-import") {
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
          ["Default Profile", LOADOUT_PROFILE].sort(),
        );
        await expect($(`[title="${LINKED_OVERFLOW_NAME}"]`)).toExist();
        await assertGrimoireImported(world, "restarted");
      });

      await step("restore an imported sound from its cached VPK", async () => {
        const sound = fixtures[3];
        const soundId = finalModId(sound, 3);
        const addons = path.join(
          configuration.roots.game,
          "game/citadel/addons",
        );
        await rm(path.join(addons, `${soundId}_e2e_parked_sound_dir.vpk`));
        await observeUntil(
          "The imported sound stays in the library with a missing-file warning",
          () => readInterchangeState(world),
          (state) =>
            state.localMods.some(
              (mod) =>
                mod.remoteId === soundId && mod.missingVpks?.length === 1,
            ),
        );
        const soundSwitch = () =>
          $(
            `//*[@title="${sound.name}"]/ancestor::*[.//*[@role="switch"]][1]//*[@role="switch"]`,
          );
        await soundSwitch().waitForClickable();
        await soundSwitch().click();
        await expect(soundSwitch()).toHaveAttribute("aria-checked", "true");
        const enabled = await observeUntil(
          "The imported sound is enabled from its cached VPK",
          () => readInterchangeState(world),
          (state) =>
            state.localMods.some(
              (mod) =>
                mod.remoteId === soundId &&
                mod.status === "installed" &&
                mod.installedVpks?.length === 1,
            ),
        );
        const installed = enabled.localMods.find(
          (mod) => mod.remoteId === soundId,
        );
        assert.equal(installed?.installedVpks?.length, 1);
        assert.deepEqual(
          await readFile(path.join(addons, installed.installedVpks[0])),
          sound.bytes,
        );
        await soundSwitch().waitForClickable();
        await soundSwitch().click();
        await expect(soundSwitch()).toHaveAttribute("aria-checked", "false");
        await observeUntil(
          "The restored sound is disabled again",
          () => readInterchangeState(world),
          (state) =>
            state.localMods.some(
              (mod) => mod.remoteId === soundId && mod.status === "downloaded",
            ),
        );
        await assertGrimoireImported(world, "restored-sound");
      });
    } else {
      const late = lateLocalMod(configuration.roots.game);

      await step("Grimoire reshuffles the shared folder", async () => {
        await reshuffleGrimoireWorld(
          world,
          configuration.roots.game,
          finalModId(fixtures[3], 3),
        );
      });

      await step("only the mod added in Grimoire is new", async () => {
        await openGrimoireImport();
        await $('[data-testid="interchange-choose-mods"]').click();
        const rows = await $$('[data-testid="interchange-mod-row"]').map(
          async (row) => ({
            key: await row.getAttribute("data-key"),
            inLibrary: await row.getAttribute("data-in-library"),
          }),
        );
        assert.deepEqual(
          rows.filter((row) => row.inLibrary !== "true").map((row) => row.key),
          [late.key],
          "Swapped slots and moved DMM files must not be offered again",
        );
        assert.equal(
          (await $$('[data-testid="interchange-profile-row"]')).length,
          2,
        );
        await $('[data-testid="interchange-section-profiles"]').click();
        assert.equal(await checked("interchange-section-profiles"), true);
        await $('[data-testid="interchange-section-crosshairs"]').click();
        assert.equal(await checked("interchange-section-crosshairs"), false);
      });

      await step("the re-import fills the original profiles", async () => {
        await $('[data-testid="interchange-next"]').click();
        await waitForStep("unrecognized", 120_000);
        const unrecognized = await $$(
          '[data-testid="interchange-unrecognized-row"]',
        ).map((row) => row.getAttribute("data-mod-id"));
        assert.deepEqual(unrecognized, [derivedModId(late)]);
        await $('[data-testid="interchange-finish"]').click();
        await waitForStep("done");

        const summary = await $('[data-testid="interchange-summary"]');
        await expect(summary).toHaveAttribute("data-imported", "2");
        await expect(summary).toHaveAttribute("data-skipped", "3");
        await expect(summary).toHaveAttribute("data-failed", "0");
        await expect(summary).toHaveAttribute("data-profiles", "2");
        await expect(summary).toHaveAttribute("data-crosshairs", "0");
        await $('[data-testid="interchange-close"]').click();
        await expect(wizard()).not.toExist();
        await observeUntil(
          "The re-import was not persisted",
          () => readInterchangeState(world),
          (state) =>
            Object.values(state.profiles).every((profile) =>
              profile.name === LOADOUT_PROFILE
                ? profile.mods.some(
                    (mod) => mod.remoteId === derivedModId(late),
                  )
                : true,
            ),
          30_000,
        );
        await assertGrimoireReimported(world, "reimported");
      });
    }

    await closeApplication(world, runtime.processId);
    if (phase === "reimport") {
      await assertGrimoireReimported(world, `closed-${phase}`);
    } else {
      await assertGrimoireImported(world, `closed-${phase}`);
    }
  });
});

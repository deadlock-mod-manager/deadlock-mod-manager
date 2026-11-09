import assert from "node:assert/strict";
import { copyFile, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { $, browser } from "@wdio/globals";
import { z } from "zod";
import { startApplication } from "../support/application";
import { closeApplication } from "../support/application-exit";
import { step } from "../support/evidence";
import {
  badgeStatus,
  fixAllInDialog,
  readHealth,
  readRepairState,
  waitForStatus,
} from "../support/fixed-status";
import {
  FIXED_MOD,
  HAND_PLACED,
  NON_LOADED,
  handPlacedBytes,
} from "../support/non-loaded-file-fixtures";
import { observeUntil } from "../support/observations";
import { navigate, waitForOverlaysClosed } from "../support/ui";
import { assertOwnedWorld } from "../support/world";

const RESULTS =
  '//div[@role="dialog"][.//h2[normalize-space()="Local Addon Analysis"]]';

const profileDirectory = async (world: string) => {
  const {
    configuration: { roots },
  } = await assertOwnedWorld(world);
  return path.join(roots.game, "game", "citadel", "addons", NON_LOADED.folder);
};

const readManifest = async (world: string) =>
  z
    .object({
      mods: z.record(
        z.string(),
        z.object({
          currentVpks: z.array(z.string()),
        }),
      ),
    })
    .parse(
      JSON.parse(
        await readFile(
          path.join(await profileDirectory(world), ".dmm.json"),
          "utf8",
        ),
      ),
    ).mods;

const observeRepair = async (world: string) => {
  const repairs = await readRepairState(world, NON_LOADED.folder);
  return {
    health: (await readHealth(NON_LOADED.folder))[FIXED_MOD],
    packageExists: repairs.packageExists,
    repairedMods: repairs.repairedMods,
  };
};

const card = (fileName: string) =>
  $(
    `${RESULTS}//p[normalize-space()="${fileName}"]/ancestor::div[contains(@class,"rounded-lg")][1]`,
  );

const runAnalyze = async () => {
  await navigate("my-mods");
  await waitForOverlaysClosed();
  await $('button[aria-label="More actions"]').click();
  await browser.keys("ArrowDown");
  await $('[role="menuitem"]=Analyze Local Addons').click();
};

/** What the profile looks like once the background repair refresh settles. */
const settled = async (world: string) => {
  await observeUntil(
    "repair rebuilt",
    () => observeRepair(world),
    (state) => state.health === "fixed" && state.packageExists,
    20_000,
  ).catch(() => null);
  const recorded = await readManifest(world);
  return {
    recorded: Object.fromEntries(
      Object.entries(recorded).map(([modId, entry]) => [
        modId,
        entry.currentVpks,
      ]),
    ),
    ...(await observeRepair(world)),
    badge: await badgeStatus(FIXED_MOD),
  };
};

describe("A hand-placed file the game doesn't load", () => {
  it("is never recorded as a mod's enabled file", async () => {
    const runtime = await startApplication();
    const world = runtime.roots.world;
    const directory = await profileDirectory(world);
    await navigate("my-mods");

    await step("fix the mod", async () => {
      await waitForStatus(NON_LOADED.folder, FIXED_MOD, "fixable");
      await fixAllInDialog();
      await waitForStatus(NON_LOADED.folder, FIXED_MOD, "fixed");
      await browser.keys("Escape");
      await waitForOverlaysClosed();
    });

    await step(`put ${HAND_PLACED} in the profile by hand`, () =>
      process.env.DMM_E2E_PHASE === "add-to-library"
        ? writeFile(path.join(directory, HAND_PLACED), handPlacedBytes())
        : // A second copy of the installed mod, which the hash service knows.
          copyFile(
            path.join(directory, "pak01_dir.vpk"),
            path.join(directory, HAND_PLACED),
          ),
    );

    await step(`Analyze lists ${HAND_PLACED} as not loaded`, async () => {
      await runAnalyze();
      const file = card(HAND_PLACED);
      await file.waitForDisplayed();
      await file.$("p=Not loaded by Deadlock").waitForDisplayed();
      // Its actions unlock once Analyze has registered what it found.
      await file.$("button=Quarantine").waitForEnabled();
      assert.equal(await file.$("button=Add to Library").isExisting(), false);
      await browser.saveScreenshot(
        path.join(world, "artifacts", "non-loaded-results.png"),
      );
      await $(`${RESULTS}//button[.//span[normalize-space()="Close"]]`).click();
      await waitForOverlaysClosed();
    });

    const after = await step("the profile once repairs settle", () =>
      settled(world),
    );
    assert.deepEqual(after, {
      recorded: { [FIXED_MOD]: ["pak01_dir.vpk"] },
      health: "fixed",
      packageExists: true,
      repairedMods: [FIXED_MOD],
      badge: "fixed",
    });

    await closeApplication(world, runtime.processId);
  });
});

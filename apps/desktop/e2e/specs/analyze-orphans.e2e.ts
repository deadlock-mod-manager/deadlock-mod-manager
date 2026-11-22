import assert from "node:assert/strict";
import { access, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { $, browser } from "@wdio/globals";
import { z } from "zod";
import { startApplication } from "../support/application";
import { closeApplication } from "../support/application-exit";
import { LEFTOVERS, leftoverBytes } from "../support/analyze-orphans-fixtures";
import { step } from "../support/evidence";
import { CATALOG_MOD_ID } from "../support/gamebanana-fixtures";
import { observeUntil, readPersistedDocument } from "../support/observations";
import { resetProfileDirectory } from "../support/rescan-after-reset-fixtures";
import {
  navigate,
  waitForDisplayed,
  waitForOverlaysClosed,
} from "../support/ui";

const [QUARANTINED, ADDED] = LEFTOVERS;
const STRAY = "pak04_dir.vpk";
const RESULTS =
  '//div[@role="dialog"][.//h2[normalize-space()="Local Addon Analysis"]]';

const library = async (world: string) =>
  z
    .object({
      state: z.looseObject({
        localMods: z.array(
          z.looseObject({ remoteId: z.string(), status: z.string() }),
        ),
      }),
    })
    .parse(await readPersistedDocument(world)).state.localMods;

const catalogEntries = async (world: string) =>
  (await library(world)).filter((mod) => mod.remoteId === CATALOG_MOD_ID);

const exists = (file: string) =>
  access(file).then(
    () => true,
    () => false,
  );

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

/** Analyze, expecting the review list to name `fileName`. */
const analyzeForReview = (fileName: string) =>
  step(`Analyze lists ${fileName} for review`, async () => {
    await runAnalyze();
    await waitForDisplayed(`${RESULTS}//p[normalize-space()="${fileName}"]`);
  });

const closeResults = async () => {
  await $(`${RESULTS}//button[.//span[normalize-space()="Close"]]`).click();
  await waitForOverlaysClosed();
};

/** Analyze, expecting every file to be accounted for: a toast, no review. */
const analyzeWithoutReview = (label: string) =>
  step(label, async () => {
    await runAnalyze();
    await waitForDisplayed(
      '//*[contains(normalize-space(),"were automatically identified")]',
    );
    assert.equal(await $(RESULTS).isExisting(), false);
  });

const press = async (fileName: string, action: string) => {
  const button = await card(fileName).$(`button=${action}`);
  // Disabled until Analyze finishes registering what it found.
  await button.waitForEnabled();
  await button.click();
};

const fileLeavesResults = (fileName: string) =>
  browser.waitUntil(async () => !(await card(fileName).isExisting()), {
    timeoutMsg: `${fileName} stayed in the results`,
  });

describe("Analyze and parked files whose mod left the library", () => {
  it("asks before bringing a mod back and acts only on the chosen file", async () => {
    const runtime = await startApplication();
    const world = runtime.roots.world;
    const directory = resetProfileDirectory(world);
    const quarantine = path.join(directory, ".dmm-quarantine");
    await navigate("my-mods");

    if (process.env.DMM_E2E_PHASE === "orphans") {
      await step("delete the catalog mod's files outside DMM", async () => {
        await rm(path.join(directory, "pak01_dir.vpk"));
        await rm(path.join(directory, "pak02_dir.vpk"));
        await observeUntil(
          "the catalog mod never left the library",
          () => catalogEntries(world),
          (entries) => entries.length === 0,
          30_000,
        );
      });

      await analyzeForReview(QUARANTINED);
      await step("the leftover's mod stays out of the library", async () => {
        await card(ADDED).$("button=Add to Library").waitForDisplayed();
        await card(STRAY).$("button=Quarantine").waitForDisplayed();
        assert.deepEqual(await catalogEntries(world), []);
      });

      await step("quarantine one leftover", async () => {
        await press(QUARANTINED, "Quarantine");
        await fileLeavesResults(QUARANTINED);
        assert.equal(await exists(path.join(directory, QUARANTINED)), false);
        assert.deepEqual(
          await readFile(path.join(quarantine, QUARANTINED)),
          leftoverBytes(QUARANTINED),
        );
      });

      await step("delete the unknown file", async () => {
        await press(STRAY, "Delete");
        await $('[role="alertdialog"]').$("button=Delete").click();
        await fileLeavesResults(STRAY);
        assert.equal(await exists(path.join(directory, STRAY)), false);
      });
      await browser.saveScreenshot(
        path.join(world, "artifacts", "analyze-orphans-actions.png"),
      );
      await closeResults();

      await analyzeForReview(ADDED);
      await step("nothing the user handled comes back", async () => {
        assert.equal(await card(QUARANTINED).isExisting(), false);
        assert.equal(await card(STRAY).isExisting(), false);
        assert.deepEqual(await catalogEntries(world), []);
      });

      await step("add the other leftover's mod on request", async () => {
        await press(ADDED, "Add to Library");
        const entries = await observeUntil(
          "the catalog mod never reached the library",
          () => catalogEntries(world),
          (value) => value.length === 1,
        );
        assert.equal(entries[0]?.status, "downloaded");
        await card(ADDED).$("button=Add to Library").waitForExist({
          reverse: true,
        });
      });
      await closeResults();
      await analyzeWithoutReview("Analyze no longer asks about it");
    } else {
      await analyzeWithoutReview("after a restart, Analyze still adds nothing");
    }

    assert.equal((await catalogEntries(world)).length, 1);
    assert.equal(await exists(path.join(directory, STRAY)), false);
    assert.equal(await exists(path.join(directory, QUARANTINED)), false);
    assert.deepEqual(
      await readFile(path.join(quarantine, QUARANTINED)),
      leftoverBytes(QUARANTINED),
    );
    assert.deepEqual(
      await readFile(path.join(directory, ADDED)),
      leftoverBytes(ADDED),
    );
    await closeApplication(world, runtime.processId);
  });
});

import { $, browser, expect } from "@wdio/globals";
import assert from "node:assert/strict";
import path from "node:path";
import { startApplication } from "../support/application";
import { closeApplication } from "../support/application-exit";
import {
  COLLECTION_NAME,
  collectionMods,
} from "../support/collection-fixtures";
import { step } from "../support/evidence";
import { readCatalogState } from "../support/gamebanana-oracle";
import { observeUntil } from "../support/observations";
import { navigate, waitForDisplayed } from "../support/ui";

const [steady, flaky] = collectionMods;
const enabledSwitch = (name: string) =>
  `[role="switch"][aria-label="Enable mod ${name}"]`;
const inLibraryCount = () =>
  $('//span[normalize-space()="in library"]/preceding-sibling::span[1]');

const confirmDownload = async (label: string) => {
  await $(`button=${label}`).click();
  const dialog = await $('[role="alertdialog"]');
  await dialog.waitForDisplayed();
  await dialog.$(`button=${label}`).click();
  await expect(dialog).not.toBeDisplayed();
};

describe("collection downloads", () => {
  it("offers a mod whose download failed again and retries it", async () => {
    const runtime = await startApplication();
    const world = runtime.roots.world;
    const screenshot = (name: string) =>
      browser.saveScreenshot(
        path.join(world, "artifacts", `collection-${name}.png`),
      );

    await navigate("mods");
    await step("open the collection", async () => {
      const tab = await $('[role="tab"][id$="-trigger-collection"]');
      await tab.waitForClickable();
      await tab.click();
      if ((await tab.getAttribute("aria-selected")) !== "true") {
        await expect(tab).toBeFocused();
        await browser.keys("Enter");
      }
      await waitForDisplayed(`button*=${COLLECTION_NAME}`);
      await $(`button*=${COLLECTION_NAME}`).click();
      await waitForDisplayed(`h1=${COLLECTION_NAME}`);
      await expect(inLibraryCount()).toHaveText("0");
    });

    await step("download the collection while one file fails", async () => {
      await confirmDownload("Download 2 mods");
      await waitForDisplayed(enabledSwitch(steady.name));
      // The failed card offers its own retry, which this case leaves alone.
      await waitForDisplayed('button[aria-label="Retry"]');
      await screenshot("failed");
      await observeUntil(
        "Collection download outcome",
        async () =>
          Object.fromEntries(
            (await readCatalogState(world)).localMods.map((mod) => [
              mod.remoteId,
              mod.status,
            ]),
          ),
        (statuses) =>
          statuses[steady.id] === "downloaded" &&
          statuses[flaky.id] === "failedToDownload",
      );
    });

    await step("the failed mod is still offered for download", async () => {
      await expect(inLibraryCount()).toHaveText("1");
      await expect($("button=Download 1 mod")).toBeEnabled();
    });

    await step("downloading the collection again retries it", async () => {
      await confirmDownload("Download 1 mod");
      await waitForDisplayed(enabledSwitch(flaky.name));
      await expect(inLibraryCount()).toHaveText("2");
      await expect($("button=All in library")).toBeDisabled();
      await screenshot("retried");
    });

    await closeApplication(world, runtime.processId);
    assert.deepEqual(
      (await readCatalogState(world)).localMods.map((mod) => mod.status),
      ["downloaded", "downloaded"],
    );
  });
});

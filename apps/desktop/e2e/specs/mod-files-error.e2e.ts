import { $, $$, browser } from "@wdio/globals";
import assert from "node:assert/strict";
import path from "node:path";
import { startApplication } from "../support/application";
import { closeApplication } from "../support/application-exit";
import { step } from "../support/evidence";
import { CATALOG_MOD_NAME } from "../support/gamebanana-fixtures";
import { navigate, openFilesTab, waitForDisplayed } from "../support/ui";

const FILES_TAB = '[role="tab"][id$="-trigger-files"]';
const FILES_PANEL = '[role="tabpanel"][id$="-content-files"]';

// GameBanana's file list fails to load for a mod the user has not installed.
// The page must keep its Files tab, say the list failed, and offer a retry.
describe("Mod page file list failure", () => {
  it("keeps the Files tab and loads the files on retry", async () => {
    const runtime = await startApplication();
    const world = runtime.roots.world;
    const screenshot = (name: string) =>
      browser.saveScreenshot(path.join(world, "artifacts", `${name}.png`));
    await navigate("mods");
    await waitForDisplayed(`[title="${CATALOG_MOD_NAME}"]`);
    await $(`[title="${CATALOG_MOD_NAME}"]`).click();
    await waitForDisplayed(`//div[normalize-space()="${CATALOG_MOD_NAME}"]`);
    // The transport retries the failing request for a few seconds first.
    const kept = await browser
      .waitUntil(() => $(FILES_TAB).isExisting(), { timeout: 20_000 })
      .catch(() => false);
    if (!kept) {
      const tabs = await $$('[role="tab"]').map((tab) => tab.getText());
      await screenshot("mod-files-error");
      await closeApplication(world, runtime.processId);
      assert.fail(
        `The Files tab must stay visible with an error or retry; tabs shown: ${JSON.stringify(tabs)}`,
      );
    }
    await openFilesTab();
    await step("the Files tab reports the failed file list", async () => {
      await waitForDisplayed(
        `${FILES_PANEL} [data-testid="mod-files-load-error"]`,
      );
      assert.equal(
        await $(
          `${FILES_PANEL} [data-testid="mod-files-load-error"] p`,
        ).getText(),
        "Couldn't load the file list from GameBanana.",
      );
      assert.equal(
        await $(FILES_PANEL).$('[title="base.zip"]').isExisting(),
        false,
      );
      await screenshot("mod-files-error");
    });
    const retry = $(FILES_PANEL).$("button=Try again");
    await step("a failed retry keeps the error and Try again", async () => {
      await retry.click();
      await browser.waitUntil(async () => !(await retry.isEnabled()), {
        timeoutMsg: "Try again never showed the retry in flight",
      });
      // The transport retries the failing request for a few seconds first.
      await browser.waitUntil(() => retry.isEnabled(), {
        timeout: 20_000,
        timeoutMsg: "The failed retry never finished",
      });
      assert(
        await $(
          `${FILES_PANEL} [data-testid="mod-files-load-error"]`,
        ).isDisplayed(),
      );
      assert.equal(
        await $(FILES_PANEL).$('[title="base.zip"]').isExisting(),
        false,
      );
    });
    await step("Retry loads the file list", async () => {
      await retry.click();
      // The fixture delays the retried response; the tab and its error stay.
      await browser.waitUntil(async () => !(await retry.isEnabled()), {
        timeoutMsg: "Try again never showed the retry in flight",
      });
      assert(await $(FILES_TAB).isExisting());
      await screenshot("mod-files-retrying");
      await waitForDisplayed(`${FILES_PANEL} [title="base.zip"]`);
      assert.equal(
        await $(
          `${FILES_PANEL} [data-testid="mod-files-load-error"]`,
        ).isExisting(),
        false,
      );
      await screenshot("mod-files-retried");
    });
    await closeApplication(world, runtime.processId);
  });
});

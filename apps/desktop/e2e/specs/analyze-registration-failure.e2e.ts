import assert from "node:assert/strict";
import path from "node:path";
import { $, browser, expect } from "@wdio/globals";
import {
  analysisCard,
  readLibraryIds,
} from "../support/analysis-library-status-fixtures";
import { startApplication } from "../support/application";
import { closeApplication } from "../support/application-exit";
import { step } from "../support/evidence";
import { CATALOG_MOD_ID } from "../support/gamebanana-fixtures";
import { navigate, waitForDisplayed } from "../support/ui";

describe("Analyze when registering an identified mod fails", () => {
  it("lists the mod as not in the library beside the error", async () => {
    const runtime = await startApplication();
    const world = runtime.roots.world;

    await step("analyze the identified file", async () => {
      await navigate("my-mods");
      await waitForDisplayed("button=Analyze");
      await $("button=Analyze").click();
      await waitForDisplayed(
        `//div[@role="dialog"]//*[contains(normalize-space(), "Could not register ${CATALOG_MOD_ID}")]`,
      );
    });

    await step("the card doesn't claim the mod was added", async () => {
      const card = analysisCard("pak01_dir.vpk");
      await waitForDisplayed(card);
      await browser.saveScreenshot(
        path.join(world, "artifacts", "registration-failure.png"),
      );
      await expect($(card)).toHaveText(
        expect.stringContaining("Not in Library"),
      );
      await expect($(card)).not.toHaveText(
        expect.stringContaining("Added to Library"),
      );
    });

    await closeApplication(world, runtime.processId);
    const library = await readLibraryIds(world, "default");
    assert.ok(!library.active.includes(CATALOG_MOD_ID));
    assert.ok(!library.profile.includes(CATALOG_MOD_ID));
  });
});
